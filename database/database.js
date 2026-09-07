import mssql from 'mssql';
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import dotenv from 'dotenv';
dotenv.config();

function parsePositiveInt(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function firstDefined(...values) {
    for (const value of values) {
        if (typeof value === 'string' && value.trim()) {
            return value.trim();
        }
    }
    return undefined;
}

const dbConnectTimeoutMs = parsePositiveInt(process.env.DB_CONNECT_TIMEOUT_MS, 180000);
const dbRequestTimeoutMs = parsePositiveInt(process.env.DB_REQUEST_TIMEOUT_MS, 240000);
const dbConnectRetryAttempts = parsePositiveInt(process.env.DB_CONNECT_RETRY_ATTEMPTS, 6);
const dbConnectRetryDelayMs = parsePositiveInt(process.env.DB_CONNECT_RETRY_DELAY_MS, 5000);

const secretClient = new SecretManagerServiceClient();

let connectedPool = null;
let connectingPoolPromise = null;
let resolvedDbSettingsPromise = null;

async function readSecretValue(secretName) {
    const projectId = firstDefined(process.env.GOOGLE_CLOUD_PROJECT, process.env.GCLOUD_PROJECT, process.env.GCP_PROJECT);
    if (!projectId) {
        throw new Error('Missing GOOGLE_CLOUD_PROJECT while trying to read database secrets from Secret Manager.');
    }

    const secretVersionName = `projects/${projectId}/secrets/${secretName}/versions/latest`;
    const [version] = await secretClient.accessSecretVersion({ name: secretVersionName });
    const secretValue = version.payload?.data?.toString('utf8').trim();
    if (!secretValue) {
        throw new Error(`Secret ${secretName} has an empty payload.`);
    }
    return secretValue;
}

async function resolveValueFromEnvOrSecret(envKeys, secretEnvKeys) {
    const directValue = firstDefined(...envKeys.map(key => process.env[key]));
    if (directValue) {
        return directValue;
    }

    const secretName = firstDefined(...secretEnvKeys.map(key => process.env[key]));
    if (!secretName) {
        return undefined;
    }

    return readSecretValue(secretName);
}

async function getDbSettings() {
    if (resolvedDbSettingsPromise) {
        return resolvedDbSettingsPromise;
    }

    resolvedDbSettingsPromise = (async () => {
        const dbUser = await resolveValueFromEnvOrSecret(
            ['AZURE_USER', 'DB_USER', 'SQL_USER'],
            ['AZURE_USER_SECRET', 'DB_USER_SECRET', 'SQL_USER_SECRET']
        );
        const dbPassword = await resolveValueFromEnvOrSecret(
            ['AZURE_PASSWORD', 'DB_PASSWORD', 'SQL_PASSWORD'],
            ['AZURE_PASSWORD_SECRET', 'DB_PASSWORD_SECRET', 'SQL_PASSWORD_SECRET']
        );
        const dbServer = await resolveValueFromEnvOrSecret(
            ['AZURE_HOST', 'DB_HOST', 'SQL_HOST', 'SQL_SERVER'],
            ['AZURE_HOST_SECRET', 'DB_HOST_SECRET', 'SQL_HOST_SECRET', 'SQL_SERVER_SECRET']
        );
        const dbName = await resolveValueFromEnvOrSecret(
            ['AZURE_DATABASE', 'DB_NAME', 'SQL_DATABASE'],
            ['AZURE_DATABASE_SECRET', 'DB_NAME_SECRET', 'SQL_DATABASE_SECRET']
        );

        const missingDbSettings = [];
        if (!dbUser) missingDbSettings.push('AZURE_USER or AZURE_USER_SECRET');
        if (!dbPassword) missingDbSettings.push('AZURE_PASSWORD or AZURE_PASSWORD_SECRET');
        if (!dbServer) missingDbSettings.push('AZURE_HOST or AZURE_HOST_SECRET');
        if (!dbName) missingDbSettings.push('AZURE_DATABASE or AZURE_DATABASE_SECRET');

        if (missingDbSettings.length) {
            throw new Error(`Missing required database settings: ${missingDbSettings.join(', ')}`);
        }

        return {
            user: dbUser,
            password: dbPassword,
            server: dbServer,
            database: dbName
        };
    })();

    return resolvedDbSettingsPromise;
}

function isTransientSqlError(error) {
    const code = String(error?.code || '').toUpperCase();
    const message = String(error?.message || '').toLowerCase();

    const transientCodes = new Set([
        'ETIMEOUT',
        'ESOCKET',
        'ECONNRESET',
        'ECONNCLOSED',
        'ELOGIN'
    ]);

    return transientCodes.has(code)
        || message.includes('timeout')
        || message.includes('temporarily unavailable')
        || message.includes('paused')
        || message.includes('resum')
        || message.includes('throttl');
}

async function connectWithRetry(config) {
    let lastError;

    for (let attempt = 1; attempt <= dbConnectRetryAttempts; attempt += 1) {
        try {
            const poolConnection = await mssql.connect(config);
            poolConnection.on('error', (poolError) => {
                console.error('SQL pool error; clearing cached pool', poolError);
                connectedPool = null;
            });
            return poolConnection;
        } catch (error) {
            lastError = error;
            if (!isTransientSqlError(error) || attempt === dbConnectRetryAttempts) {
                throw error;
            }

            const delayMs = dbConnectRetryDelayMs * attempt;
            console.warn(`SQL connect attempt ${attempt}/${dbConnectRetryAttempts} failed; retrying in ${delayMs}ms`, error?.message || error);
            await sleep(delayMs);
        }
    }

    throw lastError;
}

async function getConnectedPool() {
    if (connectedPool) {
        return connectedPool;
    }

    if (connectingPoolPromise) {
        return connectingPoolPromise;
    }

    connectingPoolPromise = (async () => {
        const dbSettings = await getDbSettings();
        const config = {
            ...dbSettings,
            authentication: {
                type: 'default'
            },
            options: {
                encrypt: true
            },
            pool: {
                max: 10,
                min: 0,
                idleTimeoutMillis: 30000
            },
            connectionTimeout: dbConnectTimeoutMs,
            requestTimeout: dbRequestTimeoutMs
        };
        return connectWithRetry(config);
    })();
    try {
        connectedPool = await connectingPoolPromise;
        return connectedPool;
    } finally {
        connectingPoolPromise = null;
    }
}

export const pool = {
    async query(sqlText) {
        const activePool = await getConnectedPool();
        return activePool.query(sqlText);
    },
    request() {
        const requestInputs = [];
        const requestFacade = {
            input(name, type, value) {
                requestInputs.push({ name, type, value });
                return requestFacade;
            },
            async query(sqlText) {
                const activePool = await getConnectedPool();
                let request = activePool.request();
                for (const entry of requestInputs) {
                    request = request.input(entry.name, entry.type, entry.value);
                }
                return request.query(sqlText);
            }
        };
        return requestFacade;
    }
};

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
    const normalizedTeamAId = Number(teamAId);
    const normalizedTeamBId = Number(teamBId);
    if (!Number.isInteger(normalizedTeamAId) || normalizedTeamAId <= 0 || !Number.isInteger(normalizedTeamBId) || normalizedTeamBId <= 0) {
        return [];
    }

    const { clause } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results = await pool.request()
    .input('teamAId', mssql.Int, normalizedTeamAId)
    .input('teamBId', mssql.Int, normalizedTeamBId)
    .query(`
        SELECT ts.map_id, m.name AS map_name, m.icon AS map_icon, m.mode AS map_mode, ts.team_id,
        SUM(CASE WHEN ts.result = 'Win' THEN 1 ELSE 0 END) AS wins,
        SUM(CASE WHEN ts.result = 'Loss' THEN 1 ELSE 0 END) AS losses,
        SUM(CASE WHEN ts.result = 'Draw' THEN 1 ELSE 0 END) AS draws,
        SUM(CASE WHEN ts.map_pick = 1 THEN 1 ELSE 0 END) AS map_pick_count,
        COUNT(*) AS played
        FROM team_stats ts
        INNER JOIN maps m ON ts.map_id = m.map_id
        WHERE ((ts.team_id = @teamAId AND ts.opponent_id = @teamBId) OR (ts.team_id = @teamBId AND ts.opponent_id = @teamAId))
        ${whereClause}
        GROUP BY ts.map_id, m.name, m.icon, m.mode, ts.team_id
        ORDER BY m.name ASC
    `);
    return results.recordset
}

