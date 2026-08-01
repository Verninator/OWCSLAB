import express from 'express';
import dotenv from 'dotenv';
import * as db from './database/database.js'
import cors from 'cors'
import { fileURLToPath } from 'url';
import { dirname } from 'path';

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

app.get('/', (req,res) => {
    res.send("Hello World!!");
});


app.get('/api/players', (req,res) => {
    res.send([1,2,3]);
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



// PORT
const port = process.env.PORT;
app.listen(3000, () => console.log(`Listening on port ${port}....`));