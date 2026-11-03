import fsPromises from 'fs/promises'
import createError from 'http-errors'
import { z } from 'zod'
import { signStreamToken } from '../config/tokens.js'
import { inspectAudioFile, maxUserStorageBytes, removeStoredFile } from '../services/audioFiles.js'
import { cleanText } from '../services/feedParser.js'
import { createUpload, deleteUpload, getOwnedUpload, getUsedStorage, updateUpload } from '../queries/uploadQueries.js'

const MAX_TITLE = 300
const MAX_NAME = 200
const MAX_CATEGORY = 60

const editSchema = z.strictObject({
  title: z.string().max(MAX_TITLE).optional(),
  showName: z.string().max(MAX_NAME).optional(),
  category: z.string().max(MAX_CATEGORY).optional()
}).refine(({ title, showName, category }) => title !== undefined || showName !== undefined || category !== undefined)

function cleanChoice (value, maxLength) {
  if (value === undefined) return undefined
  const cleaned = cleanText(value, maxLength)
  if (!cleaned) throw createError(400, 'Enter some text in each field')
  return cleaned
}

function storageFull () {
  return createError(413, 'You are out of upload storage. Delete some files and try again.')
}

// Stops early when the user is already full, before the file is received.
async function checkStorageRoom (req, res, next) {
  if (await getUsedStorage(req.user) >= maxUserStorageBytes()) {
    return next(storageFull())
  }
  next()
}

async function uploadController (req, res) {
  if (!req.file) throw createError(400, 'Choose an audio file to upload')
  const { filename: storageKey, path: filePath, size, originalname } = req.file

  try {
    const details = await inspectAudioFile(filePath, originalname)
    if (await getUsedStorage(req.user) + size > maxUserStorageBytes()) throw storageFull()
    const created = await createUpload(req.user, { ...details, storageKey, fileSize: size })
    res.status(201).json(created)
  } catch (err) {
    // A rejected file must not stay on the disk.
    await fsPromises.rm(filePath, { force: true })
    throw err
  }
}

async function editUploadController (req, res) {
  const parsed = editSchema.safeParse(req.body)
  if (!parsed.success) throw createError(400, 'Invalid details')
  const updated = await updateUpload(req.user, req.params.id, {
    title: cleanChoice(parsed.data.title, MAX_TITLE),
    showName: cleanChoice(parsed.data.showName, MAX_NAME),
    category: cleanChoice(parsed.data.category, MAX_CATEGORY)
  })
  if (!updated) throw createError(404, 'File not found')
  res.json(updated)
}

async function deleteUploadController (req, res) {
  const deleted = await deleteUpload(req.user, req.params.id)
  if (!deleted) throw createError(404, 'File not found')
  await removeStoredFile(deleted.storageKey)
  res.json({ showRemoved: deleted.showRemoved })
}

// An audio tag can't send a login header, so the player gets a short-lived link
// that opens only this one file.
async function streamUrlController (req, res) {
  const upload = await getOwnedUpload(req.user, req.params.id)
  if (!upload) throw createError(404, 'File not found')
  const token = await signStreamToken(req.user, upload.id)
  res.json({ url: `/episodes/${upload.id}/audio?token=${encodeURIComponent(token)}` })
}

export { checkStorageRoom, uploadController, editUploadController, deleteUploadController, streamUrlController }
