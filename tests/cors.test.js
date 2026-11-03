import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { credentials } from '../middleware/credentials.js'
import { insertShow } from './helpers/fixtures.js'

const allowedOrigin = 'http://localhost:5173'

beforeEach(async () => {
  await insertShow()
})

// Issue 4: `|| origin` allowed every website, with cookies.
describe('CORS', () => {
  it.each([
    'https://evil.example',
    'http://localhost:5173.evil.example',
    'https://www.yoursite.com',
    'null'
  ])('refuses the origin %s', async (origin) => {
    const res = await request(app).get('/shows').set('Origin', origin)
    expect(res.status).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
    expect(res.headers['access-control-allow-credentials']).toBeUndefined()
  })

  it('refuses a preflight request from another website', async () => {
    const res = await request(app)
      .options('/shows')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'DELETE')
    expect(res.status).toBe(403)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })

  it('allows a configured origin, with cookies', async () => {
    const res = await request(app).get('/shows').set('Origin', allowedOrigin)
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBe(allowedOrigin)
    expect(res.headers['access-control-allow-credentials']).toBe('true')
  })

  it('allows a request with no Origin header, such as curl', async () => {
    const res = await request(app).get('/shows')
    expect(res.status).toBe(200)
    expect(res.headers['access-control-allow-origin']).toBeUndefined()
  })
})

// Issue 5: this middleware set the wrong header. The cors package overwrote
// the bad value, so this has to be tested on the middleware itself.
describe('credentials middleware', () => {
  const run = (origin) => {
    const res = { header: vi.fn() }
    const next = vi.fn()
    credentials({ headers: { origin } }, res, next)
    return { res, next }
  }

  it('sets Access-Control-Allow-Credentials for an allowed origin', () => {
    const { res, next } = run(allowedOrigin)
    expect(res.header).toHaveBeenCalledWith('Access-Control-Allow-Credentials', 'true')
    expect(res.header).not.toHaveBeenCalledWith('Access-Control-Allow-Origin', expect.anything())
    expect(next).toHaveBeenCalledOnce()
  })

  it('sets nothing for another origin', () => {
    const { res, next } = run('https://evil.example')
    expect(res.header).not.toHaveBeenCalled()
    expect(next).toHaveBeenCalledOnce()
  })
})
