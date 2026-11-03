import express from 'express'
import { getAllShowsController, addShowController, updateShowController, 
  deleteShowController, getShowController} from '../controllers/showController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { validateId } from '../middleware/validateId.js'

const router = express.Router()

router.param('id', validateId)

router.get('/', getAllShowsController)
router.post('/', asynHandler(addShowController))
router.put('/:id', asynHandler(updateShowController))
router.delete('/:id', asynHandler(deleteShowController))

router.get('/:id', asynHandler(getShowController))

export default router 