import { SignJWT, jwtVerify } from 'jose'

const ALGORITHM = 'HS256'
const encodeSecret = (secret) => new TextEncoder().encode(secret)

function signToken (payload, secret, expiresIn) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: ALGORITHM })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(encodeSecret(secret))
}

async function verifyToken (token, secret) {
  const { payload } = await jwtVerify(token, encodeSecret(secret), { algorithms: [ALGORITHM] })
  return payload
}

const signAccessToken = (userID, role) => signToken({ userID, role }, process.env.ACCESS_TOKEN_SECRET, '1000s')
const signRefreshToken = (userID) => signToken({ userID }, process.env.REFRESH_TOKEN_SECRET, '1d')
const verifyAccessToken = (token) => verifyToken(token, process.env.ACCESS_TOKEN_SECRET)
const verifyRefreshToken = (token) => verifyToken(token, process.env.REFRESH_TOKEN_SECRET)

// A stream token opens one uploaded file. It uses its own key, so it can't be
// used as a login token, and a login token can't be used in its place.
const streamSecret = () => `${process.env.ACCESS_TOKEN_SECRET}:stream`
const signStreamToken = (userID, episodeID) => signToken({ userID, episodeID }, streamSecret(), '6h')
const verifyStreamToken = (token) => verifyToken(token, streamSecret())

export { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken, signStreamToken, verifyStreamToken }
