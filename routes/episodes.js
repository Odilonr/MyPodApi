import express from 'express'
import {getAllEpisodesController, addEpisodeController, updateEpisodeController, 
  deleteEpisodeController, getEpisodeController, getCurrentPlayTime, updateCurrentEpTime, audioEpController
 } from '../controllers/episodeController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { validateId } from '../middleware/validateId.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = express.Router()

router.param('id', validateId)

const adminOnly = [verifyJWT, requireAdmin]

router.get('/', getAllEpisodesController)
router.post('/', adminOnly, asynHandler(addEpisodeController))
router.put('/:id', adminOnly, asynHandler(updateEpisodeController))
router.delete('/:id', adminOnly, asynHandler(deleteEpisodeController))

router.get('/ep/:id', asynHandler(getEpisodeController))

router.get('/audio', asynHandler(audioEpController))
router.get('/:id/timestamp', verifyJWT, asynHandler(getCurrentPlayTime))
router.post('/updatetime', verifyJWT, asynHandler(updateCurrentEpTime))

export default router 