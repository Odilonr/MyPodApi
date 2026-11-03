import dotenv from 'dotenv'
import express from 'express'
import { logger } from './middleware/logEvents.js'
import { poolQuery } from './config/dbConn.js'
import { errorHandler } from './middleware/errorHandler.js'
import cookieParser from 'cookie-parser'
import userRouter from './routes/users.js'
import showRouter from './routes/shows.js'
import episodeRouter from './routes/episodes.js'
import meRouter from './routes/me.js'
import { corsOption } from './config/corsOption.js'
import { credentials } from './middleware/credentials.js'
import cors from 'cors'
import 'express-async-errors'

dotenv.config()

const app = express()

// Behind the HTTPS proxy, this gives the visitor's real address for rate limits.
// With no proxy it stays off, so a visitor can't fake their address in a header.
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false)

// Comes before the logger, so regular checks don't fill the logs.
app.get('/health', async (req, res) => {
  try {
    await poolQuery('SELECT 1')
    res.json({ status: 'ok' })
  } catch (err) {
    res.status(503).json({ status: 'unavailable' })
  }
})

app.use(logger)

app.use(credentials)

app.use(cors(corsOption))

app.use(express.json())

app.use(express.urlencoded({ extended: false }))

app.use(cookieParser())

app.use('/user', userRouter)

app.use('/shows', showRouter)
app.use('/episodes', episodeRouter)
app.use('/me', meRouter)

app.use(errorHandler)


export default app