export async function getHeadtoHeadMatches(teamAId,teamBId, tournamentIds = [], mode = 'include'){
    const normalizedTeamAId = Number(teamAId);
    const normalizedTeamBId = Number(teamBId);
    if (!Number.isInteger(normalizedTeamAId) || normalizedTeamAId <= 0 || !Number.isInteger(normalizedTeamBId) || normalizedTeamBId <= 0) {
        return [];
    }

    const { clause } = buildTournamentFilterClause('m.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results = await pool.request()
    .input('teamAId', mssql.Int, normalizedTeamAId)
    .input('teamBId', mssql.Int, normalizedTeamBId)
    .query(`
        SELECT m.match_id, m.date, m.team_1_id, t1.name AS team_1_name, t1.icon AS team_1_icon,
        m.team_1_score, m.team_2_id, t2.name AS team_2_name, t2.icon AS team_2_icon, m.team_2_score,
        tor.name AS tournament, tor.icon AS tournament_icon,tor.ref_link AS tournament_link, m.ref_link
        FROM matches m
        INNER JOIN teams t1 ON m.team_1_id = t1.team_id
        INNER JOIN teams t2 ON m.team_2_id = t2.team_id
        LEFT JOIN tournaments tor ON m.tournament_id = tor.tournament_id
        WHERE ((m.team_1_id = @teamAId AND m.team_2_id = @teamBId) OR (m.team_1_id = @teamBId AND m.team_2_id = @teamAId))
        ${whereClause}
        ORDER BY m.date DESC
    `);
    return results.recordset
}

export async function getTeamTotalStats(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const result = await pool.request().query(`
        SELECT COUNT(*) AS played,
            SUM(CASE WHEN result = 'Win' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN result = 'Loss' THEN 1 ELSE 0 END) AS losses,
            SUM(CASE WHEN result = 'Draw' THEN 1 ELSE 0 END) AS draws
        FROM team_stats
        WHERE team_id = ${team_id}
        ${whereClause}
    `, [...values]);
    return result.recordset
}

export async function getTeamMapPlayed(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const result = await pool.request().query(`
            SELECT COUNT(*) AS played,
                SUM(CASE WHEN result = 'Win' THEN 1 ELSE 0 END) AS wins,
                SUM(CASE WHEN result = 'Loss' THEN 1 ELSE 0 END) AS losses,
                SUM(CASE WHEN result = 'Draw' THEN 1 ELSE 0 END) AS draws,
                COUNT(DISTINCT map_id) AS maps_played
            FROM team_stats
            WHERE team_id = ${team_id}
            ${whereClause}
    `, [...values]);
    return result.recordset
}

export async function getHeadtoHeadBans(teamA_id, teamB_id, tournamentIds = [], mode = 'include'){
    const normalizedTeamAId = Number(teamA_id);
    const normalizedTeamBId = Number(teamB_id);
    if (!Number.isInteger(normalizedTeamAId) || normalizedTeamAId <= 0 || !Number.isInteger(normalizedTeamBId) || normalizedTeamBId <= 0) {
        return [];
    }

    const { clause } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const result = await pool.request()
    .input('teamAId', mssql.Int, normalizedTeamAId)
    .input('teamBId', mssql.Int, normalizedTeamBId)
    .query(`
        SELECT ts.team_id, h.hero_id, h.name AS hero_name, h.icon AS hero_icon, h.role AS hero_role,
            SUM(CASE WHEN ts.ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_for,
            SUM(CASE WHEN ts.opponent_ban_id = h.hero_id THEN 1 ELSE 0 END) AS bans_against
        FROM team_stats ts
        LEFT JOIN heroes h ON h.hero_id IN (ts.ban_id, ts.opponent_ban_id)
        WHERE ((ts.team_id = @teamAId AND ts.opponent_id = @teamBId) OR (ts.team_id = @teamBId AND ts.opponent_id = @teamAId))
        ${whereClause}
        GROUP BY ts.team_id, h.hero_id, h.name, h.icon, h.role
        ORDER BY ts.team_id, bans_for DESC, bans_against DESC
    `);
    return result.recordset
}

export async function getPlayerId(player_name){
    const results =  await pool.request().query(`
            SELECT player_id
            FROM players
            WHERE name = '${player_name}'
            OR alternate_name = '${player_name}'
            `
        );
    return results.recordset[0].player_id; 
}


export async function getTeamIdFromPlayer(player_id){
    const results =  await pool.request().query(`
        SELECT team_id
        FROM players
        WHERE player_id = ${player_id}
        `
    );
    return results.recordset[0].team_id; 
}

export async function getPlayerDetails(player_id) {
    const results =  await pool.request().query(`
        SELECT players.name as name, players.role as role, teams.name as team, teams.icon as team_icon, national_team.icon AS owwc_team_icon, national_team.name AS owwc_team_name
        FROM players
        LEFT JOIN
        teams
        ON players.team_id = teams.team_id
        LEFT JOIN teams national_team ON national_team.team_id = players.national_team
        WHERE player_id = ${player_id}
        `
    );
    return results.recordset[0]; 
}

export async function getTournamentsForPlayer(player_id) {
    const results = await pool.request().query(`
        SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
        FROM player_stats
        INNER JOIN matches
            ON matches.match_id = player_stats.match_id
        INNER JOIN tournaments
            ON tournaments.tournament_id = matches.tournament_id
        WHERE player_stats.player_id = ${player_id}
        ORDER BY tournaments.name ASC
    `);
    return results.recordset;
}

export async function getTournamentsForTeam(team_id) {
    const results = await pool.request().query(`
        SELECT DISTINCT tournaments.tournament_id, tournaments.name, tournaments.icon
        FROM matches
        INNER JOIN tournaments
            ON tournaments.tournament_id = matches.tournament_id
        WHERE matches.team_1_id = ${team_id} OR matches.team_2_id = ${team_id}
        ORDER BY tournaments.name ASC
    `);
    return results.recordset;
}

export async function getMatchesById(team_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
        SELECT *
        FROM (
            SELECT tournaments.name as tournament, tournaments.icon as tournament_icon, tournaments.ref_link as tournament_link ,matches.date,
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
            WHERE team_1_id = ${team_id} ${whereClause}
            UNION
            SELECT tournaments.name as tournament, tournaments.icon as tournament_icon, tournaments.ref_link as tournament_link ,matches.date,
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
            WHERE team_2_id = ${team_id} ${whereClause}
        ) AS tmp
        ORDER BY date DESC
        `,
        [...values]
    );
    return results.recordset; 
}


export async function getPlayerMatchesById(player_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
        SELECT tournament, tournament_icon ,tournament_link , date, team_name, team_icon, opponent, opponent_icon, team_score, opponent_score, ref_link
        FROM (
            SELECT tournaments.name AS tournament,
                tournaments.icon AS tournament_icon,
                tournaments.ref_link as tournament_link ,
                matches.date,
                player_team.name AS team_name,
                player_team.icon AS team_icon,
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
                WHERE player_id = ${player_id}
            ) AS player_stats
            INNER JOIN matches
                ON matches.match_id = player_stats.match_id
            INNER JOIN tournaments
                ON matches.tournament_id = tournaments.tournament_id
            INNER JOIN teams AS player_team
                ON player_team.team_id = player_stats.team_id
            INNER JOIN teams AS team_1
                ON team_1.team_id = matches.team_1_id
            INNER JOIN teams AS team_2
                ON team_2.team_id = matches.team_2_id
            WHERE player_stats.team_id = matches.team_1_id OR player_stats.team_id = matches.team_2_id
            ${whereClause}
        ) AS tmp
        ORDER BY date DESC
        `,
        [...values]
    );
    return results.recordset; 
    
}

