import { describe, it, expect, beforeEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, accessToken } from './helpers/fixtures.js'
import { safeFetchText } from '../services/safeFetch.js'
import { syncCatalog } from '../services/catalogSync.js'
import { CATALOG_FEEDS } from '../config/catalogFeeds.js'

vi.mock('../services/safeFetch.js', async (original) => ({
  ...(await original()),
  safeFetchText: vi.fn()
}))

const FEED_A = 'https://feeds.example.com/a.xml'
const FEED_B = 'https://feeds.example.com/b.xml'

const items = (count, prefix = 'e') => Array.from({ length: count }, (_, index) => `<item>
  <title>${prefix} ${index}</title><guid>${prefix}-${index}</guid>
  <pubDate>${new Date(Date.UTC(2026, 0, index + 1)).toUTCString()}</pubDate>
  <enclosure url="https://cdn.example.com/${prefix}-${index}.mp3" type="audio/mpeg" /></item>`).join('')

const xml = (name, episodes = items(3), category = 'Science') => `<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>
  <title>${name}</title><description>About ${name}</description><link>https://example.com/${name}</link>
  <itunes:author>Host of ${name}</itunes:author><itunes:image href="https://example.com/${name}.png" />
  <itunes:category text="${category}" />${episodes}</channel></rss>`

beforeEach(() => {
  safeFetchText.mockReset()
  safeFetchText.mockImplementation(async (url) => (url === FEED_A ? xml('Show A') : xml('Show B')))
})

describe('syncCatalog', () => {
  it('fills the public catalog, so a guest sees real shows right away', async () => {
    const result = await syncCatalog([FEED_A, FEED_B])
    expect(result).toEqual({ synced: 2, failed: [], added: 6 })

    const shows = await request(app).get('/shows').expect(200)
    expect(shows.body.map((show) => show.name).sort()).toEqual(['Show A', 'Show B'])
    expect(shows.body[0]).toMatchObject({ owner_id: null, show_type: 'Science' })

    const latest = await request(app).get('/episodes?type=Latest&limit=24').expect(200)
    expect(latest.body).toHaveLength(6)
    expect(latest.body[0].audio_link).toMatch(/^https:\/\/cdn\.example\.com\//)
  })

  it('keeps the original credit and link', async () => {
    await syncCatalog([FEED_A])
    const [show] = (await request(app).get('/shows')).body
    expect(show.host_name).toBe('Host of Show A')
    expect(show.source_link).toBe('https://example.com/Show%20A')
    expect(show.profile_img_link).toBe('https://example.com/Show A.png'.replace(' ', '%20'))
  })

  it('does not create copies when it runs again', async () => {
    await syncCatalog([FEED_A])
    const second = await syncCatalog([FEED_A])
    expect(second.added).toBe(0)
    expect((await request(app).get('/shows')).body).toHaveLength(1)
    expect((await request(app).get('/episodes')).body).toHaveLength(3)
  })

  it('adds new episodes and updated details when it runs again', async () => {
    await syncCatalog([FEED_A])
    safeFetchText.mockResolvedValue(xml('Renamed show', items(4), 'History'))
    const second = await syncCatalog([FEED_A])
    expect(second.added).toBe(1)
    const shows = (await request(app).get('/shows')).body
    expect(shows).toHaveLength(1)
    expect(shows[0]).toMatchObject({ name: 'Renamed show', show_type: 'History' })
  })

  it('keeps only the newest episodes of a long feed', async () => {
    safeFetchText.mockResolvedValue(xml('Long show', items(28)))
    const { added } = await syncCatalog([FEED_A])
    expect(added).toBe(20)
    const titles = (await request(app).get('/episodes')).body.map((episode) => episode.title)
    expect(titles).toContain('e 27')
    expect(titles).not.toContain('e 0')
  })

  it('keeps going when one feed fails, and keeps that show if it already exists', async () => {
    await syncCatalog([FEED_A, FEED_B])
    safeFetchText.mockImplementation(async (url) => {
      if (url === FEED_A) throw new Error('down')
      return xml('Show B')
    })
    const result = await syncCatalog([FEED_A, FEED_B])
    expect(result.synced).toBe(1)
    expect(result.failed).toEqual([FEED_A])
    expect((await request(app).get('/shows')).body).toHaveLength(2)
  })

  it('keeps going when a feed is not valid', async () => {
    safeFetchText.mockImplementation(async (url) => (url === FEED_A ? '<html></html>' : xml('Show B')))
    const result = await syncCatalog([FEED_A, FEED_B])
    expect(result).toMatchObject({ synced: 1, failed: [FEED_A] })
  })

  it('removes HTML from feed text', async () => {
    safeFetchText.mockResolvedValue(xml('<![CDATA[<script>alert(1)</script>Safe]]>'))
    await syncCatalog([FEED_A])
    expect((await request(app).get('/shows')).body[0].name).toBe('Safe')
  })
})

describe('catalog shows', () => {
  let alice

  beforeEach(async () => {
    alice = accessToken(await insertUser({ username: 'alice' }))
    await syncCatalog([FEED_A])
  })

  const as = (req) => req.set('Authorization', `Bearer ${alice}`)
  const show = async () => (await request(app).get('/shows')).body[0]

  it('can be opened, favorited and resumed by a logged-in user', async () => {
    const { id } = await show()
    const [episode] = (await request(app).get(`/shows/${id}/episodes`).expect(200)).body
    await as(request(app).put(`/me/favorites/${episode.id}`)).expect(204)
    await as(request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
  })

  it('cannot be edited or removed through a user\'s import routes', async () => {
    const { id } = await show()
    await as(request(app).patch(`/me/feeds/${id}`)).send({ name: 'Taken' }).expect(404)
    await as(request(app).post(`/me/feeds/${id}/refresh`)).expect(404)
    await as(request(app).delete(`/me/feeds/${id}`)).expect(404)
    await request(app).get(`/shows/${id}`).expect(200)
  })

  it('does not stop a user from importing the same feed privately', async () => {
    safeFetchText.mockResolvedValue(xml('Show A'))
    await as(request(app).post('/me/feeds')).send({ url: FEED_A }).expect(201)
  })
})

describe('the sample shows are gone', () => {
  it('has no sample data script', async () => {
    await expect(import('../scripts/sampleData.js')).rejects.toThrow()
  })
})

describe('the feed list', () => {
  it('has a good number of public web addresses, with no repeats', () => {
    expect(CATALOG_FEEDS.length).toBeGreaterThanOrEqual(20)
    expect(new Set(CATALOG_FEEDS).size).toBe(CATALOG_FEEDS.length)
    for (const url of CATALOG_FEEDS) expect(url).toMatch(/^https:\/\//)
  })
})

describe('uploads can be turned off', () => {
  it('answers 404 by default, and stores nothing', async () => {
    const token = accessToken(await insertUser({ username: 'carol' }))
    delete process.env.UPLOADS_ENABLED
    const res = await request(app).post('/me/uploads').set('Authorization', `Bearer ${token}`).attach('file', Buffer.from('x'), 'a.wav')
    expect(res.status).toBe(404)
    expect(res.body.message).toBe('Uploads are turned off')
  })

  it('still needs a login first', async () => {
    delete process.env.UPLOADS_ENABLED
    await request(app).post('/me/uploads').expect(401)
  })
})
