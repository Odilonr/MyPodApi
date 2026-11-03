import createError from 'http-errors'
import { z } from 'zod'
import { getEpisodeById } from '../queries/episodeQueries.js'
import { getRecentEpisodes, getFavoriteEpisodes, addFavorite, removeFavorite, getPlaylists, createPlaylist,
  getOwnPlaylist, getPlaylistEpisodes, deleteOwnPlaylist, addPlaylistEpisode, removePlaylistEpisode } from '../queries/libraryQueries.js'

const playlistNameSchema = z.string().trim().min(1).max(60)

async function requireEpisode (episodeID) {
  if (!(await getEpisodeById(episodeID))) {
    throw createError(404, 'Episode not found')
  }
}

async function requireOwnPlaylist (req) {
  const playlist = await getOwnPlaylist(req.user, req.params.id)
  if (!playlist) {
    throw createError(404, 'Playlist not found')
  }
  return playlist
}

async function recentController (req, res) {
  res.json(await getRecentEpisodes(req.user))
}

async function favoritesController (req, res) {
  res.json(await getFavoriteEpisodes(req.user))
}

async function addFavoriteController (req, res) {
  await requireEpisode(req.params.episodeId)
  await addFavorite(req.user, req.params.episodeId)
  res.sendStatus(204)
}

async function removeFavoriteController (req, res) {
  await removeFavorite(req.user, req.params.episodeId)
  res.sendStatus(204)
}

async function playlistsController (req, res) {
  res.json(await getPlaylists(req.user))
}

async function createPlaylistController (req, res) {
  const name = playlistNameSchema.safeParse(req.body?.name)
  if (!name.success) {
    throw createError(400, 'Playlist name must be 1 to 60 characters')
  }
  const playlist = await createPlaylist(req.user, name.data)
  if (!playlist) {
    throw createError(409, 'You already have a playlist with this name')
  }
  res.status(201).json(playlist)
}

async function playlistController (req, res) {
  const playlist = await requireOwnPlaylist(req)
  res.json({ ...playlist, episodes: await getPlaylistEpisodes(playlist.id) })
}

async function deletePlaylistController (req, res) {
  if (!(await deleteOwnPlaylist(req.user, req.params.id))) {
    throw createError(404, 'Playlist not found')
  }
  res.sendStatus(204)
}

async function addPlaylistEpisodeController (req, res) {
  const playlist = await requireOwnPlaylist(req)
  await requireEpisode(req.params.episodeId)
  await addPlaylistEpisode(playlist.id, req.params.episodeId)
  res.sendStatus(204)
}

async function removePlaylistEpisodeController (req, res) {
  const playlist = await requireOwnPlaylist(req)
  await removePlaylistEpisode(playlist.id, req.params.episodeId)
  res.sendStatus(204)
}

export { recentController, favoritesController, addFavoriteController, removeFavoriteController,
  playlistsController, createPlaylistController, playlistController, deletePlaylistController,
  addPlaylistEpisodeController, removePlaylistEpisodeController }
