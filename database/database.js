import mysql from 'mysql2';
import dotenv from 'dotenv';
dotenv.config();

let pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE
}).promise();


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
    const [[results]] =  await pool.query(`
        SELECT players.name as name, players.role as role, teams.name as team, teams.icon as team_icon
        FROM players
        INNER JOIN
        teams
        ON players.team_id = teams.team_id
        WHERE player_id = ?
        `,
        [player_id]
    );
    return results; 
}

export async function getMatchesById(team_id){
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
            WHERE team_1_id = ?
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
            WHERE team_2_id = ?
        ) AS tmp
        ORDER BY date
        LIMIT 20;
        `,
        [team_id, team_id]
    );
    return results; 
    
}

export async function getPlayerStats(player_id){
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
            WHERE matches.team_1_id = stats.team_id
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
            WHERE matches.team_2_id = stats.team_id
        ) AS tmp
        ORDER BY date
        LIMIT 20;
        `,
        [player_id, player_id]
    );
    return results; 
}


export async function getTotalStats(player_id) {
    const [[results]] =  await pool.query(`
        SELECT SUM(eliminations) as eliminations, SUM(assists) as assists, SUM(deaths) as deaths, SUM(damage) as damage, SUM(healing) as healing, SUM(mitigation) as mitigation
        FROM player_stats
        WHERE player_id = ?
        `,
        player_id
    );
    return results; 
}

export async function getAvgStats(player_id) {
    const [[results]] =  await pool.query(`
        SELECT AVG(eliminations) as eliminations, AVG(assists) as assists, AVG(deaths) as deaths, AVG(damage) as damage, AVG(healing) as healing, AVG(mitigation) as mitigation
        FROM player_stats
        WHERE player_id = ?
        `,
        player_id
    );
    return results; 
}

export async function getMapStats(player_id) {
    const [results] =  await pool.query(`
    SELECT
    m.name as map,
    SUM(CASE WHEN  p.result = "Win" AND p.player_id = ? THEN 1 ELSE 0 END) won, 
    SUM(CASE WHEN p.result = "Draw" AND p.player_id = ? THEN 1 ELSE 0 END) drawn, 
    SUM(CASE WHEN p.result = "Loss" AND p.player_id = ? THEN 1 ELSE 0 END) lost
    FROM player_stats as p
    INNER JOIN 
    maps as m
    ON m.map_id = p.map_id
    GROUP BY p.map_id
        `,
        [player_id, player_id, player_id]
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