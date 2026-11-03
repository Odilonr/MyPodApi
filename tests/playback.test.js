import { describe, it, expect, vi, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { insertUser, insertShow, insertEpisode, accessToken } from './helpers/fixtures.js'

// Found while fixing Stage 1: these handlers logged the login token, and a
// database error inside their async callback could stop the whole server.
let token
let episode

beforeEach(async () => {
  token = accessToken(await insertUser())
  episode = await insertEpisode((await insertShow()).id)
})

const authed = (req) => req.set('Authorization', `Bearer ${token}`)

describe('resume position', () => {
  it('starts at 0, saves, and returns the saved time', async () => {
    const start = await authed(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    expect(start.body.currentplaytime).toBe(0)

    await authed(request(app).post(`/episodes/updatetime?episodeID=${episode.id}&new=42.7`)).expect(200)

    const saved = await authed(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    expect(saved.body.currentplaytime).toBe(42)
  })

  it('keeps each user separate', async () => {
    await authed(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    await authed(request(app).post(`/episodes/updatetime?episodeID=${episode.id}&new=42`)).expect(200)

    const other = accessToken(await insertUser({ username: 'other' }))
    const res = await request(app).get(`/episodes/${episode.id}/timestamp`).set('Authorization', `Bearer ${other}`).expect(200)
    expect(res.body.currentplaytime).toBe(0)
  })

  it('answers 404 for an ID that is not a UUID', async () => {
    await authed(request(app).get('/episodes/not-a-uuid/timestamp')).expect(404)
  })

  it('answers 404 for an unknown episode', async () => {
    await authed(request(app).get('/episodes/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/timestamp')).expect(404)
  })

  it.each([
    ['an episode ID that is not a UUID', 'episodeID=not-a-uuid&new=5'],
    ['a time that is not a number', 'episodeID=EPISODE&new=abc'],
    ['a negative time', 'episodeID=EPISODE&new=-5']
  ])('answers 400 for %s', async (_, query) => {
    await authed(request(app).post(`/episodes/updatetime?${query.replace('EPISODE', episode.id)}`)).expect(400)
  })

  it('never writes the login token to the console', async () => {
    const spy = vi.spyOn(console, 'log')
    await authed(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    await authed(request(app).post(`/episodes/updatetime?episodeID=${episode.id}&new=1`)).expect(200)
    const logged = spy.mock.calls.flat().join(' ')
    spy.mockRestore()
    expect(logged).not.toContain(token)
  })
})
