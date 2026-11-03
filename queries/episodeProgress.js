import { poolQuery, getClient } from "../config/dbConn.js";
import { v4 as uuidv4 } from "uuid";

async function getCurrentTime (userID, episodeID) {
  const text = `SELECT currentplaytime FROM episodes_progress WHERE user_id = $1 AND episode_id = $2`
  const values = [userID, episodeID]
  const result = await poolQuery(text, values)
  return result.rows.length > 0 ? result.rows[0] : null
}

async function startEpTime (userID, episodeID) {
  const client = await getClient()

  try {
    await client.query('BEGIN')
    const query = `INSERT INTO episodes_progress(id, currentplaytime, user_id, episode_id) VALUES($1, $2, $3, $4)`
    const values = [uuidv4(), 0, userID, episodeID]
    const result = await client.query(query, values)
    await client.query('COMMIT')
    return await getCurrentTime(userID, episodeID)
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
} 

async function updateCurrentTime(playtime, userID, episodeID) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const query = `UPDATE episodes_progress SET currentplaytime = $1, updated_at = now() WHERE user_id = $2 AND episode_id = $3`
    const values = [playtime, userID, episodeID]
    const result = await client.query(query, values)
    await client.query('COMMIT')
    return result
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export {getCurrentTime, startEpTime, updateCurrentTime}