export async function getPlayerStats(player_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
        SELECT * 
        FROM (
            SELECT matches.date, opponent.icon as opponent_icon,opponent.name as opponent ,stats.eliminations, stats.assists, stats.deaths, stats.damage, stats.healing, stats.mitigation
            FROM (
                SELECT match_id, team_id, SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
                FROM player_stats
                WHERE player_id = ${player_id}
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
                WHERE player_id = ${player_id}
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
        [...values]
    );
    return results.recordset; 
}


export async function getTotalStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = player_stats.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = player_stats.match_id';
    const results =  await pool.request().query(`
        SELECT SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
        FROM player_stats
        ${joinClause}
        WHERE player_id = ${player_id}
        `,
        [...values]
    );
    return results.recordset[0]; 
}

export async function getAvgStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = player_stats.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = player_stats.match_id';
    const results =  await pool.request().query(`
        SELECT AVG(eliminations) as eliminations, AVG(assists) as assists, AVG(deaths) as deaths, AVG(damage) as damage, AVG(healing) as healing, AVG(mitigation) as mitigation
        FROM player_stats
        ${joinClause}
        WHERE player_id = ${player_id}
        `,
        [...values]
    );
    return results.recordset[0]; 
}

export async function getPlayerList(filters = {}) {
    const request = pool.request();
    const statClauses = [];
    const playerClauses = [];

    const parseCsv = (value) => {
        if (Array.isArray(value)) {
            return value.map(entry => String(entry || '').trim()).filter(Boolean);
        }
        return String(value || '')
            .split(',')
            .map(entry => entry.trim())
            .filter(Boolean);
    };

    const parsePositiveIntList = (value) => parseCsv(value)
        .map(entry => Number(entry))
        .filter(entry => Number.isInteger(entry) && entry > 0);

    const addInClause = (clauses, columnName, values, paramPrefix, typeFactory) => {
        if (!values.length) return;
        const placeholders = values.map((value, index) => {
            const paramName = `${paramPrefix}${index}`;
            request.input(paramName, typeFactory(), value);
            return `@${paramName}`;
        });
        clauses.push(`${columnName} IN (${placeholders.join(', ')})`);
    };

    const tournamentIds = parsePositiveIntList(filters.tournamentIds);
    addInClause(statClauses, 'ps.tournament_id', tournamentIds, 'tournamentId', () => mssql.Int);

    const stages = parsePositiveIntList(filters.stages);
    addInClause(statClauses, 't.stage', stages, 'stage', () => mssql.Int);

    const regions = parseCsv(filters.regions);
    addInClause(statClauses, 't.region', regions, 'region', () => mssql.VarChar(255));

    const teamIds = parsePositiveIntList(filters.teamIds);
    addInClause(statClauses, 'ps.team_id', teamIds, 'teamId', () => mssql.Int);

    const roles = parseCsv(filters.roles);
    addInClause(playerClauses, 'p.role', roles, 'role', () => mssql.VarChar(50));

    const circuits = parseCsv(filters.circuits)
    addInClause(statClauses, 't.circuit', circuits, 'circuit', () => mssql.VarChar(50));


    const statsWhereClause = statClauses.length ? `WHERE ${statClauses.join(' AND ')}` : '';
    const playersWhereClause = playerClauses.length ? `WHERE ${playerClauses.join(' AND ')}` : '';
    const hasStatFilters = tournamentIds.length || stages.length || regions.length || teamIds.length || circuits.length;
    const havingClause = hasStatFilters ? 'HAVING COUNT(fps.player_id) > 0' : '';

    const results = await request.query(`
        WITH filtered_player_stats AS (
            SELECT
                ps.player_id,
                ps.eliminations,
                ps.assists,
                ps.deaths,
                ps.damage,
                ps.healing,
                ps.mitigation
            FROM player_stats ps
            INNER JOIN tournaments t
                ON t.tournament_id = ps.tournament_id
            ${statsWhereClause}
        )
        SELECT
            p.name,
            p.role,
            COALESCE(primary_team.name, national_team.name) as team,
            COALESCE(primary_team.icon, national_team.icon) as team_icon,
            primary_team.name as primary_team_name,
            national_team.name as national_team_name,
            COALESCE(SUM(fps.eliminations), 0) as total_eliminations,
            COALESCE(SUM(fps.assists), 0) as total_assists,
            COALESCE(SUM(fps.deaths), 0) as total_deaths,
            COALESCE(SUM(fps.damage), 0) as total_damage,
            COALESCE(SUM(fps.healing), 0) as total_healing,
            COALESCE(SUM(fps.mitigation), 0) as total_mitigation,
            COALESCE(AVG(fps.eliminations), 0) as avg_eliminations,
            COALESCE(AVG(fps.assists), 0) as avg_assists,
            COALESCE(AVG(fps.deaths), 0) as avg_deaths,
            COALESCE(AVG(fps.damage), 0) as avg_damage,
            COALESCE(AVG(fps.healing), 0) as avg_healing,
            COALESCE(AVG(fps.mitigation), 0) as avg_mitigation
        FROM players p
        LEFT JOIN filtered_player_stats fps
            ON fps.player_id = p.player_id
        LEFT JOIN teams primary_team
            ON p.team_id = primary_team.team_id
        LEFT JOIN teams national_team
            ON p.national_team = national_team.team_id
        ${playersWhereClause}
        GROUP BY p.player_id, p.name, p.role, primary_team.name, primary_team.icon, national_team.name, national_team.icon
        ${havingClause}
        ORDER BY p.name ASC
    `);
    return results.recordset;
}

