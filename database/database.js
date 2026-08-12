import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

export const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
}).promise();

function buildTournamentFilterClause(columnName, tournamentIds = [], mode = 'include') {
    const ids = Array.isArray(tournamentIds)
        ? tournamentIds.filter(id => Number.isInteger(Number(id)) && Number(id) > 0)
        : [];

    if (!ids.length) {
        return { clause: '', values: [] };
    }

    const normalizedIds = ids.map(id => Number(id));
    const literalIds = normalizedIds.join(', ');
    const operator = mode === 'exclude' ? 'NOT IN' : 'IN';

    return {
        clause: `(${columnName} IS NULL OR ${columnName} ${operator} (${literalIds}))`,
        values: []
    };
}

await createMapsTable()

async function createPlayerStatsTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS player_stats (
        player_stats_id INT AUTO_INCREMENT PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        tournament_id INT,
        match_id INT,
        round INT,
        map_id INT,
        result ENUM(\'Win\',\'Loss\',\'Draw\') NOT NULL,
        score VARCHAR(255),
        team_id INT,
        player_id INT,
        eliminations INT,
        assists INT,
        deaths INT,
        damage INT,
        healing INT,
        mitigation INT,
        CONSTRAINT Player_Stats_fk_Tournaments FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
        CONSTRAINT Player_Stats_fk_Teams FOREIGN KEY (team_id) REFERENCES teams(team_id)
        );
        `);
    console.log("Player Stats Table Created");
    return results;
}


async function createTournamentsTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS Tournaments (
        tournament_id INT AUTO_INCREMENT PRIMARY KEY,
        start_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        end_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        name VARCHAR(255),
        tier INT,
        season INT,
        stage INT,
        region VARCHAR(255),
        phase VARCHAR(255),
        icon VARCHAR(255),
        ref_link VARCHAR(255)
        );
        `);
    console.log("Tournaments Table Created");
    return results;
}

async function createMatchesTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS Matches (
        match_id INT AUTO_INCREMENT PRIMARY KEY,
        tournament_id INT,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        team_1_id INT,
        team_1_score INT,
        team_2_id INT,
        team_2_score INT,
        ref_link VARCHAR(255),
        CONSTRAINT Matches_fk_Tournaments FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
        CONSTRAINT Matches_Team_1_fk_Teams FOREIGN KEY (team_1_id) REFERENCES teams(team_id),
        CONSTRAINT Matches_Team_2_fk_Teams FOREIGN KEY (team_2_id) REFERENCES teams(team_id)
        );
        `);
    console.log("Matches Table Created");
    return results;
}

async function createTeamsTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS Teams (
        team_id INT AUTO_INCREMENT PRIMARY KEY,
        region VARCHAR(255),
        name VARCHAR(255),
        icon VARCHAR(255),
        ref_link VARCHAR(255)
        );
        `);
    console.log("Teams Table Created");
    return results;
}

export async function getHeadtoHead(teamAId,teamBId, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [h2hRows] = await pool.query(`
        SELECT ts.map_id, m.name AS map_name, m.mode AS map_mode, ts.team_id,
            SUM(ts.result = 'Win') AS wins,
            SUM(ts.result = 'Loss') AS losses,
            SUM(ts.result = 'Draw') AS draws,
            COUNT(*) AS played
        FROM team_stats ts
        INNER JOIN maps m ON ts.map_id = m.map_id
        WHERE ((ts.team_id = ? AND ts.opponent_id = ?) OR (ts.team_id = ? AND ts.opponent_id = ?))
        ${whereClause}
        GROUP BY ts.map_id, m.name, m.mode, ts.team_id
        ORDER BY m.name ASC
    `, [teamAId, teamBId, teamBId, teamAId, ...values]);
    return h2hRows
}

