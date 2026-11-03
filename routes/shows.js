import express from 'express'
import { getAllShowsController, addShowController, updateShowController, 
  deleteShowController, getShowController} from '../controllers/showController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { validateId } from '../middleware/validateId.js'
import { verifyJWT } from '../middleware/verifyJWT.js'
import { requireAdmin } from '../middleware/requireAdmin.js'

const router = express.Router()

router.param('id', validateId)

const adminOnly = [verifyJWT, requireAdmin]

router.get('/', getAllShowsController)
router.post('/', adminOnly, asynHandler(addShowController))
router.put('/:id', adminOnly, asynHandler(updateShowController))
router.delete('/:id', adminOnly, asynHandler(deleteShowController))

router.get('/:id', asynHandler(getShowController))

export default router 