export async function getPlayerListFilterOptions() {
    const [tournamentsResult, stagesResult, regionsResult, teamsResult, rolesResult, facetsResult] = await Promise.all([
        pool.request().query(`
            SELECT tournament_id, name, stage, region
            FROM tournaments
            ORDER BY name ASC
        `),
        pool.request().query(`
            SELECT DISTINCT stage
            FROM tournaments
            WHERE stage IS NOT NULL
            ORDER BY stage ASC
        `),
        pool.request().query(`
            SELECT DISTINCT region
            FROM tournaments
            WHERE region IS NOT NULL AND LTRIM(RTRIM(region)) <> ''
            ORDER BY region ASC
        `),
        pool.request().query(`
            SELECT team_id, name
            FROM teams
            ORDER BY name ASC
        `),
        pool.request().query(`
            SELECT DISTINCT role
            FROM players
            WHERE role IS NOT NULL AND LTRIM(RTRIM(role)) <> ''
            ORDER BY role ASC
        `),
        pool.request().query(`
            SELECT DISTINCT
                ps.tournament_id AS tournament_id,
                t.name AS tournament_name,
                t.stage AS stage,
                t.region AS region,
                t.circuit AS circuit, 
                ps.team_id AS team_id,
                team.name AS team_name,
                p.role AS role
            FROM player_stats ps
            INNER JOIN tournaments t
                ON t.tournament_id = ps.tournament_id
            INNER JOIN players p
                ON p.player_id = ps.player_id
            LEFT JOIN teams team
                ON team.team_id = ps.team_id
            WHERE ps.tournament_id IS NOT NULL
                AND t.stage IS NOT NULL
                AND t.region IS NOT NULL
                AND LTRIM(RTRIM(t.region)) <> ''
                AND ps.team_id IS NOT NULL
                AND p.role IS NOT NULL
                AND LTRIM(RTRIM(p.role)) <> ''
        `)
    ]);

    return {
        tournaments: tournamentsResult.recordset,
        stages: stagesResult.recordset.map(row => row.stage),
        regions: regionsResult.recordset.map(row => row.region),
        teams: teamsResult.recordset,
        roles: rolesResult.recordset.map(row => row.role),
        circuits : ['OWCS', 'OWWC'],
        facets: facetsResult.recordset
    };
}

