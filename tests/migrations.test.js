import { describe, it, expect } from 'vitest'
import { PGlite } from '@electric-sql/pglite'
import request from 'supertest'
import { decodeToken } from './helpers/tokens.js'
import app from '../app.js'
import { db, applyMigrations } from './helpers/db.js'
import { setUserAdmin } from '../queries/userQueries.js'

// Issue 7: is_admin defaulted to TRUE, so every new account was an admin.
const FIX_MIGRATION = '1793666283363'

const insertWithoutRole = (database) => database.query(
  `INSERT INTO users(id, created_at, updated_at, username, password, email)
   VALUES(gen_random_uuid(), now(), now(), 'old-user', 'hash', 'old@example.com')`
)

describe('users.is_admin', () => {
  it('defaults to FALSE', async () => {
    await insertWithoutRole(db)
    const { rows } = await db.query('SELECT is_admin FROM users')
    expect(rows[0].is_admin).toBe(false)
  })

  it('removes admin from accounts that only had it by accident', async () => {
    const oldDb = new PGlite()
    await applyMigrations(oldDb, { before: FIX_MIGRATION })
    await insertWithoutRole(oldDb)
    expect((await oldDb.query('SELECT is_admin FROM users')).rows[0].is_admin).toBe(true)

    await applyMigrations(oldDb, { from: FIX_MIGRATION })
    expect((await oldDb.query('SELECT is_admin FROM users')).rows[0].is_admin).toBe(false)
    await oldDb.close()
  })

  it('gives a newly registered user the regular role', async () => {
    const login = { username: 'new-user', password: 'correct-horse' }
    await request(app).post('/user/register').send({ ...login, email: 'new@example.com' }).expect(201)
    const res = await request(app).post('/user/auth').send(login).expect(200)
    expect(decodeToken(res.body.accessToken).role).toBe('regular')
  })
})

describe('make-admin', () => {
  it('promotes a user by name, and reports an unknown name', async () => {
    await insertWithoutRole(db)
    expect(await setUserAdmin('old-user')).toBe(true)
    expect((await db.query('SELECT is_admin FROM users')).rows[0].is_admin).toBe(true)
    expect(await setUserAdmin('nobody')).toBe(false)
  })
})
