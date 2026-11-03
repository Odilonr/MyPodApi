import { describe, it, expect } from 'vitest'
import { decodeToken } from './helpers/tokens.js'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser } from './helpers/fixtures.js'

const valid = { username: 'new_user', email: 'new@example.com', password: 'correct-horse' }
const countUsers = async () => (await db.query('SELECT count(*)::int AS n FROM users')).rows[0].n

describe('POST /user/register', () => {
  it('creates a user and stores only a hash of the password', async () => {
    await request(app).post('/user/register').send(valid).expect(201)
    const { rows } = await db.query('SELECT password FROM users')
    expect(rows[0].password).not.toContain(valid.password)
    expect(rows[0].password).toMatch(/^\$2[aby]\$/)
  })

  it.each([
    ['a missing username', { username: undefined }],
    ['a short username', { username: 'ab' }],
    ['a username with spaces', { username: 'two words' }],
    ['a username that is not text', { username: { a: 1 } }],
    ['a bad email', { email: 'not-an-email' }],
    ['a short password', { password: 'short' }],
    ['a password longer than bcrypt can use', { password: 'x'.repeat(73) }],
    ['a password that is not text', { password: 12345678 }]
  ])('answers 400 and creates nothing for %s', async (_, change) => {
    const res = await request(app).post('/user/register').send({ ...valid, ...change })
    expect(res.status).toBe(400)
    expect(await countUsers()).toBe(0)
  })

  it('does not repeat the password in the error', async () => {
    const password = 'short'
    const res = await request(app).post('/user/register').send({ ...valid, password })
    expect(res.status).toBe(400)
    expect(res.body.error).toEqual([expect.objectContaining({ field: 'password' })])
    expect(JSON.stringify(res.body.error.map((item) => item.message))).not.toContain(`"${password}"`)
  })

  it('ignores is_admin sent by the client', async () => {
    await request(app).post('/user/register').send({ ...valid, is_admin: true, role: 'admin' }).expect(201)
    const res = await request(app).post('/user/auth').send(valid).expect(200)
    expect(decodeToken(res.body.accessToken).role).toBe('regular')
  })
})

describe('login session', () => {
  const cookieFrom = (res) => res.headers['set-cookie'][0].split(';')[0]

  it('gives an access token and an httpOnly refresh cookie', async () => {
    const user = await insertUser()
    const res = await request(app).post('/user/auth').send(user).expect(200)
    expect(decodeToken(res.body.accessToken).userID).toBe(user.id)
    expect(res.headers['set-cookie'][0]).toMatch(/HttpOnly/i)
    expect(JSON.stringify(res.body)).not.toContain(cookieFrom(res).split('=')[1])
  })

  it('answers 401 for a wrong password', async () => {
    const user = await insertUser()
    await request(app).post('/user/auth').send({ ...user, password: 'wrong' }).expect(401)
  })

  it('answers 400 when login fields are not text', async () => {
    await request(app).post('/user/auth').send({ username: { a: 1 }, password: { b: 2 } }).expect(400)
  })

  it('refreshes with the cookie, and stops after logout', async () => {
    const user = await insertUser()
    const login = await request(app).post('/user/auth').send(user).expect(200)
    const cookie = cookieFrom(login)

    const refreshed = await request(app).post('/user/refresh').set('Cookie', cookie).expect(200)
    expect(decodeToken(refreshed.body.accessToken).userID).toBe(user.id)

    await request(app).post('/user/logout').set('Cookie', cookie).expect(204)
    await request(app).post('/user/refresh').set('Cookie', cookie).expect(403)
  })
})