export async function getPlayerMapStats(player_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('matches.tournament_id', tournamentIds, mode);
    const joinClause = clause ? `INNER JOIN matches ON matches.match_id = p.match_id AND ${clause}` : 'INNER JOIN matches ON matches.match_id = p.match_id';
    const results =  await pool.request().query(`
    SELECT
    m.name as map,
    m.icon as map_icon,
    m.mode as mode,
    COUNT(p.map_id) as played,
    SUM(CASE WHEN  p.result = 'Win' THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN p.result = 'Draw' THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN p.result = 'Loss' THEN 1 ELSE 0 END) lost
    FROM player_stats as p
    INNER JOIN 
    maps as m
    ON m.map_id = p.map_id
    ${joinClause}
    WHERE p.player_id = ${player_id}
    GROUP BY p.map_id, m.name, m.icon, m.mode
    ORDER BY played DESC
        `,
    [...values]
    );
    return results.recordset; 
}


export async function getPreferredHeroes(player_id) {
    const results =  await pool.request().query(`
    SELECT *
    FROM (
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_1
    WHERE player_id = ${player_id}
    UNION
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_2
    WHERE player_id = ${player_id}
    UNION
    SELECT heroes.name, heroes.icon
    FROM players
    INNER JOIN heroes
    ON heroes.hero_id = players.hero_3
    WHERE player_id = ${player_id}
    ) as tmp
    `
    );
    return results.recordset; 
}

