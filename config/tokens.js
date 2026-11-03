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

export { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken }
