import dotenv from 'dotenv'
import express from 'express'
import { logger } from './middleware/logEvents.js'
import { errorHandler } from './middleware/errorHandler.js'
import cookieParser from 'cookie-parser'
import userRouter from './routes/users.js'
import showRouter from './routes/shows.js'
import episodeRouter from './routes/episodes.js'
import { corsOption } from './config/corsOption.js'
import { credentials } from './middleware/credentials.js'
import cors from 'cors'
import 'express-async-errors'

dotenv.config()

const app = express()

app.use(logger)

app.use(credentials)

app.use(cors(corsOption))

app.use(express.json())

app.use(express.urlencoded({ extended: false }))

app.use(cookieParser())

app.use('/user', userRouter)

//app.use(verifyJWT)
app.use('/shows', showRouter)
app.use('/episodes', episodeRouter)

app.use(errorHandler)


export default app
