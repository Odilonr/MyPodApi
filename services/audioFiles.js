import fsPromises from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import createError from 'http-errors'
import { fileTypeFromFile } from 'file-type'
import { parseFile } from 'music-metadata'
import { cleanText } from './feedParser.js'

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

const ALLOWED_TYPES = ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/ogg', 'audio/opus', 'audio/wav', 'audio/vnd.wave', 'audio/x-wav', 'audio/flac', 'audio/x-flac']
const DEFAULT_MAX_UPLOAD_BYTES = 200 * 1024 * 1024
const DEFAULT_MAX_USER_STORAGE_BYTES = 1024 * 1024 * 1024
const MAX_TITLE = 300
const MAX_NAME = 200
const MAX_CATEGORY = 60
const DEFAULT_SHOW = 'My uploads'
const DEFAULT_CATEGORY = 'Uncategorized'

const numberFromEnv = (name, fallback) => Number(process.env[name]) || fallback
const maxUploadBytes = () => numberFromEnv('MAX_UPLOAD_BYTES', DEFAULT_MAX_UPLOAD_BYTES)
const maxUserStorageBytes = () => numberFromEnv('MAX_USER_STORAGE_BYTES', DEFAULT_MAX_USER_STORAGE_BYTES)

// This folder is never served directly. Files only leave it through the audio
// route, after the owner is checked.
const uploadDir = () => path.resolve(apiRoot, process.env.UPLOAD_DIR || 'uploads')

async function removeStoredFile (storageKey) {
  await fsPromises.rm(path.join(uploadDir(), path.basename(storageKey)), { force: true })
}

function titleFromFileName (fileName) {
  const cleaned = cleanText(fileName, MAX_TITLE * 2).replace(/\\/g, '/')
  return path.basename(cleaned).replace(/\.[^.]+$/, '').slice(0, MAX_TITLE)
}

// Checks the bytes of the file. Its name and its claimed type come from the
// user, so they can't be trusted. Tags can suggest details, but a file with bad
// or missing tags is still fine.
async function inspectAudioFile (filePath, originalName) {
  const detected = await fileTypeFromFile(filePath).catch(() => null)
  if (!detected || !ALLOWED_TYPES.includes(detected.mime)) {
    throw createError(415, 'This file is not a supported audio file. Use MP3, M4A, AAC, OGG, WAV or FLAC.')
  }

  const metadata = await parseFile(filePath, { duration: true, skipCovers: true }).catch(() => null)
  const tags = metadata?.common ?? {}
  const seconds = metadata?.format?.duration
  const artist = cleanText(tags.artist ?? '', MAX_NAME)

  return {
    contentType: detected.mime,
    title: cleanText(tags.title ?? '', MAX_TITLE) || titleFromFileName(originalName) || 'Untitled episode',
    showName: cleanText(tags.album ?? '', MAX_NAME) || artist || DEFAULT_SHOW,
    category: cleanText(tags.genre?.[0] ?? '', MAX_CATEGORY) || DEFAULT_CATEGORY,
    artist: artist || 'You',
    duration: Number.isFinite(seconds) && seconds > 0 ? Math.max(1, Math.round(seconds)) : null
  }
}

export { inspectAudioFile, removeStoredFile, uploadDir, maxUploadBytes, maxUserStorageBytes }
