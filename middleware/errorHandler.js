import { logEvents } from "./logEvents.js";

function errorHandler (err, req, res, next) {
  logEvents(`${err.name}: ${err.message}`, 'errLog.txt')
  console.error(err.stack)
  if (res.headersSent) {
    return next(err)
  }
  const status = err.status || 500
  const message = status === 500 ? 'Something went wrong, try again later' : err.message
  const errors = err.errors || null
  res.status(status).send({status, message, error: errors}) 
}

const asynHandler = (fn) => async (req, res, next) => {
  try {
    await fn(req, res, next)
  } catch (err) {
    console.log(err)
    next(err)
  }
}

export { errorHandler, asynHandler };