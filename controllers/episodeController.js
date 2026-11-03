import { getShowByName } from "../queries/showQueries.js"
import { getEpisodes, getEpByTitleShowId , getEpisodeById, addEpisode, updateEpisode, 
  deleteEpisode } from "../queries/episodeQueries.js"
import { getCurrentTime, startEpTime, updateCurrentTime } from "../queries/episodeProgress.js"
import createError from "http-errors"
import { validate as isUuid } from 'uuid'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// The largest value the INTEGER column can hold.
const MAX_PLAY_TIME = 2147483647

async function getAllEpisodesController (req, res) {
  const episodeType = req.query.type
  const episodes = await getEpisodes(episodeType)
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

async function audioEpController (req, res) {
  const audioPath = req.query.path

  if (!fs.existsSync(path.join(__dirname, '..', audioPath))) {
    res.status(404).json({'message': 'no audio found'})
    throw createError(404, 'Audio not found')
  }

  const audioInfo = fs.statSync(audioPath)
  const audioSize = audioInfo.size
  if (req.headers.range) {
    const range = req.headers.range
    const parts = range.replace('bytes=', '').split("-")
    console.log(parts)
    const partialStart = parts[0]
    const partialEnd = parts[1]

    const start = parseInt(partialStart, 10)
    console.log(start)
    const end = partialEnd ? parseInt(partialEnd, 10) : audioSize - 1;
    console.log(end)
    const chunkSize = (end-start)+1
    const readstream = fs.createReadStream(audioPath, {start: start, end: end})
    res.writeHead(206, {
      'Content-Range': 'bytes ' + start + '-' + end + '/' + audioSize,
      'Accept-Ranges': 'bytes', 
      'Content-Length': chunkSize, 
      'Content-Type': 'audio/mpeg'
    })
    readstream.pipe(res)
  } else {
    res.writeHead(200, {'Content-Length': audioSize, 'Content-Type' : 'audio/mpeg'})
    fs.createReadStream(audioPath).pipe(res)
  }
}


export { getAllEpisodesController, addEpisodeController, updateEpisodeController, deleteEpisodeController, 
  getEpisodeController, getCurrentPlayTime, updateCurrentEpTime, audioEpController
}