export async function getHeadtoHeadMatches(teamAId,teamBId, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('m.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [teamAMatchRows] = await pool.query(`
        SELECT m.match_id, m.date, m.team_1_id, t1.name AS team_1_name, t1.icon AS team_1_icon,
            m.team_1_score, m.team_2_id, t2.name AS team_2_name, t2.icon AS team_2_icon, m.team_2_score,
            tor.name AS tournament
        FROM matches m
        INNER JOIN teams t1 ON m.team_1_id = t1.team_id
        INNER JOIN teams t2 ON m.team_2_id = t2.team_id
        LEFT JOIN tournaments tor ON m.tournament_id = tor.tournament_id
        WHERE ((m.team_1_id = ? AND m.team_2_id = ?) OR (m.team_1_id = ? AND m.team_2_id = ?))
        ${whereClause}
        ORDER BY m.date DESC
    `, [teamAId, teamBId, teamBId, teamAId, ...values]);
    return teamAMatchRows
}

export async function getTeamTotalStats(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [result] = await pool.query(`
        SELECT COUNT(*) AS played,
            SUM(result = 'Win') AS wins,
            SUM(result = 'Loss') AS losses,
            SUM(result = 'Draw') AS draws
        FROM team_stats
        WHERE team_id = ?
        ${whereClause}
    `, [team_id, ...values]);
    return result
}

export async function getTeamMapPlayed(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [result] = await pool.query(`
            SELECT COUNT(*) AS played, SUM(result = 'Win') AS wins, SUM(result = 'Loss') AS losses, SUM(result = 'Draw') AS draws, COUNT(DISTINCT map_id) AS maps_played
            FROM team_stats
            WHERE team_id = ?
            ${whereClause}
    `, [team_id, ...values]);
    return result
}

export async function getHeadtoHeadBans(teamA_id, teamB_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [result] = await pool.query(`
        SELECT ts.team_id, h.hero_id, h.name AS hero_name, h.icon AS hero_icon, h.role AS hero_role,
            SUM(CASE WHEN ts.ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_for,
            SUM(CASE WHEN ts.opponent_ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_against
        FROM team_stats ts
        LEFT JOIN heroes h ON h.hero_id IN (ts.ban_id, ts.opponent_ban_id)
        WHERE ((ts.team_id = ? AND ts.opponent_id = ?) OR (ts.team_id = ? AND ts.opponent_id = ?))
        ${whereClause}
        GROUP BY ts.team_id, h.hero_id
        ORDER BY ts.team_id, bans_for DESC, bans_against DESC
    `, [teamA_id, teamB_id, teamB_id, teamA_id, ...values]);
    return result
}

export async function getPlayerId(player_name){
    const [[results]] =  await pool.query(`
        SELECT player_id
        FROM players
        WHERE name = ?
        OR alternate_name = ?
        `,
        [player_name,player_name]
    );
    return results["player_id"]; 
}


export async function getTeamIdFromPlayer(player_id){
    const [[results]] =  await pool.query(`
        SELECT team_id
        FROM players
        WHERE player_id = ?
        `,
        [player_id]
    );
    return results["team_id"]; 
}

export async function getPlayerDetails(player_id) {
    const [nationalTeamColumn] = await pool.query(`
        SHOW COLUMNS FROM players LIKE 'national_team'
    `);
    const hasNationalTeamColumn = nationalTeamColumn.length > 0;
    const nationalTeamType = hasNationalTeamColumn
        ? String(nationalTeamColumn[0].Type || '').toLowerCase()
        : '';

    const nationalTeamJoin = hasNationalTeamColumn
        ? (nationalTeamType.includes('int')
            ? 'LEFT JOIN teams national_team ON national_team.team_id = players.national_team'
            : 'LEFT JOIN teams national_team ON national_team.name = players.national_team')
        : '';

    const nationalTeamIconSelect = hasNationalTeamColumn
        ? 'national_team.icon AS owwc_team_icon'
        : 'NULL AS owwc_team_icon';
    const nationalTeamNameSelect = hasNationalTeamColumn
        ? 'national_team.name AS owwc_team_name'
        : 'NULL AS owwc_team_name';

    const [[results]] =  await pool.query(`
        SELECT players.name as name, players.role as role, teams.name as team, teams.icon as team_icon, ${nationalTeamIconSelect}, ${nationalTeamNameSelect}
        FROM players
        INNER JOIN
        teams
        ON players.team_id = teams.team_id
        ${nationalTeamJoin}
        WHERE player_id = ?
        `,
        [player_id]
    );
    return results; 
}

export async function getTournamentsForPlayer(player_id) {
    const [results] = await pool.query(`
        SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
        FROM player_stats
        INNER JOIN matches
            ON matches.match_id = player_stats.match_id
        INNER JOIN tournaments
            ON tournaments.tournament_id = matches.tournament_id
        WHERE player_stats.player_id = ?
        ORDER BY tournaments.name ASC
    `, [player_id]);
    return results;
}

export async function getTournamentsForTeam(team_id) {
    const [results] = await pool.query(`
        SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
        FROM matches
        INNER JOIN tournaments
            ON tournaments.tournament_id = matches.tournament_id
        WHERE matches.team_1_id = ? OR matches.team_2_id = ?
        ORDER BY tournaments.name ASC
    `, [team_id, team_id]);
    return results;
}

export async function getMatchesById(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
        SELECT *
        FROM (
            SELECT tournaments.name as tournament, tournaments.icon as tournament_icon,matches.date,
            team_2.name as opponent, team_2.icon as opponent_icon,  matches.team_1_score as team_score,
            matches.team_2_score as opponent_score,
            matches.ref_link
            FROM matches 
            INNER JOIN tournaments
            ON matches.tournament_id = tournaments.tournament_id
            INNER JOIN teams team_1
            ON team_1.team_id = matches.team_1_id
            INNER JOIN teams team_2
            ON team_2.team_id = matches.team_2_id
            WHERE team_1_id = ? ${whereClause}
            UNION
            SELECT tournaments.name as tournament, tournaments.icon as tournament_icon,matches.date,
            team_1.name as opponent, team_1.icon as opponent_icon,  matches.team_2_score as team_score,
            matches.team_1_score as opponent_score,
            matches.ref_link
            FROM matches 
            INNER JOIN tournaments
            ON matches.tournament_id = tournaments.tournament_id
            INNER JOIN teams team_1
            ON team_1.team_id = matches.team_1_id
            INNER JOIN teams team_2
            ON team_2.team_id = matches.team_2_id
            WHERE team_2_id = ? ${whereClause}
        ) AS tmp
        ORDER BY date DESC
        `,
        [team_id, team_id, ...values]
    );
    return results; 
    
}


export async function getPlayerMatchesById(player_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
        SELECT tournament, tournament_icon, date, opponent, opponent_icon, team_score, opponent_score, ref_link
        FROM (
            SELECT tournaments.name AS tournament,
                tournaments.icon AS tournament_icon,
                matches.date,
                CASE
                    WHEN player_stats.team_id = matches.team_1_id THEN team_2.name
                    ELSE team_1.name
                END AS opponent,
                CASE
                    WHEN player_stats.team_id = matches.team_1_id THEN team_2.icon
                    ELSE team_1.icon
                END AS opponent_icon,
                CASE
                    WHEN player_stats.team_id = matches.team_1_id THEN matches.team_1_score
                    ELSE matches.team_2_score
                END AS team_score,
                CASE
                    WHEN player_stats.team_id = matches.team_1_id THEN matches.team_2_score
                    ELSE matches.team_1_score
                END AS opponent_score,
                matches.ref_link
            FROM (
                SELECT DISTINCT match_id, team_id
                FROM player_stats
                WHERE player_id = ?
            ) AS player_stats
            INNER JOIN matches
                ON matches.match_id = player_stats.match_id
            INNER JOIN tournaments
                ON matches.tournament_id = tournaments.tournament_id
            INNER JOIN teams AS team_1
                ON team_1.team_id = matches.team_1_id
            INNER JOIN teams AS team_2
                ON team_2.team_id = matches.team_2_id
            WHERE player_stats.team_id = matches.team_1_id OR player_stats.team_id = matches.team_2_id
            ${whereClause}
        ) AS tmp
        ORDER BY date DESC
        `,
        [player_id, ...values]
    );
    return results; 
    
}

export async function getPlayerStats(player_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
        SELECT * 
        FROM (
            SELECT matches.date, opponent.icon as opponent_icon,opponent.name as opponent ,stats.eliminations, stats.assists, stats.deaths, stats.damage, stats.healing, stats.mitigation
            FROM (
                SELECT match_id, team_id, SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
                FROM player_stats
                WHERE player_id = ?
                GROUP BY match_id, team_id
            ) AS stats
            INNER JOIN matches
            ON matches.match_id = stats.match_id
            INNER JOIN teams opponent
            ON matches.team_2_id = opponent.team_id
            WHERE matches.team_1_id = stats.team_id ${whereClause}
            UNION
            SELECT matches.date, opponent.icon as opponent_icon,opponent.name as opponent ,stats.eliminations, stats.assists, stats.deaths, stats.damage, stats.healing, stats.mitigation
            FROM (
                SELECT match_id, team_id, SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
                FROM player_stats
                WHERE player_id = ?
                GROUP BY match_id, team_id
            ) AS stats 
            INNER JOIN matches
            ON matches.match_id = stats.match_id
            INNER JOIN teams opponent
            ON matches.team_1_id = opponent.team_id
            WHERE matches.team_2_id = stats.team_id ${whereClause}
        ) AS tmp
        ORDER BY date ASC
        `,
        [player_id, player_id, ...values]
    );
    return results; 
}


export async function getTotalStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = player_stats.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = player_stats.match_id';
    const [[results]] =  await pool.query(`
        SELECT SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
        FROM player_stats
        ${joinClause}
        WHERE player_id = ?
        `,
        [player_id, ...values]
    );
    return results; 
}

