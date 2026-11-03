import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, insertShow, insertEpisode, accessToken } from './helpers/fixtures.js'
import { safeFetchText, FeedFetchError } from '../services/safeFetch.js'

vi.mock('../services/safeFetch.js', async (original) => ({
  ...(await original()),
  safeFetchText: vi.fn()
}))

const FEED_URL = 'https://feeds.example.com/show.xml'

const item = (id, title = `Episode ${id}`) => `<item><title>${title}</title><guid>${id}</guid>
  <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
  <enclosure url="https://cdn.example.com/${id}.mp3" type="audio/mpeg" /><itunes:duration>120</itunes:duration></item>`

const xml = (items = item('a') + item('b')) => `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
  <title>Real Feed Show</title><description>From a feed</description><link>https://example.com</link>
  <itunes:author>The Host</itunes:author><itunes:image href="https://example.com/art.png" />
  <itunes:category text="Science" />${items}</channel></rss>`

let alice
let bob
let admin

beforeEach(async () => {
  alice = accessToken(await insertUser({ username: 'alice' }))
  bob = accessToken(await insertUser({ username: 'bob' }))
  admin = accessToken(await insertUser({ username: 'boss', isAdmin: true }), 'admin')
  safeFetchText.mockReset()
  safeFetchText.mockResolvedValue(xml())
})

const as = (token, req) => req.set('Authorization', `Bearer ${token}`)
const importFeed = async (token = alice, body = { url: FEED_URL }) => {
  const res = await as(token, request(app).post('/me/feeds')).send(body).expect(201)
  return res.body
}