export async function getTeamId(team_name){
    const results =  await pool.request()
        .input('teamName', mssql.NVarChar, team_name)
        .query(`
        SELECT team_id
        FROM teams
        WHERE name = @teamName
        `
    );
    return results.recordset[0]?.team_id ?? null; 
}


export async function getTeamDetails(team_id) {
    const results =  await pool.request().query(`
        SELECT name, region, icon, colour, circuit
        FROM teams
        WHERE team_id = ${team_id}
        `
    );
    return results.recordset[0]; 
}

export async function getRoster(team_id){
    let results = await pool.request().query(`
        SELECT team_id, name, circuit
        FROM teams
        WHERE team_id = ${team_id}
    `);
    const team = results.recordset[0]
    if (!team) {
        return [];
    }

    const isOwwcTeam = String(team.circuit || '').toLowerCase() === 'owwc';
    if (!isOwwcTeam) {
        results =  await pool.request().query(`
            SELECT
                players.role,
                players.name,
                primary_team.name AS primary_team_name,
                primary_team.icon AS primary_team_icon,
                national_team.name AS national_team_name, national_team.icon AS national_team_icon,
                players.team_id AS primary_team_id
            FROM players
            LEFT JOIN teams primary_team
                ON players.team_id = primary_team.team_id
            LEFT JOIN teams national_team ON players.national_team = national_team.team_id
            WHERE players.team_id = ${team_id}
                AND players.active = 1
            ORDER BY players.role
        `);
        return results.recordset;
    }

    results = await pool.request().query(`
        SELECT
            players.role,
            players.name,
            primary_team.name AS primary_team_name,
            primary_team.icon AS primary_team_icon,
            national_team.name AS national_team_name, national_team.icon AS national_team_icon,
            players.team_id AS primary_team_id
        FROM players
        INNER JOIN teams
            ON players.national_team = teams.team_id
        LEFT JOIN teams primary_team
            ON players.team_id = primary_team.team_id
        LEFT JOIN teams national_team ON players.national_team = national_team.team_id
        WHERE teams.team_id = ${team_id}
        ORDER BY players.role
    `);

    return results.recordset;
}