export async function getAvgStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = player_stats.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = player_stats.match_id';
    const [[results]] =  await pool.query(`
        SELECT AVG(eliminations) as eliminations, AVG(assists) as assists, AVG(deaths) as deaths, AVG(damage) as damage, AVG(healing) as healing, AVG(mitigation) as mitigation
        FROM player_stats
        ${joinClause}
        WHERE player_id = ?
        `,
        [player_id, ...values]
    );
    return results; 
}

export async function getPlayerList() {
    const [nationalTeamColumn] = await pool.query(`
        SHOW COLUMNS FROM players LIKE 'national_team'
    `);
    const hasNationalTeamColumn = nationalTeamColumn.length > 0;
    const nationalTeamType = hasNationalTeamColumn
        ? String(nationalTeamColumn[0].Type || '').toLowerCase()
        : '';

    const nationalTeamJoin = hasNationalTeamColumn
        ? (nationalTeamType.includes('int')
            ? 'LEFT JOIN teams national_team ON p.national_team = national_team.team_id'
            : 'LEFT JOIN teams national_team ON LOWER(p.national_team) = LOWER(national_team.name)')
        : '';

    const teamNameSelect = hasNationalTeamColumn
        ? 'COALESCE(primary_team.name, national_team.name)'
        : 'primary_team.name';
    const teamIconSelect = hasNationalTeamColumn
        ? 'COALESCE(primary_team.icon, national_team.icon)'
        : 'primary_team.icon';
    const groupByTeamColumns = hasNationalTeamColumn
        ? 'primary_team.name, primary_team.icon, national_team.name, national_team.icon'
        : 'primary_team.name, primary_team.icon';

    const [results] = await pool.query(`
        SELECT
            p.name,
            p.role,
            ${teamNameSelect} as team,
            ${teamIconSelect} as team_icon,
            COALESCE(SUM(ps.eliminations), 0) as total_eliminations,
            COALESCE(SUM(ps.assists), 0) as total_assists,
            COALESCE(SUM(ps.deaths), 0) as total_deaths,
            COALESCE(SUM(ps.damage), 0) as total_damage,
            COALESCE(SUM(ps.healing), 0) as total_healing,
            COALESCE(SUM(ps.mitigation), 0) as total_mitigation,
            COALESCE(AVG(ps.eliminations), 0) as avg_eliminations,
            COALESCE(AVG(ps.assists), 0) as avg_assists,
            COALESCE(AVG(ps.deaths), 0) as avg_deaths,
            COALESCE(AVG(ps.damage), 0) as avg_damage,
            COALESCE(AVG(ps.healing), 0) as avg_healing,
            COALESCE(AVG(ps.mitigation), 0) as avg_mitigation
        FROM players p
        LEFT JOIN player_stats ps
            ON ps.player_id = p.player_id
        LEFT JOIN teams primary_team
            ON p.team_id = primary_team.team_id
        ${nationalTeamJoin}
        GROUP BY p.player_id, p.name, p.role, ${groupByTeamColumns}
        ORDER BY p.name ASC
    `);
    return results;
}

