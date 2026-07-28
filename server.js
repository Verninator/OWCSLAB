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

app.get('/', (req,res) => {
    res.send("Hello World!!");
});


app.get('/api/players', (req,res) => {
    res.send([1,2,3]);
})

app.get('/api/players/:id', async (req,res) => {
    let result = {}
    let player_id = parseInt(req.params.id)
    let team_id = await db.getTeamIdFromPlayer(player_id)
    result["matches"] = await db.getMatchesById(parseInt(team_id))
    result["stats"] = await db.getPlayerStats(player_id)
    result["total"] = await db.getTotalStats(player_id)
    result["avg"] = await db.getAvgStats(player_id)
    result["player_details"] = await db.getPlayerDetails(player_id)
    result["maps"] = await db.getMapStats(player_id)
    result["heroes"] = await db.getPreferredHeroes(player_id)
    res.send(result);
})

app.get('/players', (req,res) => {
    console.log(__dirname)
    res.sendFile('/website/player.html', {root: __dirname })
})

// PORT
const port = process.env.PORT;
app.listen(3000, () => console.log(`Listening on port ${port}....`));