export async function getTeamsWithRoster(circuit = 'all') {
    const normalizedCircuit = String(circuit).toLowerCase();    
    if (normalizedCircuit === 'owwc') {
        const results = await pool.request().query(`
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
            national_team.name AS player_national_team_name,
            national_team.icon AS player_national_team_icon,
            p.team_id AS player_primary_team_id
        FROM teams t
        LEFT JOIN players p
            ON p.national_team = t.team_id
        LEFT JOIN teams national_team
            ON p.national_team = national_team.team_id
        LEFT JOIN teams primary_team ON p.team_id = primary_team.team_id
        WHERE 1 = 1
        AND LOWER(t.circuit) = 'owwc'
        ORDER BY t.region, t.name, p.role, p.name
    `);
    return results.recordset;
    }
    else if (normalizedCircuit === "owcs") {
        const results = await pool.request().query(`
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
            national_team.name AS player_national_team_name,
            national_team.icon AS player_national_team_icon,
            p.team_id AS player_primary_team_id
        FROM teams t
        LEFT JOIN players p
            ON p.team_id = t.team_id
        LEFT JOIN teams primary_team
            ON p.team_id = primary_team.team_id
        LEFT JOIN teams national_team
            ON p.national_team = national_team.team_id
        WHERE 1 = 1
        AND LOWER(t.circuit) = 'owcs'   
        ORDER BY t.region, t.name, p.role, p.name
    `);
    return results.recordset;
    }

    return null
    
}

export async function getMaps(){
    const results = await pool.request().query(`
        SELECT map_id, name as map_name, mode, icon
        FROM maps
    `);
    return results.recordset
}


export async function getMapBanStats(map_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results = await pool.request().query(`
            SELECT h.hero_id, h.name AS hero_name, h.icon AS hero_icon, SUM(x.ban_count) AS bans
            FROM (
                SELECT ban_id AS hero_id, COUNT(*) AS ban_count
                FROM team_stats
                WHERE map_id = ${map_id} AND ban_id IS NOT NULL ${whereClause}
                GROUP BY ban_id
                UNION ALL
                SELECT opponent_ban_id AS hero_id, COUNT(*) AS ban_count
                FROM team_stats
                WHERE map_id = ${map_id} AND opponent_ban_id IS NOT NULL ${whereClause}
                GROUP BY opponent_ban_id
            ) AS x
            INNER JOIN heroes h ON x.hero_id = h.hero_id
            GROUP BY h.hero_id, h.name, h.icon, h.role
            ORDER BY bans DESC
        `, [...values]);
    return results.recordset
}


