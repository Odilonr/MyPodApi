import createError from 'http-errors'
import { getShows, addShow, getShowByName, getShowById, updateShow, deleteShow} from '../queries/showQueries.js';
import { getEpisodesByShow } from '../queries/episodeQueries.js';

async function getAllShowsController (req, res) {
  const type = req.query.type
  const allShows = await getShows(type)
  if (!allShows) {
    return res.status(204).json({'message':'No Shows Found'})
  }
  res.json(allShows)
}

async function addShowController (req, res) {
  const {name, description, profile_img_link, release_schedule, studio, host_name} = req.body
  if (!name || !description || !profile_img_link|| !release_schedule || !studio || !host_name) {
    throw createError(400, 'Missing required Fields')
  }

  const duplicateShow = await getShowByName(name)

  if (duplicateShow) {
    throw createError(409, 'Show already Exists')
  }

  const newShow = await addShow({
    name: name,
    description: description,
    profile_img_link: profile_img_link,
    release_schedule: release_schedule,
    studio: studio,
    host_name: host_name,
    host_img_link: req.body.host_img_link,
    review_stars: req.body.review_stars,
    review_count: req.body.review_count,
    show_type: req.body.show_type,
    rated: req.body.rated
  })
  res.status(201).json({'message': 'Show succesfuly added'})
}

async function updateShowController(req, res) {
  const showID = req.params.id
  const updates = req.body
  const show = await getShowById(showID)

  if(!show) {
    throw createError(409, `Show not found`)
  }

  await updateShow(showID, updates)
  res.status(201).json({'message': 'successfuly Updated'})
}

async function deleteShowController (req, res) {
  const id = req.params.id
  const show = await getShowById(id)
  if(!show) {
    throw createError(404, `Show not found`)
  }
  const result = await deleteShow(id)
  res.status(201).json({'message': 'succesfully deleted'})
}

async function getShowController (req, res) {
  const id = req.params.id
  const show = await getShowById(req.params.id)
  if (!show) {
    throw createError(404, "Show not found")
  }
  res.json(show)
}


async function getShowEpisodesController (req, res) {
  const show = await getShowById(req.params.id)
  if (!show) {
    throw createError(404, "Show not found")
  }
  res.json(await getEpisodesByShow(show.id))
}


export { getAllShowsController, addShowController, updateShowController, deleteShowController, getShowController,
  getShowEpisodesController }