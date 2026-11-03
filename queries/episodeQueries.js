import { poolQuery, getClient} from '../config/dbConn.js'
import { v4 as uuidv4 } from 'uuid'
import { getAllowedColumns } from './allowedColumns.js'

const DEFAULT_LATEST_LIMIT = 8
const UPDATABLE_COLUMNS = ['title', 'description', 'audio_link', 'date_added', 'date_updated', 'duration', 'show_id']

async function getEpisodes (queryType, limit) {
  if (queryType === 'Latest') {
    return await getLatestEpisodes(limit)
  } else if (queryType == 'Hero') {
    return await getHeroEpisodes()
  } else {
    const text = `SELECT * FROM episodes`
    const result = await poolQuery(text)
    return result.rows.length > 0 ? result.rows : null
  }
}

async function getHeroEpisodes () {
  const text = `SELECT DISTINCT ON (shows.review_count) episodes.*, 
                shows.profile_img_link AS profile, shows.name AS show_name 
                FROM episodes
                LEFT JOIN shows ON episodes.show_id = shows.id 
                GROUP BY episodes.id, shows.review_count, shows.profile_img_link, show_name
                ORDER BY review_count DESC LIMIT 8`
  const result = await poolQuery(text)
  return result.rows.length > 0 ? result.rows : null
}

async function getLatestEpisodes(limit = DEFAULT_LATEST_LIMIT) {
  const text = `SELECT episodes.*, shows.profile_img_link AS profile,
                shows.name AS show_name FROM episodes LEFT JOIN shows ON episodes.show_id = shows.id 
                ORDER BY date_added DESC LIMIT $1`
  const result = await poolQuery(text, [limit])
  return result.rows.length > 0 ? result.rows : null
}

async function getEpisodesByShow (showID) {
  const queryText = `SELECT episodes.*, shows.profile_img_link AS profile, shows.name AS show_name
                     FROM episodes LEFT JOIN shows ON episodes.show_id = shows.id
                     WHERE episodes.show_id = $1 ORDER BY date_added DESC`
  const result = await poolQuery(queryText, [showID])
  return result.rows
}

async function getEpByTitleShowId (episodeTitle, showID) {
  const queryText = `SELECT * FROM episodes WHERE title = $1 AND show_id = $2`
  const result = await poolQuery(queryText, [episodeTitle, showID])
  return result.rows.length > 0 ? result.rows[0] : null
}

async function getEpisodeById(episodeID) {
  const queryText = `SELECT episodes.*, shows.profile_img_link AS profile, shows.name AS show_name
                     FROM episodes LEFT JOIN shows ON episodes.show_id = shows.id 
                     WHERE episodes.id = $1`
  const result = await poolQuery(queryText, [episodeID])
  return result.rows.length > 0 ? result.rows[0] : null
}

async function addEpisode (newEpisode) {
  const client = await getClient()

  try {
    await client.query('BEGIN')
    const queryText = `INSERT INTO episodes(id, title, description, audio_link, date_added, date_updated,  
    duration, show_id)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8)`
    const values = [uuidv4(), newEpisode.title, newEpisode.description, newEpisode.audio_link, 
      newEpisode.date_added, newEpisode.date_added, newEpisode.duration, newEpisode.show_id
    ]
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

async function updateEpisode (episodeID, updates) {
  const updateKeys = getAllowedColumns(updates, UPDATABLE_COLUMNS)
  const client = await getClient()
  try {
    await client.query('BEGIN')
    for (let key of updateKeys) {
      const queryText = `UPDATE episodes SET ${key} = $1 WHERE id = $2`
      const values = [updates[key], episodeID]
      const result = await client.query(queryText, values) 
    }
    await client.query('COMMIT')
    const changedEp = await getEpisodeById(episodeID)
    return changedEp
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function deleteEpisode(episodeID) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const queryText = `DELETE FROM episodes WHERE id = $1`
    const result = await client.query(queryText, [episodeID])
    await client.query('COMMIT')
    return result.rows
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}


export {getEpisodes, getEpisodesByShow, getEpisodeById, getEpByTitleShowId , addEpisode, updateEpisode, deleteEpisode}