export async function getPlayerMapStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = p.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = p.match_id';
    const [results] =  await pool.query(`
    SELECT
    m.name as map,
    m.mode as mode,
    COUNT(p.map_id) as played,
    SUM(CASE WHEN  p.result = "Win" THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN p.result = "Draw" THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN p.result = "Loss" THEN 1 ELSE 0 END) lost
    FROM player_stats as p
    INNER JOIN 
    maps as m
    ON m.map_id = p.map_id
    ${joinClause}
    WHERE p.player_id = ?
    GROUP BY p.map_id
    ORDER BY played DESC
        `,
    [player_id, ...values]
    );
    return results; 
}

export async function getPreferredHeroes(player_id) {
    const [results] =  await pool.query(`
    SELECT *
    FROM (
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_1
    WHERE player_id = ?
    UNION
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_2
    WHERE player_id = ?
    UNION
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_3
    WHERE player_id = ?
    ) as tmp
    `,
    [player_id, player_id, player_id]
    );
    return results; 
}

export async function getTeamId(team_name){
    const [[results]] =  await pool.query(`
        SELECT team_id
        FROM teams
        WHERE name = ?
        `,
        team_name
    );
    return results["team_id"]; 
}


export async function getTeamDetails(team_id) {
    const [[results]] =  await pool.query(`
        SELECT name, region, icon, colour, circuit
        FROM teams
        WHERE team_id = ?
        `,
        team_id
    );
    return results; 
}

