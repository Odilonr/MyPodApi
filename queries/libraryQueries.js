import { poolQuery } from '../config/dbConn.js'
import { v4 as uuidv4 } from 'uuid'

const EPISODE_COLUMNS = `episodes.*, shows.profile_img_link AS profile, shows.name AS show_name`
const RECENT_LIMIT = 12

async function getRecentEpisodes (userID) {
  const queryText = `SELECT ${EPISODE_COLUMNS}, episodes_progress.currentplaytime
                     FROM episodes_progress
                     JOIN episodes ON episodes_progress.episode_id = episodes.id
                     LEFT JOIN shows ON episodes.show_id = shows.id
                     WHERE episodes_progress.user_id = $1
                     ORDER BY episodes_progress.updated_at DESC LIMIT $2`
  const result = await poolQuery(queryText, [userID, RECENT_LIMIT])
  return result.rows
}

async function getFavoriteEpisodes (userID) {
  const queryText = `SELECT ${EPISODE_COLUMNS}
                     FROM favorites
                     JOIN episodes ON favorites.episode_id = episodes.id
                     LEFT JOIN shows ON episodes.show_id = shows.id
                     WHERE favorites.user_id = $1
                     ORDER BY favorites.created_at DESC`
  const result = await poolQuery(queryText, [userID])
  return result.rows
}

async function addFavorite (userID, episodeID) {
  const queryText = `INSERT INTO favorites(user_id, episode_id) VALUES($1, $2) ON CONFLICT DO NOTHING`
  await poolQuery(queryText, [userID, episodeID])
}

async function removeFavorite (userID, episodeID) {
  await poolQuery(`DELETE FROM favorites WHERE user_id = $1 AND episode_id = $2`, [userID, episodeID])
}

async function getPlaylists (userID) {
  const queryText = `SELECT playlists.id, playlists.name, playlists.created_at, COUNT(playlist_episodes.episode_id)::int AS episode_count
                     FROM playlists
                     LEFT JOIN playlist_episodes ON playlist_episodes.playlist_id = playlists.id
                     WHERE playlists.user_id = $1
                     GROUP BY playlists.id
                     ORDER BY playlists.created_at DESC`
  const result = await poolQuery(queryText, [userID])
  return result.rows
}

// Returns null when the user already has a playlist with this name.
async function createPlaylist (userID, name) {
  const queryText = `INSERT INTO playlists(id, user_id, name) VALUES($1, $2, $3)
                     ON CONFLICT (user_id, name) DO NOTHING
                     RETURNING id, name, created_at`
  const result = await poolQuery(queryText, [uuidv4(), userID, name])
  return result.rows[0] ?? null
}

// Every playlist lookup includes the owner, so another user's ID finds nothing.
async function getOwnPlaylist (userID, playlistID) {
  const queryText = `SELECT id, name, created_at FROM playlists WHERE id = $1 AND user_id = $2`
  const result = await poolQuery(queryText, [playlistID, userID])
  return result.rows[0] ?? null
}

async function getPlaylistEpisodes (playlistID) {
  const queryText = `SELECT ${EPISODE_COLUMNS}
                     FROM playlist_episodes
                     JOIN episodes ON playlist_episodes.episode_id = episodes.id
                     LEFT JOIN shows ON episodes.show_id = shows.id
                     WHERE playlist_episodes.playlist_id = $1
                     ORDER BY playlist_episodes.position`
  const result = await poolQuery(queryText, [playlistID])
  return result.rows
}

async function deleteOwnPlaylist (userID, playlistID) {
  const result = await poolQuery(`DELETE FROM playlists WHERE id = $1 AND user_id = $2 RETURNING id`, [playlistID, userID])
  return result.rows.length > 0
}

async function addPlaylistEpisode (playlistID, episodeID) {
  const queryText = `INSERT INTO playlist_episodes(playlist_id, episode_id) VALUES($1, $2) ON CONFLICT DO NOTHING`
  await poolQuery(queryText, [playlistID, episodeID])
}

async function removePlaylistEpisode (playlistID, episodeID) {
  await poolQuery(`DELETE FROM playlist_episodes WHERE playlist_id = $1 AND episode_id = $2`, [playlistID, episodeID])
}

export { getRecentEpisodes, getFavoriteEpisodes, addFavorite, removeFavorite, getPlaylists, createPlaylist,
  getOwnPlaylist, getPlaylistEpisodes, deleteOwnPlaylist, addPlaylistEpisode, removePlaylistEpisode }
