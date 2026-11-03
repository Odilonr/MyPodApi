import express from 'express'
import { recentController, favoritesController, addFavoriteController, removeFavoriteController,
  playlistsController, createPlaylistController, playlistController, deletePlaylistController,
  addPlaylistEpisodeController, removePlaylistEpisodeController } from '../controllers/libraryController.js'
import { getLayoutController, saveLayoutController } from '../controllers/layoutController.js'
import { previewFeedController, importFeedController, listFeedsController, editFeedController,
  refreshFeedController, deleteFeedController } from '../controllers/feedController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { feedLimiter } from '../middleware/rateLimiters.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { validateId } from '../middleware/validateId.js'

const router = express.Router()

router.use(verifyJWT)
router.param('id', validateId)
router.param('episodeId', validateId)

router.get('/layout', asynHandler(getLayoutController))
router.put('/layout', asynHandler(saveLayoutController))

router.get('/feeds', asynHandler(listFeedsController))
router.post('/feeds/preview', feedLimiter, asynHandler(previewFeedController))
router.post('/feeds', feedLimiter, asynHandler(importFeedController))
router.patch('/feeds/:id', asynHandler(editFeedController))
router.post('/feeds/:id/refresh', feedLimiter, asynHandler(refreshFeedController))
router.delete('/feeds/:id', asynHandler(deleteFeedController))

router.get('/recent', asynHandler(recentController))

router.get('/favorites', asynHandler(favoritesController))
router.put('/favorites/:episodeId', asynHandler(addFavoriteController))
router.delete('/favorites/:episodeId', asynHandler(removeFavoriteController))

router.get('/playlists', asynHandler(playlistsController))
router.post('/playlists', asynHandler(createPlaylistController))
router.get('/playlists/:id', asynHandler(playlistController))
router.delete('/playlists/:id', asynHandler(deletePlaylistController))
router.put('/playlists/:id/episodes/:episodeId', asynHandler(addPlaylistEpisodeController))
router.delete('/playlists/:id/episodes/:episodeId', asynHandler(removePlaylistEpisodeController))

export default router
