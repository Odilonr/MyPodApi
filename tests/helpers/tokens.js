import crypto from 'crypto'

// Builds tokens by hand, so these tests do not depend on the app's JWT library.
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url')

export function signToken(payload, secret, expiresInSeconds = 300) {
  const body = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + expiresInSeconds,
    ...payload
  })}`
  return `${body}.${crypto.createHmac('sha256', secret).update(body).digest('base64url')}`
}

export function unsignedToken(payload) {
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`
}

export function decodeToken(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
}
