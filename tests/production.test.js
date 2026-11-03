import { afterEach, describe, expect, it, vi } from 'vitest'
import fsPromises from 'fs/promises'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser } from './helpers/fixtures.js'
import { logEvents } from '../middleware/logEvents.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('with no proxy', () => {
  it('ignores the address header, so a visitor cannot dodge the login limit', async () => {
    const user = await insertUser()
    const failLogin = (address) => request(app)
      .post('/user/auth')
      .set('X-Forwarded-For', address)
      .send({ username: user.username, password: 'wrong' })
    for (let i = 0; i < 10; i++) {
      await failLogin(`198.51.100.${i}`).expect(401)
    }
    await failLogin('198.51.100.99').expect(429)
  })
})

describe('GET /health', () => {
  it('answers 200 when the database works, and shows nothing private', async () => {
    const res = await request(app).get('/health').expect(200)
    expect(res.body).toEqual({ status: 'ok' })
  })

  it('answers 503 when the database does not work, with no details', async () => {
    const spy = vi.spyOn(db, 'query').mockRejectedValueOnce(new Error('secret connection details'))
    const res = await request(app).get('/health').expect(503)
    spy.mockRestore()
    expect(JSON.stringify(res.body)).not.toContain('secret')
  })

  it('is not written to the request log, so checks do not fill it', async () => {
    const spy = vi.spyOn(console, 'log')
    await request(app).get('/health').expect(200)
    const logged = spy.mock.calls.flat().join(' ')
    spy.mockRestore()
    expect(logged).not.toContain('/health')
  })
})

describe('log files', () => {
  it('writes no log file when LOG_TO_FILE is false', async () => {
    vi.stubEnv('LOG_TO_FILE', 'false')
    const spy = vi.spyOn(fsPromises, 'appendFile')
    await logEvents('hello', 'reqLog.txt')
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })
})
