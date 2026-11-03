import fs from 'fs';
import fsPromises from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';

async function logEvents (message, logName) {
  const currentDate = `${format(new Date(), 'yyyy/MM/dd\tHH:mm:ss')}`
  const logItem = `${currentDate}\t${uuidv4()}\t${message}\n`
  console.log(logItem)
  console.log(__dirname)
  try {
    if (!fs.existsSync(path.join(__dirname, '..', 'logs'))) {
      await fsPromises.mkdir(path.join(__dirname, '..', 'logs'))
    }
    await fsPromises.appendFile(path.join(__dirname, '..', 'logs', logName), logItem)
  } catch (err) {
    console.log(err)
  }
}

function logger (req, res, next) {
  try {
    // A stream token in the address opens a private file, so keep it out of the logs.
    const url = req.url.replace(/([?&]token=)[^&]*/, '$1[hidden]')
    logEvents(`${req.method}\t${req.headers.origin}\t${url}`, 'reqLog.txt')
    console.log(`${req.method} ${req.path}`)
    next()
  } catch (err) {
    next(err)
  }
}

export {logger, logEvents};