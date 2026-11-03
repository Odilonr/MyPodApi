import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app.js'

// Issue 6: a request with no Authorization header crashed the check and gave a 500.
const url = '/episodes/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/timestamp'

describe('verifyJWT', () => {
  it('answers 401 when the Authorization header is missing', async () => {
    const res = await request(app).get(url)
    expect(res.status).toBe(401)
  })

  it('answers 401 when the header is not a Bearer token', async () => {
    const res = await request(app).get(url).set('Authorization', 'Basic abc')
    expect(res.status).toBe(401)
  })

  it('answers 403 when the token is not valid', async () => {
    const res = await request(app).get(url).set('Authorization', 'Bearer not-a-token')
    expect(res.status).toBe(403)
  })
})
