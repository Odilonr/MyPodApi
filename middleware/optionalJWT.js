import { verifyJWT } from './verifyJWT.js'

// For public routes that show more to a logged-in user. No token is fine, but a
// token that has expired gets the normal answer, so the client can refresh it.
function optionalJWT (req, res, next) {
  if (!req.headers.authorization) {
    return next()
  }
  return verifyJWT(req, res, next)
}

export { optionalJWT }
