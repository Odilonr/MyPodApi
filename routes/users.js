import express from 'express'
import { registerNewUser, authenticateUser, refreshToken, logOutUser } from '../controllers/userController.js'
import { asynHandler } from '../middleware/errorHandler.js'
import { loginLimiter } from '../middleware/rateLimiters.js'

const router = express.Router()

router.post('/register', asynHandler(registerNewUser))
router.post('/auth', loginLimiter, asynHandler(authenticateUser))
router.post('/refresh', asynHandler(refreshToken))
router.post('/logout', logOutUser)


export default router
