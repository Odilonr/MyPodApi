import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { insertUser } from './helpers/fixtures.js'

describe('login rate limit', () => {
  it('does not count successful logins', async () => {
    const user = await insertUser()
    for (let i = 0; i < 12; i++) {
      await request(app).post('/user/auth').send(user).expect(200)
    }
  })

  it('answers 429 after 10 failed logins, even with the right password', async () => {
    const user = await insertUser()
    for (let i = 0; i < 10; i++) {
      await request(app).post('/user/auth').send({ ...user, password: 'wrong' }).expect(401)
    }
    await request(app).post('/user/auth').send({ ...user, password: 'wrong' }).expect(429)
    await request(app).post('/user/auth').send(user).expect(429)
  })
})