export async function getMapTeamStats(map_id, tournamentIds = [], mode = 'include'){
    const { clause, values } = buildTournamentFilterClause('ts.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results = await pool.request().query(`
            SELECT t.team_id, t.name AS team_name, t.icon AS team_icon,
            SUM(CASE WHEN ts.result = 'Win' THEN 1 ELSE 0 END) AS wins,
            SUM(CASE WHEN ts.result = 'Draw' THEN 1 ELSE 0 END) AS draws,
            SUM(CASE WHEN ts.result = 'Loss' THEN 1 ELSE 0 END) AS losses,
            COUNT(*) AS played
            FROM team_stats ts
            INNER JOIN teams t ON ts.team_id = t.team_id
            WHERE ts.map_id = ${map_id} AND t.active = 1 ${whereClause}
            GROUP BY t.team_id, t.name, t.icon
        `, [...values]);

    return results.recordset
}

export async function getTeamMapStats(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('t.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
    SELECT
    m.name as map,
    m.icon as map_icon,
    m.mode as mode,
    COUNT(t.map_id) as played,
    SUM(CASE WHEN t.map_pick = 1 THEN 1 ELSE 0 END) AS map_pick_count,
    SUM(CASE WHEN  t.result = 'Win' THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN t.result = 'Draw' THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN t.result = 'Loss' THEN 1 ELSE 0 END) lost
    FROM team_stats as t
    INNER JOIN 
    maps as m
    ON m.map_id = t.map_id
    WHERE t.team_id = ${team_id}
    ${whereClause}
    GROUP BY t.map_id,m.name, m.icon, m.mode
    ORDER BY played DESC
        `,
    [...values]
    );
    return results.recordset; 
}


export async function getBanStats(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
    SELECT
    heroes.name as hero,
    heroes.icon as hero_icon,
    heroes.role as hero_role,
    SUM(bans.bansFor) as bansFor,
    SUM(bans.bansAgainst) as bansAgainst,
    SUM(bans.bansFor) + SUM(bans.bansAgainst) as played,
    AVG(bans.winrate) as winrate
    FROM (
    SELECT ban_id as hero_id, COUNT(*) as bansFor, 0 as bansAgainst,
    SUM(CASE WHEN result='win' THEN 1 ELSE 0 END)*100/COUNT(*) AS winrate
    FROM team_stats
    WHERE team_id = ${team_id} AND ban_id IS NOT NULL ${whereClause}
    GROUP BY ban_id
    UNION ALL
    SELECT opponent_ban_id as hero_id, 0 as bansFor, COUNT(*) as bansAgainst,
    SUM(CASE WHEN result='win' THEN 1 ELSE 0 END)*100/COUNT(*) AS winrate
    FROM team_stats
    WHERE team_id = ${team_id} AND opponent_ban_id IS NOT NULL ${whereClause}
    GROUP BY opponent_ban_id
    ) as bans
    INNER JOIN heroes
    ON heroes.hero_id = bans.hero_id
    GROUP BY heroes.hero_id, heroes.name, heroes.icon, heroes.role
    ORDER BY played DESC    
    `,
    [...values]
    );
    return results.recordset; 
}

export async function getBanResults(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('team_stats.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
    SELECT
    h.name as hero,
    h.mode as role,
    COUNT(h.hero_id) as played,
    SUM(CASE WHEN  t.result = 'Win' THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN t.result = 'Draw' THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN t.result = 'Loss' THEN 1 ELSE 0 END) lost
    FROM team_stats as t
    INNER JOIN 
    heroes as h
    ON m.map_id = t.map_id
    WHERE t.team_id = ${team_id}
    ${whereClause}
    GROUP BY t.map_id,m.name, m.icon, m.mode
    ORDER BY played DESC 
    `,
    [...values]
    );
    return results.recordset; 
}

export async function getRecentTournaments(team_id, tournamentIds = [], mode = 'include') {
    const { clause, values } = buildTournamentFilterClause('placements.tournament_id', tournamentIds, mode);
    const whereClause = clause ? `AND ${clause}` : '';
    const results =  await pool.request().query(`
    SELECT tournaments.icon, tournaments.name, tournaments.start_date, tournaments.end_date, tournaments.ref_link, placements.placement
    FROM placements
    INNER JOIN
    tournaments
    ON placements.tournament_id = tournaments.tournament_id
    WHERE team_id = ${team_id} ${whereClause}
    ORDER BY tournaments.end_date DESC
    `,
    [...values]
    );
    return results.recordset;
}


async function createTeamStatsTable() {
    const results = await pool.request().query(`
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
    const results = await pool.request().query(`
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
    const results = await pool.request().query(`
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
    const results = await pool.request().query(`
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