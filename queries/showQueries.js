import { poolQuery, getClient} from "../config/dbConn.js";
import {v4 as uuidv4} from 'uuid'
import { format } from 'date-fns';
import { getAllowedColumns } from './allowedColumns.js'

const UPDATABLE_COLUMNS = ['name', 'description', 'profile_img_link', 'release_schedule', 'studio',
  'host_name', 'host_img_link', 'review_stars', 'review_count', 'rated', 'show_type']

// A show with an owner is private. Pass no user to see only the catalog.
async function getShows (type, userID = null) {
  if (type === 'Popular') {
    return await getShowsRanked(userID)
  }
  const text = `SELECT * FROM shows WHERE (shows.owner_id IS NULL OR shows.owner_id = $1)`
  const result = await poolQuery(text, [userID])
  return result.rows.length > 0 ? result.rows : null
}

async function getShowsRanked(userID = null) {
  const text = `SELECT * FROM shows WHERE (shows.owner_id IS NULL OR shows.owner_id = $1) ORDER BY review_count DESC LIMIT 8`
  const result = await poolQuery(text, [userID])
  return result.rows.length > 0 ? result.rows : null
}

async function getShowByName (showName) {
  const queryText = `SELECT * FROM shows WHERE name = $1 AND owner_id IS NULL`
  const result = await poolQuery(queryText, [showName])
  return result.rows.length > 0 ? result.rows[0] : null
}

async function getShowById(showID, userID = null) {
  const queryText = `SELECT * FROM shows WHERE id = $1 AND (shows.owner_id IS NULL OR shows.owner_id = $2)`
  const result = await poolQuery(queryText, [showID, userID])
  return result.rows.length > 0 ? result.rows[0] : null
}

async function addShow (newShow) {
  const client = await getClient()
  const date_added = format(new Date(), 'yyyy-MM-dd HH:mm:ss')

  try {
    await client.query('BEGIN')
    const queryText = `INSERT INTO shows(id, name, description, profile_img_link, release_schedule ,studio, 
    host_name, host_img_link, review_stars, review_count, rated, date_added, show_type) 
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`
    const values = [uuidv4(), newShow.name, newShow.description, newShow.profile_img_link, 
      newShow.release_schedule, newShow.studio, newShow.host_name, newShow.host_img_link, newShow.review_stars, 
      newShow.review_count, newShow.rated, date_added, newShow.show_type
    ]
    const result = await client.query(queryText, values)
    await client.query('COMMIT')
    return result.rows
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function updateShow (showID, updates) {
  const updateKeys = getAllowedColumns(updates, UPDATABLE_COLUMNS)
  const client = await getClient()
  try {
    await client.query('BEGIN')
    for (let key of updateKeys) {
      const queryText = `UPDATE shows SET ${key} = $1 WHERE id = $2`
      const values = [updates[key], showID]
      await client.query(queryText, values) 
    }
    await client.query('COMMIT')
  } catch(e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function deleteShow (showID) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const deleteEpisodeQuery = `DELETE FROM episodes WHERE show_id = $1`
    await client.query(deleteEpisodeQuery, [showID])
    const deleteShowQuery = `DELETE FROM shows WHERE id = $1;`
    const result = await client.query(deleteShowQuery, [showID])
    await client.query('COMMIT')
    return result.rows
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}


export {getShows, addShow, getShowByName, updateShow, getShowById, deleteShow}

