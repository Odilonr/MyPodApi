import express from 'express'
import {getAllEpisodesController, addEpisodeController, updateEpisodeController, 
  deleteEpisodeController, getEpisodeController, getCurrentPlayTime, updateCurrentEpTime, audioEpController
 } from '../controllers/episodeController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { validateId } from '../middleware/validateId.js'

const router = express.Router()

router.param('id', validateId)

router.get('/', getAllEpisodesController)
router.post('/', asynHandler(addEpisodeController))
router.put('/:id', asynHandler(updateEpisodeController))
router.delete('/:id', asynHandler(deleteEpisodeController))

router.get('/ep/:id', asynHandler(getEpisodeController))

router.get('/audio', asynHandler(audioEpController))
router.use(verifyJWT)
router.get('/:id/timestamp', asynHandler(getCurrentPlayTime))
router.post('/updatetime', asynHandler(updateCurrentEpTime))

export default router 