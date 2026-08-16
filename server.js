import express from 'express';
import dotenv from 'dotenv';
import * as db from './database/database.js'
import cors from 'cors'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { promises as fs } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);



dotenv.config();

const app = express();

app.use(cors())
app.use(express.static(__dirname + '/public'));
// Serve player page assets (script.js, styles.css) under /players/*
app.use('/players', express.static(__dirname + '/website/player'));
// Serve website content/images at /content so image URLs like /content/images/... work
app.use('/content', express.static(__dirname + '/website/content'));
// Serve team page assets under /team
app.use('/teams', express.static(__dirname + '/website/team'));
// Serve maps page assets under /map
app.use('/maps', express.static(__dirname + '/website/map'));
// Serve compare page assets under /compare
app.use('/compare', express.static(__dirname + '/website/compare'));
app.use('/home', express.static(__dirname + '/website/home'));

app.get('/', (req,res) => {
    res.sendFile('website/home/index.html', { root: __dirname });
});

app.get('/api/home', async (req, res) => {
    try {
        const [[matchCountRow]] = await db.pool.query(`
            SELECT COUNT(*) AS total_matches
            FROM matches
        `);

        const [[playerStatCountRow]] = await db.pool.query(`
            SELECT COUNT(*) AS total_player_stats
            FROM player_stats
        `);

        const [recentMatches] = await db.pool.query(`
            SELECT
                m.match_id,
                m.date,
                t.name AS tournament,
                t.icon AS tournament_icon,
                team_1.name AS team_1_name,
                team_1.icon AS team_1_icon,
                team_2.name AS team_2_name,
                team_2.icon AS team_2_icon,
                m.team_1_score,
                m.team_2_score,
                m.ref_link
            FROM matches m
            INNER JOIN tournaments t ON t.tournament_id = m.tournament_id
            INNER JOIN teams team_1 ON team_1.team_id = m.team_1_id
            INNER JOIN teams team_2 ON team_2.team_id = m.team_2_id
            ORDER BY m.date DESC
            LIMIT 12
        `);

        res.json({
            totalMatches: Number(matchCountRow?.total_matches) || 0,
            totalPlayerStats: Number(playerStatCountRow?.total_player_stats) || 0,
            recentMatches
        });
    } catch (error) {
        console.error('Failed to fetch homepage data', error);
        res.status(500).json({ error: 'Unable to fetch homepage data' });
    }
});


app.get('/api/players', async (req,res) => {
    try {
        const players = await db.getPlayerList();
        res.json(players);
    } catch (error) {
        console.error('Failed to fetch player list', error);
        res.status(500).json({ error: 'Unable to fetch player list' });
    }
})

app.get('/api/teams', async (req,res) => {
    try {
        const circuitParam = String(req.query.circuit || 'owcs').toLowerCase();
        const circuit = ['owcs', 'owwc', 'all'].includes(circuitParam) ? circuitParam : 'owcs';
        const teams = await db.getTeamsWithRoster(circuit);
        res.json(teams);
    } catch (error) {
        console.error('Failed to fetch team list', error);
        res.status(500).json({ error: 'Unable to fetch team list' });
    }
})

app.get('/api/compare/teams', async (req, res) => {
    try {
        const teams = await db.pool.request().query(`
            SELECT team_id, name AS team_name, region, icon
            FROM teams
            ORDER BY name ASC
        `);
        res.json(teams.recordset);
    } catch (error) {
        console.error('Failed to fetch compare team list', error);
        res.status(500).json({ error: 'Unable to fetch compare team list' });
    }
})

