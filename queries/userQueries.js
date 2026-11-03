import { poolQuery, getClient} from "../config/dbConn.js";
import {v4 as uuidv4} from 'uuid'
import { format } from 'date-fns';


async function getUser (username) {
  const queryText = `SELECT * FROM users WHERE username = $1`
  const result = await poolQuery(queryText, [username])
  return result.rows[0]
}

async function getUserByToken(refresh_token) {
  const queryText = `SELECT * FROM users WHERE refresh_token = $1`
  const result = await poolQuery(queryText, [refresh_token])
  return result.rows[0]
}

async function createUser(newUser) {
  const client = await getClient()
  const currentDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
  try {
    await client.query('BEGIN')
    const queryText = `INSERT INTO users(id, created_at, updated_at, username, password, email)
      VALUES($1, $2, $3, $4, $5, $6)`
    const values = [uuidv4(), currentDate, currentDate, newUser.username, newUser.password, newUser.email]
    const result = await client.query(queryText, values)
    await client.query('COMMIT')
    return result
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function addRefreshToken(userID, refreshToken) {
  const client = await getClient()
  const currentDate = format(new Date(), 'yyyy-MM-dd HH:mm:ss')
  try {
    await client.query('BEGIN')
    const queryText = `UPDATE users SET refresh_token = $1, updated_at = $2 WHERE id = $3`
    const values = [refreshToken, currentDate, userID]
    const result = await client.query(queryText, values)
    await client.query('COMMIT')
    return result
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function setUserAdmin(username) {
  const queryText = `UPDATE users SET is_admin = TRUE WHERE username = $1 RETURNING id`
  const result = await poolQuery(queryText, [username])
  return result.rows.length > 0
}

export {getUser, getUserByToken,  createUser, addRefreshToken, setUserAdmin}