describe('login is required', () => {
  it.each([
    ['get', '/me/feeds'],
    ['post', '/me/feeds'],
    ['post', '/me/feeds/preview'],
    ['patch', '/me/feeds/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['delete', '/me/feeds/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['post', '/me/feeds/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/refresh']
  ])('%s %s answers 401', async (method, url) => {
    await request(app)[method](url).expect(401)
    expect(safeFetchText).not.toHaveBeenCalled()
  })
})

describe('preview', () => {
  it('shows what the feed holds and saves nothing', async () => {
    const res = await as(alice, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(200)
    expect(res.body.show.name).toBe('Real Feed Show')
    expect(res.body.show.category).toBe('Science')
    expect(res.body.episodeCount).toBe(2)
    expect(res.body.episodes[0].title).toBe('Episode a')
    const { rows } = await db.query('SELECT count(*)::int AS n FROM shows')
    expect(rows[0].n).toBe(0)
  })

  it.each([
    ['no address', {}],
    ['an address that is not text', { url: { a: 1 } }],
    ['a very long address', { url: `https://example.com/${'x'.repeat(2100)}` }]
  ])('answers 400 for %s', async (_, body) => {
    await as(alice, request(app).post('/me/feeds/preview')).send(body).expect(400)
    expect(safeFetchText).not.toHaveBeenCalled()
  })

  it('answers 400 when the address is refused', async () => {
    safeFetchText.mockRejectedValue(new FeedFetchError('This address cannot be used', 400))
    const res = await as(alice, request(app).post('/me/feeds/preview')).send({ url: 'http://127.0.0.1/' }).expect(400)
    expect(res.body.message).toBe('This address cannot be used')
  })

  it('answers 502 when the feed cannot be reached', async () => {
    safeFetchText.mockRejectedValue(new FeedFetchError('The feed could not be reached', 502))
    await as(alice, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(502)
  })

  it('answers 422 when the page is not a podcast feed', async () => {
    safeFetchText.mockResolvedValue('<html></html>')
    await as(alice, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(422)
  })
})

describe('importing', () => {
  it('saves the show and its episodes for the user', async () => {
    const show = await importFeed()
    expect(show).toMatchObject({ name: 'Real Feed Show', show_type: 'Science', source_link: 'https://example.com/', episode_count: 2 })

    const episodes = await as(alice, request(app).get(`/shows/${show.id}/episodes`)).expect(200)
    expect(episodes.body.map((episode) => episode.audio_link).sort()).toEqual(['https://cdn.example.com/a.mp3', 'https://cdn.example.com/b.mp3'])
  })

  it('saves whether each episode is audio or video', async () => {
    safeFetchText.mockResolvedValue(xml(`${item('a')}<item><title>Video</title><guid>v</guid>
      <enclosure url="https://cdn.example.com/v.mp4" type="video/mp4" /></item>`))
    const show = await importFeed()
    const episodes = await as(alice, request(app).get(`/shows/${show.id}/episodes`)).expect(200)
    const types = Object.fromEntries(episodes.body.map((episode) => [episode.title, episode.media_type]))
    expect(types).toEqual({ 'Episode a': 'audio', Video: 'video' })
  })

  it('uses the name and category the user chose', async () => {
    const show = await importFeed(alice, { url: FEED_URL, name: '  My name  ', category: 'Morning' })
    expect(show.name).toBe('My name')
    expect(show.show_type).toBe('Morning')
  })

  it('removes HTML from a chosen name', async () => {
    const show = await importFeed(alice, { url: FEED_URL, name: '<img src=x onerror=alert(1)>Nice' })
    expect(show.name).toBe('Nice')
  })

  it.each([
    ['a name that is only HTML', { name: '<script>x</script>' }],
    ['a name that is too long', { name: 'x'.repeat(201) }],
    ['a category that is too long', { category: 'x'.repeat(61) }],
    ['a name that is not text', { name: { a: 1 } }]
  ])('answers 400 for %s', async (_, extra) => {
    await as(alice, request(app).post('/me/feeds')).send({ url: FEED_URL, ...extra }).expect(400)
  })

  it('answers 409 when the same user imports a feed twice', async () => {
    await importFeed()
    await as(alice, request(app).post('/me/feeds')).send({ url: FEED_URL }).expect(409)
  })

  it('lets two users import the same feed separately', async () => {
    const first = await importFeed(alice)
    const second = await importFeed(bob)
    expect(first.id).not.toBe(second.id)
  })

  it('stops at the limit of feeds for one user', async () => {
    const { rows } = await db.query(`SELECT id FROM users WHERE username = 'alice'`)
    await db.query(
      `INSERT INTO shows(id, name, description, profile_img_link, release_schedule, studio, host_name, show_type, date_added, owner_id, feed_url)
       SELECT gen_random_uuid(), 'S' || n, 'd', 'g', 'r', 's', 'h', 't', now(), $1, 'https://x.example/' || n
       FROM generate_series(1, 100) AS n`,
      [rows[0].id]
    )
    await as(alice, request(app).post('/me/feeds')).send({ url: FEED_URL }).expect(409)
  })

  it('lists only the user\'s own imports', async () => {
    const show = await importFeed(alice)
    const mine = await as(alice, request(app).get('/me/feeds')).expect(200)
    expect(mine.body.map((item) => item.id)).toEqual([show.id])
    expect((await as(bob, request(app).get('/me/feeds'))).body).toEqual([])
  })
})

describe('editing, refreshing and removing', () => {
  it('changes the name and category', async () => {
    const show = await importFeed()
    const res = await as(alice, request(app).patch(`/me/feeds/${show.id}`)).send({ name: 'New name', category: 'News' }).expect(200)
    expect(res.body).toMatchObject({ name: 'New name', show_type: 'News' })
  })

  it('rejects an edit with fields it does not allow', async () => {
    const show = await importFeed()
    await as(alice, request(app).patch(`/me/feeds/${show.id}`)).send({ owner_id: 'someone' }).expect(400)
    await as(alice, request(app).patch(`/me/feeds/${show.id}`)).send({}).expect(400)
  })

  it('adds only new episodes on refresh', async () => {
    const show = await importFeed()
    safeFetchText.mockResolvedValue(xml(item('a') + item('b') + item('c')))
    const res = await as(alice, request(app).post(`/me/feeds/${show.id}/refresh`)).expect(200)
    expect(res.body.added).toBe(1)
    expect(safeFetchText).toHaveBeenLastCalledWith(FEED_URL)
    const episodes = await as(alice, request(app).get(`/shows/${show.id}/episodes`))
    expect(episodes.body).toHaveLength(3)
  })

  it('removes a show with its episodes, favorites and saved places', async () => {
    const show = await importFeed()
    const [episode] = (await as(alice, request(app).get(`/shows/${show.id}/episodes`))).body
    await as(alice, request(app).put(`/me/favorites/${episode.id}`)).expect(204)
    await as(alice, request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)

    await as(alice, request(app).delete(`/me/feeds/${show.id}`)).expect(204)

    await as(alice, request(app).get(`/shows/${show.id}`)).expect(404)
    expect((await as(alice, request(app).get('/me/favorites'))).body).toEqual([])
    expect((await as(alice, request(app).get('/me/recent'))).body).toEqual([])
    const { rows } = await db.query('SELECT count(*)::int AS n FROM episodes')
    expect(rows[0].n).toBe(0)
  })

  it('removes imports when the user is removed', async () => {
    await importFeed()
    await db.query(`DELETE FROM users WHERE username = 'alice'`)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM shows')
    expect(rows[0].n).toBe(0)
  })
})

// Imported content is private to the person who imported it. It is never
// republished, so other people must not reach it even with its exact ID.
describe('an imported show is private', () => {
  let show
  let episode

  beforeEach(async () => {
    show = await importFeed(alice)
    episode = (await as(alice, request(app).get(`/shows/${show.id}/episodes`))).body[0]
  })

  it('is visible to its owner in the normal lists', async () => {
    const shows = await as(alice, request(app).get('/shows')).expect(200)
    expect(shows.body.map((item) => item.id)).toContain(show.id)
    const latest = await as(alice, request(app).get('/episodes?type=Latest')).expect(200)
    expect(latest.body.map((item) => item.id)).toContain(episode.id)
    await as(alice, request(app).get(`/episodes/ep/${episode.id}`)).expect(200)
  })

  describe.each([
    ['a guest', (req) => req],
    ['another user', (req) => as(bob, req)],
    ['an admin', (req) => as(admin, req)]
  ])('for %s', (_, viewer) => {
    it('does not appear in any list', async () => {
      for (const url of ['/shows', '/shows?type=Popular']) {
        const res = await viewer(request(app).get(url))
        expect(JSON.stringify(res.body)).not.toContain(show.id)
      }
      for (const url of ['/episodes', '/episodes?type=Latest', '/episodes?type=Hero']) {
        const res = await viewer(request(app).get(url))
        expect(JSON.stringify(res.body)).not.toContain(episode.id)
      }
    })

    it('answers 404 by exact ID', async () => {
      await viewer(request(app).get(`/shows/${show.id}`)).expect(404)
      await viewer(request(app).get(`/shows/${show.id}/episodes`)).expect(404)
      await viewer(request(app).get(`/episodes/ep/${episode.id}`)).expect(404)
    })
  })

  it('never streams its audio through the API', async () => {
    await as(alice, request(app).get(`/episodes/${episode.id}/audio`)).expect(404)
  })

  it('cannot be used by another user', async () => {
    await as(bob, request(app).get(`/episodes/${episode.id}/timestamp`)).expect(404)
    await as(bob, request(app).put(`/me/favorites/${episode.id}`)).expect(404)
    const playlist = await as(bob, request(app).post('/me/playlists')).send({ name: 'Mine' }).expect(201)
    await as(bob, request(app).put(`/me/playlists/${playlist.body.id}/episodes/${episode.id}`)).expect(404)
  })

  it('cannot be changed by another user', async () => {
    await as(bob, request(app).patch(`/me/feeds/${show.id}`)).send({ name: 'Taken' }).expect(404)
    await as(bob, request(app).post(`/me/feeds/${show.id}/refresh`)).expect(404)
    await as(bob, request(app).delete(`/me/feeds/${show.id}`)).expect(404)
    await as(alice, request(app).get(`/shows/${show.id}`)).expect(200)
  })

  it('cannot be changed through the admin catalog routes', async () => {
    await as(admin, request(app).delete(`/shows/${show.id}`)).expect(404)
    await as(admin, request(app).delete(`/episodes/${episode.id}`)).expect(404)
    await as(admin, request(app).put(`/shows/${show.id}`)).send({ description: 'changed' }).expect(409)
    await as(alice, request(app).get(`/shows/${show.id}`)).expect(200)
  })

  it('cannot be managed as an import when it is a catalog show', async () => {
    const catalog = await insertShow()
    await insertEpisode(catalog.id)
    await as(alice, request(app).delete(`/me/feeds/${catalog.id}`)).expect(404)
    await as(admin, request(app).delete(`/me/feeds/${catalog.id}`)).expect(404)
    await request(app).get(`/shows/${catalog.id}`).expect(200)
  })

  it('does not block an admin from adding a catalog show with the same name', async () => {
    await as(admin, request(app).post('/shows')).send({
      name: show.name, description: 'd', profile_img_link: 'g', release_schedule: 'r', studio: 's', host_name: 'h', show_type: 't'
    }).expect(201)
  })
})

describe('token handling on public routes', () => {
  it('asks for a new token when the one sent is not valid', async () => {
    await request(app).get('/shows').set('Authorization', 'Bearer not-a-token').expect(403)
  })

  it('still works with no token', async () => {
    await insertShow()
    await request(app).get('/shows').expect(200)
  })
})

describe('rate limit', () => {
  it('answers 429 after too many feed requests from one user', async () => {
    for (let i = 0; i < 30; i++) {
      await as(alice, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(200)
    }
    await as(alice, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(429)
    await as(bob, request(app).post('/me/feeds/preview')).send({ url: FEED_URL }).expect(200)
  })
})
