import createError from 'http-errors'
import { z } from 'zod'
import { cleanText, parseFeed } from '../services/feedParser.js'
import { removeStoredFile } from '../services/audioFiles.js'
import { safeFetchText } from '../services/safeFetch.js'
import { getShowStorageKeys } from '../queries/uploadQueries.js'
import { getImportedShows, getImportedShow, countImportedShows, createImportedShow, addNewEpisodes,
  updateImportedShow, deleteImportedShow } from '../queries/feedQueries.js'

const MAX_IMPORTS_PER_USER = 100
const PREVIEW_EPISODES = 5
const MAX_NAME = 200
const MAX_CATEGORY = 60

const nameField = z.string().max(MAX_NAME)
const categoryField = z.string().max(MAX_CATEGORY)
const urlSchema = z.string().trim().min(1).max(2000)
const importSchema = z.object({ url: urlSchema, name: nameField.optional(), category: categoryField.optional() })
const editSchema = z.strictObject({ name: nameField.optional(), category: categoryField.optional() })
  .refine(({ name, category }) => name !== undefined || category !== undefined)

// A chosen name that is only HTML would end up empty, so refuse it.
function cleanChoice (value, maxLength) {
  if (value === undefined) return undefined
  const cleaned = cleanText(value, maxLength)
  if (!cleaned) throw createError(400, 'Enter a name and category with some text in them')
  return cleaned
}

function parseBody (schema, body) {
  const parsed = schema.safeParse(body)
  if (!parsed.success) throw createError(400, 'Invalid feed details')
  return parsed.data
}

async function requireImportedShow (req) {
  const show = await getImportedShow(req.user, req.params.id)
  if (!show) throw createError(404, 'Show not found')
  return show
}

async function previewFeedController (req, res) {
  const { url } = parseBody(importSchema, req.body)
  const { show, episodes } = parseFeed(await safeFetchText(url))
  res.json({
    show,
    episodeCount: episodes.length,
    episodes: episodes.slice(0, PREVIEW_EPISODES).map(({ title, duration, publishedAt }) => ({ title, duration, publishedAt }))
  })
}

async function importFeedController (req, res) {
  const body = parseBody(importSchema, req.body)
  const name = cleanChoice(body.name, MAX_NAME)
  const category = cleanChoice(body.category, MAX_CATEGORY)
  if (await countImportedShows(req.user) >= MAX_IMPORTS_PER_USER) {
    throw createError(409, `You can import up to ${MAX_IMPORTS_PER_USER} shows`)
  }

  const feed = parseFeed(await safeFetchText(body.url))
  const showID = await createImportedShow(req.user, new URL(body.url).href, feed, {
    name: name ?? feed.show.name,
    category: category ?? feed.show.category
  })
  if (!showID) throw createError(409, 'You already imported this feed')
  res.status(201).json(await getImportedShow(req.user, showID))
}

async function listFeedsController (req, res) {
  res.json(await getImportedShows(req.user))
}

async function editFeedController (req, res) {
  await requireImportedShow(req)
  const body = parseBody(editSchema, req.body)
  try {
    await updateImportedShow(req.user, req.params.id, {
      name: cleanChoice(body.name, MAX_NAME),
      category: cleanChoice(body.category, MAX_CATEGORY)
    })
  } catch (err) {
    // Uploaded shows have a unique name per user.
    if (err.code === '23505') throw createError(409, 'You already have a show with this name')
    throw err
  }
  res.json(await getImportedShow(req.user, req.params.id))
}

async function refreshFeedController (req, res) {
  const show = await requireImportedShow(req)
  if (!show.feed_url) throw createError(400, 'This show has no feed to check')
  const { episodes } = parseFeed(await safeFetchText(show.feed_url))
  res.json({ added: await addNewEpisodes(show.id, episodes) })
}

async function deleteFeedController (req, res) {
  const storageKeys = await getShowStorageKeys(req.user, req.params.id)
  if (!(await deleteImportedShow(req.user, req.params.id))) {
    throw createError(404, 'Show not found')
  }
  await Promise.all(storageKeys.map(removeStoredFile))
  res.sendStatus(204)
}

export { previewFeedController, importFeedController, listFeedsController, editFeedController, refreshFeedController, deleteFeedController }
