import createError from 'http-errors'
import { validate as isUuid } from 'uuid'

function validateId (req, res, next, id) {
  if (!isUuid(id)) {
    return next(createError(404, 'Not found'))
  }
  next()
}

export { validateId }
