import { getShowByName } from "../queries/showQueries.js"
import { getEpisodes, getEpByTitleShowId , getEpisodeById, addEpisode, updateEpisode, 
  deleteEpisode } from "../queries/episodeQueries.js"
import { getCurrentTime, startEpTime, updateCurrentTime } from "../queries/episodeProgress.js"
import createError from "http-errors"
import { validate as isUuid } from 'uuid'
import fsPromises from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const MAX_LATEST_LIMIT = 50

// The largest value the INTEGER column can hold.
const MAX_PLAY_TIME = 2147483647

async function getAllEpisodesController (req, res) {
  const episodeType = req.query.type
  const limit = parseInt(req.query.limit, 10)
  const episodes = await getEpisodes(episodeType, limit > 0 ? Math.min(limit, MAX_LATEST_LIMIT) : undefined)
  if (!episodes) { 
    return res.status(204).json({'message':'No Episodes Found'})
  }
  res.json(episodes)
}

async function addEpisodeController(req, res) {
  const {
    title, description, audio_link, date_added, duration, show_name
  } = req.body

  if (!title || !description || !audio_link || !date_added || !duration || !show_name) {
    throw createError(400, 'Missing Required Data')
  }

  const show = await getShowByName(show_name)

  if (!show) {
    throw createError(404, 'SHow does not exist')
  }

  const duplicateEpisode = await getEpByTitleShowId(title, show.id)

  if (duplicateEpisode) {
    throw createError(409, 'Episode already exits')
  }

  const newEpisode = await addEpisode({
    title: title, 
    description: description,
    audio_link: audio_link,
    date_added: date_added, 
    duration: duration, 
    show_id: show.id
  })

  res.status(201).json({'message': 'Episode Succesfuly Added'})

}

async function updateEpisodeController(req, res) {
  const episodeID = req.params.id
  const updates = req.body
  const episode = await getEpisodeById(episodeID)
  if(!episode) {
    throw createError(409, `Episode with not found`)
  }
  const result = await updateEpisode(episodeID, updates)
  res.status(201).json({'message': 'Episode SUccesfully Updated'})
}

async function deleteEpisodeController(req, res) {
  const id = req.params.id
  const episode = await getEpisodeById(id)
  if(!episode) {
    throw createError(404, `Episode not found`)
  }
  const result = await deleteEpisode(id)
  res.status(201).json({'message': 'Episode SUccesfully Updated'})
}

async function getEpisodeController(req, res) {
  const id = req.params.id
  const episode = await getEpisodeById(id)
  if (!episode) {
    throw createError(404, 'Show not found')
  }
  res.json(episode)
}

async function getCurrentPlayTime (req, res) {
  const episodeID = req.params.id
  const episode = await getEpisodeById(episodeID)
  if (!episode) {
    throw createError(404, 'Episode not found')
  }
  let currentplaytime = await getCurrentTime(req.user, episodeID)
  if (!currentplaytime) {
    currentplaytime = await startEpTime(req.user, episodeID)
  }
  res.json(currentplaytime)
}

async function updateCurrentEpTime (req, res) {
  const episodeID = req.query.episodeID
  const currentplaytime = parseInt(req.query.new, 10)
  if (!isUuid(episodeID) || !Number.isInteger(currentplaytime) || currentplaytime < 0 || currentplaytime > MAX_PLAY_TIME) {
    throw createError(400, 'Invalid playback update')
  }
  await updateCurrentTime(currentplaytime, req.user, episodeID)
  res.json({'message': 'Updated Timestamp Succesfully'})
}

// Returns the file's path inside the audio folder, or null if it is missing
// or would leave that folder. realpath also follows any symbolic links.
async function findAudioFile (audioLink) {
  try {
    const audioRoot = await fsPromises.realpath(path.resolve(__dirname, '..', process.env.AUDIO_DIR || 'audios'))
    const filePath = await fsPromises.realpath(path.resolve(audioRoot, audioLink.replace(/^audios[\\/]/, '')))
    const relativePath = path.relative(audioRoot, filePath)
    if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
      return null
    }
    const fileInfo = await fsPromises.stat(filePath)
    return fileInfo.isFile() ? { audioRoot, relativePath } : null
  } catch (err) {
    return null
  }
}

async function audioEpController (req, res, next) {
  const episode = await getEpisodeById(req.params.id)
  if (!episode) {
    throw createError(404, 'Episode not found')
  }

  const audioFile = await findAudioFile(episode.audio_link)
  if (!audioFile) {
    throw createError(404, 'Audio not found')
  }

  // sendFile handles byte ranges, content type and stream errors.
  res.sendFile(audioFile.relativePath.split(path.sep).join('/'), { root: audioFile.audioRoot }, (err) => {
    if (err && !res.headersSent) {
      next(err)
    }
  })
}


export { getAllEpisodesController, addEpisodeController, updateEpisodeController, deleteEpisodeController, 
  getEpisodeController, getCurrentPlayTime, updateCurrentEpTime, audioEpController
}