export async function getRoster(team_id){
    const [[team]] = await pool.query(`
        SELECT team_id, name, circuit
        FROM teams
        WHERE team_id = ?
    `, [team_id]);

    if (!team) {
        return [];
    }

    const isOwwcTeam = String(team.circuit || '').toLowerCase() === 'owwc';
    const [nationalTeamColumn] = await pool.query(`
        SHOW COLUMNS FROM players LIKE 'national_team'
    `);
    const hasNationalTeamColumn = nationalTeamColumn.length > 0;
    const nationalTeamType = hasNationalTeamColumn
        ? String(nationalTeamColumn[0].Type || '').toLowerCase()
        : '';

    const nationalTeamJoin = hasNationalTeamColumn
        ? (nationalTeamType.includes('int')
            ? 'LEFT JOIN teams national_team ON players.national_team = national_team.team_id'
            : 'LEFT JOIN teams national_team ON LOWER(players.national_team) = LOWER(national_team.name)')
        : '';
    const nationalTeamSelect = hasNationalTeamColumn
        ? 'national_team.name AS national_team_name, national_team.icon AS national_team_icon,'
        : 'NULL AS national_team_name, NULL AS national_team_icon,';

    if (!isOwwcTeam) {
        const [results] =  await pool.query(`
            SELECT
                players.role,
                players.name,
                primary_team.name AS primary_team_name,
                primary_team.icon AS primary_team_icon,
                ${nationalTeamSelect}
                players.team_id AS primary_team_id
            FROM players
            LEFT JOIN teams primary_team
                ON players.team_id = primary_team.team_id
            ${nationalTeamJoin}
            WHERE players.team_id = ?
                AND players.active = 1
            ORDER BY players.role
        `, [team_id]);
        return results;
    }

    if (!hasNationalTeamColumn) {
        return [];
    }

    const joinCondition = nationalTeamType.includes('int')
        ? 'players.national_team = teams.team_id'
        : 'LOWER(players.national_team) = LOWER(teams.name)';

    const [results] = await pool.query(`
        SELECT
            players.role,
            players.name,
            primary_team.name AS primary_team_name,
            primary_team.icon AS primary_team_icon,
            ${nationalTeamSelect}
            players.team_id AS primary_team_id
        FROM players
        INNER JOIN teams
            ON ${joinCondition}
        LEFT JOIN teams primary_team
            ON players.team_id = primary_team.team_id
        ${nationalTeamJoin}
        WHERE teams.team_id = ?
            AND players.active = 1
        ORDER BY players.role
    `, [team_id]);

    return results;
}

