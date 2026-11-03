import { poolQuery, getClient } from '../config/dbConn.js'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const SHOW_COLUMNS = `shows.*, (SELECT COUNT(*)::int FROM episodes WHERE episodes.show_id = shows.id) AS episode_count`
const localTime = (date) => format(date, 'yyyy-MM-dd HH:mm:ss')

// Every query here includes the owner, so another user's ID finds nothing.
async function getImportedShows (userID) {
  const queryText = `SELECT ${SHOW_COLUMNS} FROM shows WHERE owner_id = $1 ORDER BY date_added DESC`
  const result = await poolQuery(queryText, [userID])
  return result.rows
}

async function getImportedShow (userID, showID) {
  const queryText = `SELECT ${SHOW_COLUMNS} FROM shows WHERE id = $1 AND owner_id = $2`
  const result = await poolQuery(queryText, [showID, userID])
  return result.rows[0] ?? null
}

async function countImportedShows (userID) {
  const result = await poolQuery(`SELECT COUNT(*)::int AS count FROM shows WHERE owner_id = $1`, [userID])
  return result.rows[0].count
}

async function insertEpisodes (client, showID, episodes) {
  let added = 0
  for (const episode of episodes) {
    const date = localTime(episode.publishedAt)
    const result = await client.query(
      `INSERT INTO episodes(id, title, description, audio_link, date_added, date_updated, duration, show_id, external_id)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (show_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [uuidv4(), episode.title, episode.description, episode.audioUrl, date, date, episode.duration, showID, episode.externalId]
    )
    added += result.rows.length
  }
  return added
}

// Returns null when this user has already imported this feed.
async function createImportedShow (userID, feedUrl, { show, episodes }, { name, category }) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `INSERT INTO shows(id, name, description, profile_img_link, release_schedule, studio, host_name, show_type, date_added, owner_id, feed_url, source_link)
       VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       ON CONFLICT (owner_id, feed_url) WHERE owner_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [uuidv4(), name, show.description, show.image ?? 'generated', 'From RSS feed', show.author ?? 'Unknown', show.author ?? 'Unknown',
        category, localTime(new Date()), userID, feedUrl, show.link]
    )
    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }
    await insertEpisodes(client, result.rows[0].id, episodes)
    await client.query('COMMIT')
    return result.rows[0].id
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function addNewEpisodes (showID, episodes) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const added = await insertEpisodes(client, showID, episodes)
    await client.query('COMMIT')
    return added
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function updateImportedShow (userID, showID, { name, category }) {
  const queryText = `UPDATE shows SET name = COALESCE($1, name), show_type = COALESCE($2, show_type)
                     WHERE id = $3 AND owner_id = $4 RETURNING id`
  const result = await poolQuery(queryText, [name ?? null, category ?? null, showID, userID])
  return result.rows.length > 0
}

async function deleteImportedShow (userID, showID) {
  const result = await poolQuery(`DELETE FROM shows WHERE id = $1 AND owner_id = $2 RETURNING id`, [showID, userID])
  return result.rows.length > 0
}

export { getImportedShows, getImportedShow, countImportedShows, createImportedShow, addNewEpisodes, updateImportedShow, deleteImportedShow }
