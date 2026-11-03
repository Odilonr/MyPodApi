import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, insertShow, insertEpisode, accessToken } from './helpers/fixtures.js'

// Issue 3: JSON keys from the request were placed directly into SQL. This key
// copies a password hash into a public field. It uses an admin token so that
// the test checks the SQL itself, not the login check.
const injectedKey = 'description = (SELECT password FROM users LIMIT 1), studio'

let adminToken
let show
let episode

beforeEach(async () => {
  adminToken = accessToken(await insertUser({ isAdmin: true }), 'admin')
  show = await insertShow()
  episode = await insertEpisode(show.id)
})

const put = (url, body) => request(app).put(url).set('Authorization', `Bearer ${adminToken}`).send(body)

describe('PUT /shows/:id', () => {
  it('rejects a key containing SQL and does not run it', async () => {
    const res = await put(`/shows/${show.id}`, { [injectedKey]: 'x' })
    expect(res.status).toBe(400)
    const { rows } = await db.query('SELECT description, studio FROM shows WHERE id = $1', [show.id])
    expect(rows[0].description).toBe(show.description)
    expect(rows[0].studio).toBe(show.studio)
  })

  it('rejects a column that is not on the list', async () => {
    expect((await put(`/shows/${show.id}`, { id: 'x' })).status).toBe(400)
    expect((await put(`/shows/${show.id}`, { date_added: '2020-01-01' })).status).toBe(400)
  })

  it('applies nothing if any key is bad', async () => {
    const res = await put(`/shows/${show.id}`, { description: 'changed', [injectedKey]: 'x' })
    expect(res.status).toBe(400)
    const { rows } = await db.query('SELECT description FROM shows WHERE id = $1', [show.id])
    expect(rows[0].description).toBe(show.description)
  })

  it('rejects an empty update', async () => {
    expect((await put(`/shows/${show.id}`, {})).status).toBe(400)
  })

  it('still updates an allowed column', async () => {
    expect((await put(`/shows/${show.id}`, { description: 'changed' })).status).toBe(201)
    const { rows } = await db.query('SELECT description FROM shows WHERE id = $1', [show.id])
    expect(rows[0].description).toBe('changed')
  })
})

describe('PUT /episodes/:id', () => {
  const episodeKey = 'description = (SELECT password FROM users LIMIT 1), title'

  it('rejects a key containing SQL and does not run it', async () => {
    const res = await put(`/episodes/${episode.id}`, { [episodeKey]: 'x' })
    expect(res.status).toBe(400)
    const { rows } = await db.query('SELECT description, title FROM episodes WHERE id = $1', [episode.id])
    expect(rows[0].description).toBe(episode.description)
    expect(rows[0].title).toBe(episode.title)
  })

  it('rejects an empty update', async () => {
    expect((await put(`/episodes/${episode.id}`, {})).status).toBe(400)
  })

  it('still updates an allowed column', async () => {
    expect((await put(`/episodes/${episode.id}`, { title: 'changed' })).status).toBe(201)
    const { rows } = await db.query('SELECT title FROM episodes WHERE id = $1', [episode.id])
    expect(rows[0].title).toBe('changed')
  })
})