app.get('/api/tournaments', async (req, res) => {
    try {
        const playerIdParam = req.query.playerId;
        const teamIdParam = req.query.teamId;
        const mapIdParam = req.query.mapId;
        const playerName = typeof req.query.player === 'string' ? decodeURIComponent(req.query.player) : '';
        const teamName = typeof req.query.team === 'string' ? decodeURIComponent(req.query.team) : '';
        const mapName = typeof req.query.map === 'string' ? decodeURIComponent(req.query.map) : '';

        if (playerName) {
            const playerId = await db.getPlayerId(playerName);
            if (playerId) {
                const tournaments = await db.getTournamentsForPlayer(playerId);
                return res.json(tournaments);
            }
        }

        if (Number.isInteger(Number(playerIdParam)) && Number(playerIdParam) > 0) {
            const tournaments = await db.getTournamentsForPlayer(Number(playerIdParam));
            return res.json(tournaments);
        }

        if (teamName) {
            const teamId = await db.getTeamId(teamName);
            if (teamId) {
                const tournaments = await db.getTournamentsForTeam(teamId);
                return res.json(tournaments);
            }
        }

        if (Number.isInteger(Number(teamIdParam)) && Number(teamIdParam) > 0) {
            const tournaments = await db.getTournamentsForTeam(Number(teamIdParam));
            return res.json(tournaments);
        }

        if (mapName) {
            const maps = await db.getMaps();
            const map = maps.find(entry => normalizeKey(entry.map_name) === normalizeKey(mapName));
            if (map) {
                const results = await db.pool.request().query(`
                    SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
                    FROM team_stats
                    INNER JOIN tournaments
                        ON tournaments.tournament_id = team_stats.tournament_id
                    WHERE team_stats.map_id = ${map.map_id}
                    ORDER BY tournaments.name ASC
                `);
                return res.json(results.recordset);
            }
        }

        if (Number.isInteger(Number(mapIdParam)) && Number(mapIdParam) > 0) {
            const tournaments = await db.pool.request().query(`
                SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
                FROM team_stats
                INNER JOIN tournaments
                    ON tournaments.tournament_id = team_stats.tournament_id
                WHERE team_stats.map_id = ${Number(mapIdParam)}
                ORDER BY tournaments.name ASC
            `, [Number(mapIdParam)]);
            return res.json(tournaments.recordset);
        }

        const tournaments = await db.pool.request().query(`
            SELECT tournament_id, name, icon
            FROM tournaments
            ORDER BY name ASC
        `);
        res.json(tournaments.recordset);
    } catch (error) {
        console.error('Failed to fetch tournaments', error);
        res.status(500).json({ error: 'Unable to fetch tournaments' });
    }
});

