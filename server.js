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

app.get('/', (req,res) => {
    res.send("Hello World!!");
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
        const teams = await db.getTeamsWithRoster();
        res.json(teams);
    } catch (error) {
        console.error('Failed to fetch team list', error);
        res.status(500).json({ error: 'Unable to fetch team list' });
    }
})

app.get('/api/compare/teams', async (req, res) => {
    try {
        const [teams] = await db.pool.query(`
            SELECT team_id, name AS team_name, region, icon
            FROM teams
            ORDER BY name ASC
        `);
        res.json(teams);
    } catch (error) {
        console.error('Failed to fetch compare team list', error);
        res.status(500).json({ error: 'Unable to fetch compare team list' });
    }
})

app.get('/api/compare', async (req, res) => {
    try {
        const teamAName = req.query.teamA;
        const teamBName = req.query.teamB;
        if (!teamAName || !teamBName || teamAName === teamBName) {
            return res.status(400).json({ error: 'Please provide two different teams to compare.' });
        }

        const teamAId = Number(teamAName) || await db.getTeamId(teamAName);
        const teamBId = Number(teamBName) || await db.getTeamId(teamBName);

        const [teamADetails] = await db.pool.query(`
            SELECT team_id, name AS team_name, region, icon
            FROM teams
            WHERE team_id = ?
        `, [teamAId]);
        const [teamBDetails] = await db.pool.query(`
            SELECT team_id, name AS team_name, region, icon
            FROM teams
            WHERE team_id = ?
        `, [teamBId]);

        if (!teamADetails.length || !teamBDetails.length) {
            return res.status(404).json({ error: 'One or both teams not found.' });
        }

        const teamA = teamADetails[0];
        const teamB = teamBDetails[0];

        const [h2hRows] = await db.pool.query(`
            SELECT ts.map_id, m.name AS map_name, ts.team_id,
                SUM(ts.result = 'Win') AS wins,
                SUM(ts.result = 'Loss') AS losses,
                SUM(ts.result = 'Draw') AS draws,
                COUNT(*) AS played
            FROM team_stats ts
            INNER JOIN maps m ON ts.map_id = m.map_id
            WHERE (ts.team_id = ? AND ts.opponent_id = ?) OR (ts.team_id = ? AND ts.opponent_id = ?)
            GROUP BY ts.map_id, ts.team_id
            ORDER BY m.name ASC
        `, [teamAId, teamBId, teamBId, teamAId]);

        const mapResults = {};
        const headToHead = { played: 0, teamA_wins: 0, teamB_wins: 0, draws: 0 };

        for (const row of h2hRows) {
            const isTeamA = row.team_id === teamAId;
            const teamKey = isTeamA ? 'teamA' : 'teamB';
            if (!mapResults[row.map_id]) {
                mapResults[row.map_id] = {
                    map_id: row.map_id,
                    map_name: row.map_name,
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

        const [teamAMatchRows] = await db.pool.query(`
            SELECT m.match_id, m.date, m.team_1_id, t1.name AS team_1_name, t1.icon AS team_1_icon,
                m.team_1_score, m.team_2_id, t2.name AS team_2_name, t2.icon AS team_2_icon, m.team_2_score,
                tor.name AS tournament
            FROM matches m
            INNER JOIN teams t1 ON m.team_1_id = t1.team_id
            INNER JOIN teams t2 ON m.team_2_id = t2.team_id
            LEFT JOIN tournaments tor ON m.tournament_id = tor.tournament_id
            WHERE (m.team_1_id = ? AND m.team_2_id = ?) OR (m.team_1_id = ? AND m.team_2_id = ?)
            ORDER BY m.date DESC
        `, [teamAId, teamBId, teamBId, teamAId]);

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
                teamA: {
                    id: teamAId,
                    name: teamA.team_name,
                    icon: teamA.icon,
                    score: teamAScore
                },
                teamB: {
                    id: teamBId,
                    name: teamB.team_name,
                    icon: teamB.icon,
                    score: teamBScore
                },
                result
            };
        });

        const [teamATotalsRows] = await db.pool.query(`
            SELECT COUNT(*) AS played,
                SUM(result = 'Win') AS wins,
                SUM(result = 'Loss') AS losses,
                SUM(result = 'Draw') AS draws
            FROM team_stats
            WHERE team_id = ?
        `, [teamAId]);
        const [teamBTotalsRows] = await db.pool.query(`
            SELECT COUNT(*) AS played,
                SUM(result = 'Win') AS wins,
                SUM(result = 'Loss') AS losses,
                SUM(result = 'Draw') AS draws
            FROM team_stats
            WHERE team_id = ?
        `, [teamBId]);

        const totalsA = teamATotalsRows[0];
        const totalsB = teamBTotalsRows[0];

        const [teamAMapStats] = await db.pool.query(`
            SELECT COUNT(*) AS played, SUM(result = 'Win') AS wins, SUM(result = 'Loss') AS losses, SUM(result = 'Draw') AS draws, COUNT(DISTINCT map_id) AS maps_played
            FROM team_stats
            WHERE team_id = ?
        `, [teamAId]);
        const [teamBMapStats] = await db.pool.query(`
            SELECT COUNT(*) AS played, SUM(result = 'Win') AS wins, SUM(result = 'Loss') AS losses, SUM(result = 'Draw') AS draws, COUNT(DISTINCT map_id) AS maps_played
            FROM team_stats
            WHERE team_id = ?
        `, [teamBId]);

        const averagesA = teamAMapStats[0];
        const averagesB = teamBMapStats[0];

        const compareResponse = {
            teamA: {
                ...teamA,
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
                ...teamB,
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

        const [banRows] = await db.pool.query(`
            SELECT ts.team_id, h.hero_id, h.name AS hero_name, h.icon AS hero_icon,
                SUM(CASE WHEN ts.ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_for,
                SUM(CASE WHEN ts.opponent_ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_against
            FROM team_stats ts
            LEFT JOIN heroes h ON h.hero_id IN (ts.ban_id, ts.opponent_ban_id)
            WHERE (ts.team_id = ? AND ts.opponent_id = ?) OR (ts.team_id = ? AND ts.opponent_id = ?)
            GROUP BY ts.team_id, h.hero_id
            ORDER BY ts.team_id, bans_for DESC, bans_against DESC
        `, [teamAId, teamBId, teamBId, teamAId]);

        const banGroups = { [teamAId]: [], [teamBId]: [] };
        for (const row of banRows) {
            if (!row.hero_id) continue;
            banGroups[row.team_id].push({
                hero_id: row.hero_id,
                hero_name: row.hero_name,
                hero_icon: row.hero_icon,
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

        const maps = await db.getMaps()

        const map = maps.find(m => normalizeKey(m.map_name) === requestedName);
        if (!map) {
            return res.status(404).json({ error: 'Map not found' });
        }

        const banStats = await db.getMapBanStats(map.map_id)
        const teamStats = await db.getMapTeamStats(map.map_id)

        

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
    // Normalize URL-encoded spaces and pluses in the name param
    const playerName = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    let result = {}
    let player_id = await db.getPlayerId(playerName)
    let team_id = await db.getTeamIdFromPlayer(player_id)
    result["matches"] = await db.getMatchesById(parseInt(team_id))
    result["stats"] = await db.getPlayerStats(player_id)
    result["total"] = await db.getTotalStats(player_id)
    result["avg"] = await db.getAvgStats(player_id)
    result["player_details"] = await db.getPlayerDetails(player_id)
    result["maps"] = await db.getPlayerMapStats(player_id)
    result["heroes"] = await db.getPreferredHeroes(player_id)
    res.send(result);
})

app.get('/api/teams/:name', async (req,res) => {
    // Normalize URL-encoded spaces and pluses in the name param
    const teamName = decodeURIComponent(req.params.name).replace(/\+/g, ' ');
    let result = {}
    let team_id = await db.getTeamId(teamName)
    result["team_details"] = await db.getTeamDetails(team_id)
    result["matches"] = await db.getMatchesById(parseInt(team_id))
    result["roster"] = await db.getRoster(team_id)
    result["maps"] = await db.getTeamMapStats(team_id)
    result["bans"] = await db.getBanStats(team_id)
    result["tournaments"] = await db.getRecentTournaments(team_id)
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
const port = process.env.PORT;
app.listen(3000, () => console.log(`Listening on port ${port}....`));