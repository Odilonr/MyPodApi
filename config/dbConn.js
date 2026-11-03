import pg from 'pg'
import dotenv from 'dotenv'
dotenv.config()

const { Pool } = pg

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
})

// A dropped idle connection must not stop the whole server.
pool.on('error', (err) => {
  console.error(`Database connection error: ${err.message}`)
})

async function poolQuery(text, params) {
  const res = await pool.query(text, params)
  return res
}

async function getClient() {
  const client = await pool.connect()
  return client
}


export {poolQuery,getClient}