app.get('/api/compare', async (req, res) => {
    try {
        const teamAName = req.query.teamA;
        const teamBName = req.query.teamB;
        const tournamentIds = String(req.query.tournaments || '')
            .split(',')
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value > 0);
        const tournamentMode = req.query.tournamentMode === 'exclude' ? 'exclude' : 'include';
        if (!teamAName || !teamBName || teamAName === teamBName) {
            return res.status(400).json({ error: 'Please provide two different teams to compare.' });
        }
        const teamAId = Number(teamAName) || await db.getTeamId(teamAName);
        const teamBId = Number(teamBName) || await db.getTeamId(teamBName);
        const teamADetails = await db.getTeamDetails(teamAId)
        const teamBDetails = await db.getTeamDetails(teamBId)


        const teamA = teamADetails[0];
        const teamB = teamBDetails[0];

        const h2hRows = await db.getHeadtoHead(teamAId, teamBId, tournamentIds, tournamentMode)

        const mapResults = {};
        const headToHead = { played: 0, teamA_wins: 0, teamB_wins: 0, draws: 0 };

        for (const row of h2hRows) {
            const isTeamA = row.team_id === teamAId;
            const teamKey = isTeamA ? 'teamA' : 'teamB';
            if (!mapResults[row.map_id]) {
                mapResults[row.map_id] = {
                    map_id: row.map_id,
                    map_name: row.map_name,
                    map_mode: row.map_mode,
                    teamA: { played: 0, wins: 0, losses: 0, draws: 0 },
                    teamB: { played: 0, wins: 0, losses: 0, draws: 0 }
                };
            }
            mapResults[row.map_id][teamKey] = {
                played: row.played,
                wins: row.wins,
                losses: row.losses,
                draws: row.draws
            };

            if (isTeamA) {
                headToHead.played += parseInt(row.played);
                headToHead.teamA_wins += parseInt(row.wins);
                headToHead.teamB_wins += parseInt(row.losses);
                headToHead.draws += parseInt(row.draws);
            }
        }

        const teamAMatchRows = await db.getHeadtoHeadMatches(teamAId, teamBId, tournamentIds, tournamentMode)

        const matchHistory = teamAMatchRows.map(row => {
            const teamAIsHome = row.team_1_id === teamAId;
            const teamAScore = teamAIsHome ? row.team_1_score : row.team_2_score;
            const teamBScore = teamAIsHome ? row.team_2_score : row.team_1_score;
            let result = 'Draw';
            if (teamAScore > teamBScore) result = 'Win';
            else if (teamAScore < teamBScore) result = 'Loss';
            return {
                match_id: row.match_id,
                date: row.date,
                tournament: row.tournament,
                tournament_icon: row.tournament_icon,
                ref_link: row.ref_link,
                teamA: {
                    id: teamAId,
                    name: teamADetails.name,
                    icon: teamADetails.icon,
                    score: teamAScore
                },
                teamB: {
                    id: teamBId,
                    name: teamBDetails.name,
                    icon: teamBDetails.icon,
                    score: teamBScore
                },
                result
            };
        });
        const teamATotalsRows = await db.getTeamTotalStats(teamAId, tournamentIds, tournamentMode)
        const teamBTotalsRows = await db.getTeamTotalStats(teamBId, tournamentIds, tournamentMode)

        const totalsA = teamATotalsRows[0];
        const totalsB = teamBTotalsRows[0];

        const teamAMapStats = await db.getTeamMapPlayed(teamAId, tournamentIds, tournamentMode)
        const teamBMapStats = await db.getTeamMapPlayed(teamBId, tournamentIds, tournamentMode)

        const averagesA = teamAMapStats[0];
        const averagesB = teamBMapStats[0];

        const compareResponse = {
            teamA: {
                ...teamADetails,
                totals: {
                    played: totalsA.played,
                    wins: totalsA.wins,
                    losses: totalsA.losses,
                    draws: totalsA.draws,
                    win_rate: totalsA.played ? Math.round((totalsA.wins / totalsA.played) * 100) : 0
                },
                averages: {
                    maps_played: averagesA.maps_played,
                    avg_played_per_map: averagesA.maps_played ? Number((averagesA.played / averagesA.maps_played).toFixed(2)) : 0,
                    avg_wins_per_map: averagesA.maps_played ? Number((averagesA.wins / averagesA.maps_played).toFixed(2)) : 0,
                    avg_losses_per_map: averagesA.maps_played ? Number((averagesA.losses / averagesA.maps_played).toFixed(2)) : 0,
                    avg_draws_per_map: averagesA.maps_played ? Number((averagesA.draws / averagesA.maps_played).toFixed(2)) : 0
                }
            },
            teamB: {
                ...teamBDetails,
                totals: {
                    played: totalsB.played,
                    wins: totalsB.wins,
                    losses: totalsB.losses,
                    draws: totalsB.draws,
                    win_rate: totalsB.played ? Math.round((totalsB.wins / totalsB.played) * 100) : 0
                },
                averages: {
                    maps_played: averagesB.maps_played,
                    avg_played_per_map: averagesB.maps_played ? Number((averagesB.played / averagesB.maps_played).toFixed(2)) : 0,
                    avg_wins_per_map: averagesB.maps_played ? Number((averagesB.wins / averagesB.maps_played).toFixed(2)) : 0,
                    avg_losses_per_map: averagesB.maps_played ? Number((averagesB.losses / averagesB.maps_played).toFixed(2)) : 0,
                    avg_draws_per_map: averagesB.maps_played ? Number((averagesB.draws / averagesB.maps_played).toFixed(2)) : 0
                }
            },
            headToHead,
            maps: Object.values(mapResults),
            bans: {
                teamA: [],
                teamB: []
            },
            matches: matchHistory
        };

        const banRows = await db.getHeadtoHeadBans(teamAId, teamBId, tournamentIds, tournamentMode)

        const banGroups = { [teamAId]: [], [teamBId]: [] };
        for (const row of banRows) {
            if (!row.hero_id) continue;
            banGroups[row.team_id].push({
                hero_id: row.hero_id,
                hero_name: row.hero_name,
                hero_icon: row.hero_icon,
                hero_role: row.hero_role,
                bans_for: row.bans_for,
                bans_against: row.bans_against,
                total_bans: parseInt(row.bans_for || 0) + parseInt(row.bans_against || 0)
            });
        }

        compareResponse.bans.teamA = banGroups[teamAId] || [];
        compareResponse.bans.teamB = banGroups[teamBId] || [];

        res.json(compareResponse);
    } catch (error) {
        console.error('Failed to fetch compare data', error);
        res.status(500).json({ error: 'Unable to fetch compare data' });
    }
})

function normalizeKey(value) {
    return String(value || '')
        .replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase();
}