export async function getTeamsWithRoster(circuit = 'all') {
    const normalizedCircuit = String(circuit).toLowerCase();
    const supportedCircuits = ['owcs', 'owwc'];
    const includeCircuitFilter = supportedCircuits.includes(normalizedCircuit);
    const queryParams = [];
    let circuitFilter = '';
    if (includeCircuitFilter) {
        circuitFilter = ' AND LOWER(t.circuit) = ?';
        queryParams.push(normalizedCircuit);
    }

    const [nationalTeamColumn] = await pool.query(`
        SHOW COLUMNS FROM players LIKE 'national_team'
    `);
    const hasNationalTeamColumn = nationalTeamColumn.length > 0;
    const nationalTeamType = hasNationalTeamColumn
        ? String(nationalTeamColumn[0].Type || '').toLowerCase()
        : '';

    let rosterJoinCondition = 'p.team_id = t.team_id';
    if (normalizedCircuit === 'owwc' && hasNationalTeamColumn) {
        rosterJoinCondition = nationalTeamType.includes('int')
            ? 'p.national_team = t.team_id'
            : 'LOWER(p.national_team) = LOWER(t.name)';
    }

    const nationalTeamJoin = hasNationalTeamColumn
        ? (nationalTeamType.includes('int')
            ? 'LEFT JOIN teams national_team ON p.national_team = national_team.team_id'
            : 'LEFT JOIN teams national_team ON LOWER(p.national_team) = LOWER(national_team.name)')
        : '';
    const nationalTeamNameSelect = hasNationalTeamColumn
        ? 'national_team.name AS player_national_team_name,'
        : 'NULL AS player_national_team_name,';
    const nationalTeamIconSelect = hasNationalTeamColumn
        ? 'national_team.icon AS player_national_team_icon,'
        : 'NULL AS player_national_team_icon,';

    const [results] = await pool.query(`
        SELECT
            t.team_id,
            t.name AS team_name,
            t.region,
            t.icon AS team_icon,
            t.active as team_active,
            p.player_id,
            p.name AS player_name,
            p.role,
            p.active as player_active,
            primary_team.name AS player_primary_team_name,
            primary_team.icon AS player_primary_team_icon,
            ${nationalTeamNameSelect}
            ${nationalTeamIconSelect}
            p.team_id AS player_primary_team_id
        FROM teams t
        LEFT JOIN players p
            ON ${rosterJoinCondition} AND p.active = 1
        LEFT JOIN teams primary_team
            ON p.team_id = primary_team.team_id
        ${nationalTeamJoin}
        WHERE 1 = 1
        ${circuitFilter}
        ORDER BY t.region, t.name, p.role, p.name
    `, queryParams);
    return results;
}

export async function getMaps(){
    const [maps] = await pool.query(`
        SELECT map_id, name as map_name, mode, icon
        FROM maps
    `);
    return maps
}


export async function getMapBanStats(map_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [banStats] = await pool.query(`
            SELECT x.hero_id, h.name AS hero_name, h.icon AS hero_icon, SUM(x.ban_count) AS bans
            FROM (
                SELECT ban_id AS hero_id, COUNT(*) AS ban_count
                FROM team_stats
                WHERE map_id = ? AND ban_id IS NOT NULL ${whereClause}
                GROUP BY ban_id
                UNION ALL
                SELECT opponent_ban_id AS hero_id, COUNT(*) AS ban_count
                FROM team_stats
                WHERE map_id = ? AND opponent_ban_id IS NOT NULL ${whereClause}
                GROUP BY opponent_ban_id
            ) AS x
            INNER JOIN heroes h ON x.hero_id = h.hero_id
            GROUP BY x.hero_id
            ORDER BY bans DESC
        `, [map_id, map_id, ...values]);
    return banStats
}


export async function getMapTeamStats(map_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [teamStats] = await pool.query(`
            SELECT t.team_id, t.name AS team_name, t.icon AS team_icon,
                SUM(ts.result = 'Win') AS wins,
                SUM(ts.result = 'Draw') AS draws,
                SUM(ts.result = 'Loss') AS losses,
                COUNT(*) AS played
            FROM team_stats ts
            INNER JOIN teams t ON ts.team_id = t.team_id
            WHERE ts.map_id = ? AND t.active = 1 ${whereClause}
            GROUP BY t.team_id
        `, [map_id, ...values]);

    return teamStats
}

