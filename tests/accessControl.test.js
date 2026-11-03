import { describe, it, expect, beforeEach } from 'vitest'
import { signToken, unsignedToken } from './helpers/tokens.js'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, insertShow, insertEpisode, accessToken } from './helpers/fixtures.js'

// Issue 2: anyone could create, edit or delete shows and episodes.
const newShow = {
  name: 'New Sample Show',
  description: 'Sample',
  profile_img_link: 'sample.png',
  release_schedule: 'Weekly',
  studio: 'Sample Studio',
  host_name: 'Sample Host',
  show_type: 'Sample'
}

let show
let episode

const writes = {
  'POST /shows': () => ['post', '/shows', newShow],
  'PUT /shows/:id': () => ['put', `/shows/${show.id}`, { description: 'changed' }],
  'DELETE /shows/:id': () => ['delete', `/shows/${show.id}`],
  'POST /episodes': () => ['post', '/episodes', {
    title: 'New', description: 'Sample', audio_link: 'audios/new.mp3',
    date_added: '2026-01-01', duration: 10, show_name: show.name
  }],
  'PUT /episodes/:id': () => ['put', `/episodes/${episode.id}`, { description: 'changed' }],
  'DELETE /episodes/:id': () => ['delete', `/episodes/${episode.id}`]
}
const writeNames = Object.keys(writes)

beforeEach(async () => {
  show = await insertShow()
  episode = await insertEpisode(show.id)
})

async function tableSnapshot() {
  const shows = await db.query('SELECT id, description FROM shows ORDER BY id')
  const episodes = await db.query('SELECT id, description FROM episodes ORDER BY id')
  return { shows: shows.rows, episodes: episodes.rows }
}

describe('writes to the catalog', () => {
  it.each(writeNames)('%s answers 401 with no login, and changes nothing', async (name) => {
    const before = await tableSnapshot()
    const [method, url, body] = writes[name]()
    const res = await request(app)[method](url).send(body)
    expect(res.status).toBe(401)
    expect(await tableSnapshot()).toEqual(before)
  })

  it.each(writeNames)('%s answers 403 for a regular user, and changes nothing', async (name) => {
    const token = accessToken(await insertUser())
    const before = await tableSnapshot()
    const [method, url, body] = writes[name]()
    const res = await request(app)[method](url).set('Authorization', `Bearer ${token}`).send(body)
    expect(res.status).toBe(403)
    expect(await tableSnapshot()).toEqual(before)
  })

  it.each(writeNames)('%s works for an admin', async (name) => {
    const token = accessToken(await insertUser({ isAdmin: true }), 'admin')
    const [method, url, body] = writes[name]()
    const res = await request(app)[method](url).set('Authorization', `Bearer ${token}`).send(body)
    expect(res.status).toBe(201)
  })

  it('rejects an admin token signed with the wrong secret', async () => {
    const user = await insertUser()
    const forged = signToken({ userID: user.id, role: 'admin' }, 'guessed-secret')
    const res = await request(app).delete(`/shows/${show.id}`).set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(403)
  })

  it('rejects an unsigned admin token', async () => {
    const user = await insertUser()
    const forged = unsignedToken({ userID: user.id, role: 'admin' })
    const res = await request(app).delete(`/shows/${show.id}`).set('Authorization', `Bearer ${forged}`)
    expect(res.status).toBe(403)
  })
})

describe('reading the catalog', () => {
  it('stays public, because browsing does not need a login', async () => {
    expect((await request(app).get('/shows')).status).toBe(200)
    expect((await request(app).get(`/shows/${show.id}`)).status).toBe(200)
    expect((await request(app).get('/episodes')).status).toBe(200)
    expect((await request(app).get(`/episodes/ep/${episode.id}`)).status).toBe(200)
  })
})