app.get('/api/maps/:name', async (req, res) => {

        const requestedName = normalizeKey(decodeURIComponent(req.params.name).replace(/\+/g, ' '));
        const tournamentIds = String(req.query.tournaments || '')
            .split(',')
            .map(value => Number(value))
            .filter(value => Number.isInteger(value) && value > 0);
        const tournamentMode = req.query.tournamentMode === 'exclude' ? 'exclude' : 'include';

        const maps = await db.getMaps()

        const map = maps.find(m => normalizeKey(m.map_name) === requestedName);
        if (!map) {
            return res.status(404).json({ error: 'Map not found' });
        }

        const banStats = await db.getMapBanStats(map.map_id, tournamentIds, tournamentMode)
        const teamStats = await db.getMapTeamStats(map.map_id, tournamentIds, tournamentMode)

        

        const teamRows = teamStats.map(row => {
            const winRate = row.played ? Math.round((row.wins / row.played) * 100) : 0;
            return {
                team_id: row.team_id,
                team_name: row.team_name,
                team_icon: row.team_icon,
                wins: row.wins,
                draws: row.draws,
                losses: row.losses,
                played: row.played,
                win_rate: winRate
            };
        });

        const bans = banStats.map(row => ({
            hero_id: row.hero_id,
            hero_name: row.hero_name,
            hero_icon: row.hero_icon,
            bans: row.bans
        }));

        res.json({
            map_id: map.map_id,
            map_name: map.map_name,
            mode: map.mode,
            image: map.icon,
            teams: teamRows.sort((a, b) => b.win_rate - a.win_rate),
            bans
        });
})


app.get('/api/maps', async (req, res) => {
    const maps = await db.getMaps()

    const response = maps.map(map => {
        return {
            map_id: map.map_id,
            map_name: map.map_name,
            mode: map.mode,
            image: map.icon,
        };
    });

    res.json(response);
})

app.get('/api/players/:name', async (req,res) => {
    const playerName = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    const tournamentIds = String(req.query.tournaments || '')
        .split(',')
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0);
    const tournamentMode = req.query.tournamentMode === 'exclude' ? 'exclude' : 'include';
    let result = {}
    let player_id = await db.getPlayerId(playerName)
    result["matches"] = await db.getPlayerMatchesById(player_id, tournamentIds, tournamentMode)
    result["stats"] = await db.getPlayerStats(player_id, tournamentIds, tournamentMode)
    result["total"] = await db.getTotalStats(player_id, tournamentIds, tournamentMode)
    result["avg"] = await db.getAvgStats(player_id, tournamentIds, tournamentMode)
    result["player_details"] = await db.getPlayerDetails(player_id)
    result["maps"] = await db.getPlayerMapStats(player_id, tournamentIds, tournamentMode)
    result["heroes"] = await db.getPreferredHeroes(player_id)
    res.send(result);
})

app.get('/api/teams/:name', async (req,res) => {
    const teamName = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    const tournamentIds = String(req.query.tournaments || '')
        .split(',')
        .map(value => Number(value))
        .filter(value => Number.isInteger(value) && value > 0);
    const tournamentMode = req.query.tournamentMode === 'exclude' ? 'exclude' : 'include';
    let result = {}
    let team_id = await db.getTeamId(teamName)
    result["team_details"] = await db.getTeamDetails(team_id)
    result["matches"] = await db.getMatchesById(parseInt(team_id), tournamentIds, tournamentMode)
    result["roster"] = await db.getRoster(team_id)
    result["maps"] = await db.getTeamMapStats(team_id, tournamentIds, tournamentMode)
    result["bans"] = await db.getBanStats(team_id, tournamentIds, tournamentMode)
    result["tournaments"] = await db.getRecentTournaments(team_id, tournamentIds, tournamentMode)
    res.send(result);
})

app.get('/players/:name', (req,res) => {
    // normalize encoded spaces in path param
    req.params.name = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    res.sendFile('website/player/player.html', {root: __dirname })
})

// Serve team page for path URLs (e.g. /team/TwistedMinds)
app.get('/teams/:name', (req, res) => {
    // normalize encoded spaces in path param
    req.params.name = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    res.sendFile('website/team/team.html', { root: __dirname });
});

app.get('/players', (req,res) => {
    // normalize encoded spaces in path param
    res.sendFile('website/player/players.html', {root: __dirname })
})

app.get('/maps', (req,res) => {
    res.sendFile('website/map/maps.html', {root: __dirname })
})

app.get('/maps/:name', (req,res) => {
    // normalize encoded spaces in path param
    req.params.name = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    res.sendFile('website/map/map.html', {root: __dirname })
})

app.get('/compare', (req,res) => {
    res.sendFile('website/compare/compare.html', {root: __dirname })
})

app.get('/teams', (req,res) => {
    res.sendFile('website/team/index.html', {root: __dirname })
})



// PORT
const port = Number(process.env.PORT) || 8080;
app.listen(port, () => console.log(`Listening on port ${port}....`));