export async function getTeamMapStats(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('t.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
    SELECT
    m.name as map,
    m.mode as mode,
    COUNT(t.map_id) as played,
    SUM(CASE WHEN  t.result = "Win" THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN t.result = "Draw" THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN t.result = "Loss" THEN 1 ELSE 0 END) lost
    FROM team_stats as t
    INNER JOIN 
    maps as m
    ON m.map_id = t.map_id
    WHERE t.team_id = ?
    ${whereClause}
    GROUP BY t.map_id
    ORDER BY played DESC
        `,
    [team_id, ...values]
    );
    return results; 
}


export async function getBanStats(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
    SELECT
    heroes.name as hero,
    heroes.icon as hero_icon,
    heroes.role as hero_role,
    SUM(bans.bansFor) as bansFor,
    SUM(bans.bansAgainst) as bansAgainst,
    SUM(bans.bansFor) + SUM(bans.bansAgainst) as played
    FROM (
    SELECT ban_id as hero_id, COUNT(*) as bansFor, 0 as bansAgainst
    FROM team_stats
    WHERE team_id = ? AND ban_id IS NOT NULL ${whereClause}
    GROUP BY ban_id
    UNION ALL
    SELECT opponent_ban_id as hero_id, 0 as bansFor, COUNT(*) as bansAgainst
    FROM team_stats
    WHERE team_id = ? AND opponent_ban_id IS NOT NULL ${whereClause}
    GROUP BY opponent_ban_id
    ) as bans
    INNER JOIN heroes
    ON heroes.hero_id = bans.hero_id
    GROUP BY heroes.hero_id, heroes.name, heroes.icon, heroes.role
    ORDER BY played DESC    
    `,
    [team_id, team_id, ...values]
    );
    return results; 
}

export async function getRecentTournaments(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('placement.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const [results] =  await pool.query(`
    SELECT tournaments.icon, tournaments.name, tournaments.start_date, tournaments.end_date, placement.placement
    FROM placement
    INNER JOIN
    tournaments
    ON placement.tournament_id = tournaments.tournament_id
    WHERE team_id = ? ${whereClause}
    ORDER BY tournaments.end_date DESC
    `,
    [team_id, ...values]
    );
    return results;
}


async function createTeamStatsTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS team_stats (
        team_stats_id INT AUTO_INCREMENT PRIMARY KEY,
        date TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        tournament_id INT,
        match_id INT,
        round INT,
        map_id INT,
        result ENUM(\'Win\',\'Loss\',\'Draw\') NOT NULL,
        score VARCHAR(255),
        team_id INT,
        ban_id INT,
        map_pick BOOL,
        opponent_id INT,
        opponent_ban_id INT,
        CONSTRAINT Team_Stats_fk_Tournaments FOREIGN KEY (tournament_id) REFERENCES tournaments(tournament_id),
        CONSTRAINT Team_Stats_fk_Matches FOREIGN KEY (match_id) REFERENCES matches(match_id),
        CONSTRAINT Team_Stats_Team_fk_Teams FOREIGN KEY (team_id) REFERENCES teams(team_id),
        CONSTRAINT Team_Stats_Opponent_fk_Teams FOREIGN KEY (opponent_id) REFERENCES teams(team_id),
        CONSTRAINT Team_Stats_Team_fk_Heroes FOREIGN KEY (ban_id) REFERENCES heroes(hero_id),
        CONSTRAINT Team_Stats_Opponent_fk_Heroes FOREIGN KEY (opponent_ban_id) REFERENCES heroes(hero_id)
        );
        `);
    console.log("Team Stats Table Created");
    return results;
}

async function createHeroesTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS heroes (
        hero_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        role ENUM(\'Tank\',\'Dps\',\'Support\'),
        icon VARCHAR(255)
        );
        `);
    console.log("Team Stats Table Created");
    return results;
}

async function createPlayersTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS players (
        player_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        role ENUM(\'Tank\',\'Dps\',\'Support\'),
        team_id INT,
        ref_link VARCHAR(255),
        faceit_id VARCHAR(255),
        CONSTRAINT Players_fk_Teams FOREIGN KEY (team_id) REFERENCES teams(team_id)
        );
        `);
    console.log("Players     Table Created");
    return results;
}


async function createMapsTable() {
    const results = await pool.query(`
        CREATE TABLE IF NOT EXISTS maps (
        map_id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255),
        mode ENUM(\'Control\',\'Escort\',\'Hybrid\',\'Flashpoint\',\'Push\'),
        icon VARCHAR(255),
        faceit_id VARCHAR(255)
        );
        `);
    console.log("Players     Table Created");
    return results;
}