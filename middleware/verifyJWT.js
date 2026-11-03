import { verifyAccessToken } from '../config/tokens.js'

async function verifyJWT (req, res, next) {
  const authHeader = req.headers.authorization
  if(!authHeader.startsWith('Bearer ')) {
    return res.sendStatus(401)
  }
  const token = authHeader.split(' ')[1]
  try {
    const decoded = await verifyAccessToken(token)
    req.user = decoded.userID
    req.role = decoded.role
  } catch (err) {
    console.log(`the error: ${err}`)
    return res.sendStatus(403)
  }
  next()
}

export { verifyJWT }
