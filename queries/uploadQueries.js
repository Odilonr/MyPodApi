import { poolQuery, getClient } from '../config/dbConn.js'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

const UPLOADED_LINK = 'uploaded'
const localNow = () => format(new Date(), 'yyyy-MM-dd HH:mm:ss')

const PUBLIC_COLUMNS = `episodes.id, episodes.title, episodes.description, episodes.audio_link, episodes.date_added,
  episodes.duration, episodes.show_id, episodes.media_type`

async function getUsedStorage (userID) {
  const result = await poolQuery(
    `SELECT COALESCE(SUM(episodes.file_size), 0)::bigint AS used
     FROM episodes JOIN shows ON episodes.show_id = shows.id
     WHERE shows.owner_id = $1`,
    [userID]
  )
  return Number(result.rows[0].used)
}

// Every lookup includes the owner, so another user's ID finds nothing.
async function getOwnedUpload (userID, episodeID) {
  const result = await poolQuery(
    `SELECT ${PUBLIC_COLUMNS}, episodes.storage_key, episodes.content_type
     FROM episodes JOIN shows ON episodes.show_id = shows.id
     WHERE episodes.id = $1 AND shows.owner_id = $2 AND episodes.storage_key IS NOT NULL`,
    [episodeID, userID]
  )
  return result.rows[0] ?? null
}

async function getOwnedUploadShow (client, userID, showID) {
  const result = await client.query('SELECT * FROM shows WHERE id = $1 AND owner_id = $2', [showID, userID])
  return result.rows[0] ?? null
}

// Finds the user's upload show with this name, or creates it. Only a new show
// takes the suggested category and host.
async function findOrCreateShow (client, userID, name, category, artist) {
  const result = await client.query(
    `INSERT INTO shows(id, name, description, profile_img_link, release_schedule, studio, host_name, show_type, date_added, owner_id)
     VALUES($1, $2, '', 'generated', 'Uploaded by you', $3, $3, $4, $5, $6)
     ON CONFLICT (owner_id, name) WHERE owner_id IS NOT NULL AND feed_url IS NULL
     DO UPDATE SET name = EXCLUDED.name
     RETURNING id`,
    [uuidv4(), name, artist, category, localNow(), userID]
  )
  return result.rows[0].id
}

async function createUpload (userID, { storageKey, fileSize, contentType, title, showName, category, artist, duration }) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const showID = await findOrCreateShow(client, userID, showName, category, artist)
    const now = localNow()
    const episode = await client.query(
      `INSERT INTO episodes(id, title, description, audio_link, date_added, date_updated, duration, show_id, storage_key, content_type, file_size)
       VALUES($1, $2, '', $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING ${PUBLIC_COLUMNS.replaceAll('episodes.', '')}`,
      [uuidv4(), title, UPLOADED_LINK, now, now, duration, showID, storageKey, contentType, fileSize]
    )
    const show = await getOwnedUploadShow(client, userID, showID)
    await client.query('COMMIT')
    return { episode: episode.rows[0], show }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function removeShowIfEmpty (client, showID) {
  const result = await client.query(
    `DELETE FROM shows WHERE id = $1 AND feed_url IS NULL
     AND NOT EXISTS (SELECT 1 FROM episodes WHERE episodes.show_id = $1)
     RETURNING id`,
    [showID]
  )
  return result.rows.length > 0
}

async function updateUpload (userID, episodeID, { title, showName, category }) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const found = await client.query(
      `SELECT episodes.show_id, shows.host_name, shows.show_type
       FROM episodes JOIN shows ON episodes.show_id = shows.id
       WHERE episodes.id = $1 AND shows.owner_id = $2 AND episodes.storage_key IS NOT NULL`,
      [episodeID, userID]
    )
    if (found.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }
    const { show_id: oldShowID, host_name: hostName, show_type: oldCategory } = found.rows[0]

    let showID = oldShowID
    if (showName !== undefined) {
      showID = await findOrCreateShow(client, userID, showName, category ?? oldCategory, hostName)
    }
    await client.query(
      `UPDATE episodes SET title = COALESCE($1, title), show_id = $2, date_updated = $3 WHERE id = $4`,
      [title ?? null, showID, localNow(), episodeID]
    )
    if (category !== undefined) {
      await client.query(`UPDATE shows SET show_type = $1 WHERE id = $2 AND owner_id = $3`, [category, showID, userID])
    }
    if (showID !== oldShowID) await removeShowIfEmpty(client, oldShowID)

    const episode = await client.query(`SELECT ${PUBLIC_COLUMNS} FROM episodes WHERE id = $1`, [episodeID])
    const show = await getOwnedUploadShow(client, userID, showID)
    await client.query('COMMIT')
    return { episode: episode.rows[0], show }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function deleteUpload (userID, episodeID) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const result = await client.query(
      `DELETE FROM episodes USING shows
       WHERE episodes.show_id = shows.id AND episodes.id = $1 AND shows.owner_id = $2 AND episodes.storage_key IS NOT NULL
       RETURNING episodes.storage_key, episodes.show_id`,
      [episodeID, userID]
    )
    if (result.rows.length === 0) {
      await client.query('ROLLBACK')
      return null
    }
    const { storage_key: storageKey, show_id: showID } = result.rows[0]
    const showRemoved = await removeShowIfEmpty(client, showID)
    await client.query('COMMIT')
    return { storageKey, showRemoved }
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

async function getShowStorageKeys (userID, showID) {
  const result = await poolQuery(
    `SELECT episodes.storage_key FROM episodes JOIN shows ON episodes.show_id = shows.id
     WHERE shows.id = $1 AND shows.owner_id = $2 AND episodes.storage_key IS NOT NULL`,
    [showID, userID]
  )
  return result.rows.map((row) => row.storage_key)
}

export { getUsedStorage, getOwnedUpload, createUpload, updateUpload, deleteUpload, getShowStorageKeys }
