import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, insertShow, insertEpisode, accessToken } from './helpers/fixtures.js'

let alice
let bob
let aliceToken
let bobToken
let show
let first
let second

beforeEach(async () => {
  alice = await insertUser({ username: 'alice' })
  bob = await insertUser({ username: 'bob' })
  aliceToken = accessToken(alice)
  bobToken = accessToken(bob)
  show = await insertShow()
  first = await insertEpisode(show.id)
  second = await insertEpisode(show.id)
})

const as = (token, req) => req.set('Authorization', `Bearer ${token}`)
const asAlice = (req) => as(aliceToken, req)
const asBob = (req) => as(bobToken, req)

describe('login is required', () => {
  it.each([
    ['get', '/me/recent'],
    ['get', '/me/favorites'],
    ['put', '/me/favorites/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['delete', '/me/favorites/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['get', '/me/playlists'],
    ['post', '/me/playlists'],
    ['get', '/me/playlists/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['delete', '/me/playlists/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11']
  ])('%s %s answers 401 with no login', async (method, url) => {
    await request(app)[method](url).expect(401)
  })
})

describe('favorites', () => {
  it('adds, lists with show details, and removes', async () => {
    await asAlice(request(app).put(`/me/favorites/${first.id}`)).expect(204)
    const list = await asAlice(request(app).get('/me/favorites')).expect(200)
    expect(list.body.map((episode) => episode.id)).toEqual([first.id])
    expect(list.body[0].show_name).toBe(show.name)

    await asAlice(request(app).delete(`/me/favorites/${first.id}`)).expect(204)
    expect((await asAlice(request(app).get('/me/favorites'))).body).toEqual([])
  })

  it('does nothing extra when the same episode is added twice', async () => {
    await asAlice(request(app).put(`/me/favorites/${first.id}`)).expect(204)
    await asAlice(request(app).put(`/me/favorites/${first.id}`)).expect(204)
    expect((await asAlice(request(app).get('/me/favorites'))).body).toHaveLength(1)
  })

  it('keeps each user separate', async () => {
    await asAlice(request(app).put(`/me/favorites/${first.id}`)).expect(204)
    expect((await asBob(request(app).get('/me/favorites'))).body).toEqual([])
    await asBob(request(app).delete(`/me/favorites/${first.id}`)).expect(204)
    expect((await asAlice(request(app).get('/me/favorites'))).body).toHaveLength(1)
  })

  it('answers 404 for an unknown or badly formed episode', async () => {
    await asAlice(request(app).put('/me/favorites/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11')).expect(404)
    await asAlice(request(app).put('/me/favorites/not-a-uuid')).expect(404)
  })
})

describe('recently listened', () => {
  const listen = async (req, episode, seconds) => {
    await req(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    await req(request(app).post(`/episodes/updatetime?episodeID=${episode.id}&new=${seconds}`)).expect(200)
  }

  it('lists the latest listen first, with the saved position', async () => {
    await listen(asAlice, first, 10)
    await listen(asAlice, second, 20)
    await db.query(`UPDATE episodes_progress SET updated_at = now() - interval '1 hour' WHERE episode_id = $1`, [first.id])

    const res = await asAlice(request(app).get('/me/recent')).expect(200)
    expect(res.body.map((episode) => episode.id)).toEqual([second.id, first.id])
    expect(res.body[0].currentplaytime).toBe(20)
    expect(res.body[0].show_name).toBe(show.name)
  })

  it('moves an episode to the top when it is listened to again', async () => {
    await listen(asAlice, first, 10)
    await listen(asAlice, second, 20)
    await db.query(`UPDATE episodes_progress SET updated_at = now() - interval '1 hour'`)
    await listen(asAlice, first, 15)
    const res = await asAlice(request(app).get('/me/recent')).expect(200)
    expect(res.body[0].id).toBe(first.id)
  })

  it('keeps each user separate', async () => {
    await listen(asAlice, first, 10)
    expect((await asBob(request(app).get('/me/recent'))).body).toEqual([])
  })
})

describe('playlists', () => {
  const create = async (req, name = 'For the road') => {
    const res = await req(request(app).post('/me/playlists')).send({ name }).expect(201)
    return res.body
  }

  it('creates, lists with a count, and shows episodes in the order added', async () => {
    const playlist = await create(asAlice)
    expect(playlist.name).toBe('For the road')

    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${second.id}`)).expect(204)
    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)

    const list = await asAlice(request(app).get('/me/playlists')).expect(200)
    expect(list.body).toEqual([expect.objectContaining({ id: playlist.id, name: 'For the road', episode_count: 2 })])

    const detail = await asAlice(request(app).get(`/me/playlists/${playlist.id}`)).expect(200)
    expect(detail.body.episodes.map((episode) => episode.id)).toEqual([second.id, first.id])
  })

  it('removes an episode, and deletes a playlist', async () => {
    const playlist = await create(asAlice)
    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)
    await asAlice(request(app).delete(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)
    expect((await asAlice(request(app).get(`/me/playlists/${playlist.id}`))).body.episodes).toEqual([])

    await asAlice(request(app).delete(`/me/playlists/${playlist.id}`)).expect(204)
    await asAlice(request(app).get(`/me/playlists/${playlist.id}`)).expect(404)
  })

  it('adds the same episode only once', async () => {
    const playlist = await create(asAlice)
    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)
    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)
    expect((await asAlice(request(app).get(`/me/playlists/${playlist.id}`))).body.episodes).toHaveLength(1)
  })

  it.each([
    ['an empty name', ''],
    ['only spaces', '   '],
    ['a name that is too long', 'x'.repeat(61)],
    ['a name that is not text', { a: 1 }]
  ])('answers 400 for %s', async (_, name) => {
    await asAlice(request(app).post('/me/playlists')).send({ name }).expect(400)
  })

  it('answers 409 for a name the user already has, but another user can use it', async () => {
    await create(asAlice)
    await asAlice(request(app).post('/me/playlists')).send({ name: 'For the road' }).expect(409)
    await create(asBob)
  })

  it('answers 404 when adding an unknown episode', async () => {
    const playlist = await create(asAlice)
    await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11`)).expect(404)
  })

  // User B must not be able to reach user A's playlist by guessing its ID. The
  // answer is 404, so B cannot even learn that the playlist exists.
  describe("another user's playlist", () => {
    let playlist

    beforeEach(async () => {
      playlist = await create(asAlice)
      await asAlice(request(app).put(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(204)
    })

    it('cannot be read', async () => {
      await asBob(request(app).get(`/me/playlists/${playlist.id}`)).expect(404)
      expect((await asBob(request(app).get('/me/playlists'))).body).toEqual([])
    })

    it('cannot be added to', async () => {
      await asBob(request(app).put(`/me/playlists/${playlist.id}/episodes/${second.id}`)).expect(404)
      expect((await asAlice(request(app).get(`/me/playlists/${playlist.id}`))).body.episodes).toHaveLength(1)
    })

    it('cannot have episodes removed', async () => {
      await asBob(request(app).delete(`/me/playlists/${playlist.id}/episodes/${first.id}`)).expect(404)
      expect((await asAlice(request(app).get(`/me/playlists/${playlist.id}`))).body.episodes).toHaveLength(1)
    })

    it('cannot be deleted', async () => {
      await asBob(request(app).delete(`/me/playlists/${playlist.id}`)).expect(404)
      await asAlice(request(app).get(`/me/playlists/${playlist.id}`)).expect(200)
    })
  })
})
