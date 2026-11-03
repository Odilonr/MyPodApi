import fs from 'fs'
import createError from 'http-errors'
import multer from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { maxUploadBytes, uploadDir } from '../services/audioFiles.js'

// The stored name is random, so the user's file name never touches the disk.
const storage = multer.diskStorage({
  destination: (req, file, callback) => {
    const folder = uploadDir()
    fs.mkdir(folder, { recursive: true }, (err) => callback(err, folder))
  },
  filename: (req, file, callback) => callback(null, uuidv4())
})

function uploadFile (req, res, next) {
  const receive = multer({ storage, limits: { fileSize: maxUploadBytes(), files: 1, fields: 0, parts: 1 } }).single('file')
  receive(req, res, (err) => {
    if (!err) return next()
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(createError(413, `This file is too large. The limit is ${Math.floor(maxUploadBytes() / (1024 * 1024))} MB.`))
    }
    if (err instanceof multer.MulterError) return next(createError(400, 'Send one audio file'))
    return next(err)
  })
}

export { uploadFile }
