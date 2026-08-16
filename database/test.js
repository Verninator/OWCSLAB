import mssql from 'mssql';
import dotenv from 'dotenv';
dotenv.config();


const config = {
    user: process.env.AZURE_USER, 
    password: process.env.AZURE_PASSWORD, 
    server: process.env.AZURE_HOST, 
    database: process.env.AZURE_DATABASE, 
    authentication: {
        type: 'default'
    },
    options: {
        encrypt: true
    }
}

console.log(config)

export const pool = await mssql.connect(config);

var resultSet = await pool.request().query(`SELECT * FROM players`);
console.log(`${resultSet.recordset.length} rows returned.`);

console.log(await getMatchesById(1));




