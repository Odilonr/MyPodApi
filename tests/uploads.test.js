import fs from 'fs'
import os from 'os'
import path from 'path'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, insertShow, accessToken } from './helpers/fixtures.js'
import { mp3File, wavFile } from './helpers/audioFiles.js'

let uploadDir
let alice
let bob
let admin

beforeAll(() => {
  uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mypod-uploads-'))
  process.env.UPLOAD_DIR = uploadDir
  process.env.MAX_UPLOAD_BYTES = String(200000)
  process.env.MAX_USER_STORAGE_BYTES = String(300000)
})

afterAll(() => {
  fs.rmSync(uploadDir, { recursive: true, force: true })
  delete process.env.UPLOAD_DIR
  delete process.env.MAX_UPLOAD_BYTES
  delete process.env.MAX_USER_STORAGE_BYTES
})

beforeEach(async () => {
  alice = accessToken(await insertUser({ username: 'alice' }))
  bob = accessToken(await insertUser({ username: 'bob' }))
  admin = accessToken(await insertUser({ username: 'boss', isAdmin: true }), 'admin')
})

afterEach(() => {
  for (const name of fs.readdirSync(uploadDir)) fs.rmSync(path.join(uploadDir, name), { force: true })
})

const as = (token, req) => req.set('Authorization', `Bearer ${token}`)
const storedFiles = () => fs.readdirSync(uploadDir)

const upload = (token, buffer, filename = 'my-episode.wav', contentType = 'audio/wav') =>
  as(token, request(app).post('/me/uploads')).attach('file', buffer, { filename, contentType })

const uploadOk = async (token = alice, buffer = wavFile(), filename) => {
  const res = await upload(token, buffer, filename).expect(201)
  return res.body
}

const streamUrl = async (token, id) => (await as(token, request(app).get(`/me/uploads/${id}/stream-url`)).expect(200)).body.url

describe('login is required', () => {
  it.each([
    ['post', '/me/uploads'],
    ['patch', '/me/uploads/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['delete', '/me/uploads/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'],
    ['get', '/me/uploads/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/stream-url']
  ])('%s %s answers 401', async (method, url) => {
    await request(app)[method](url).expect(401)
  })

  it('stores nothing for a guest', async () => {
    await request(app).post('/me/uploads').attach('file', wavFile(), 'a.wav').expect(401)
    expect(storedFiles()).toEqual([])
  })
})

describe('uploading', () => {
  it('saves the file with a random name and suggests details', async () => {
    const { episode, show } = await uploadOk(alice, wavFile(), 'my-episode.wav')
    expect(episode.title).toBe('my-episode')
    expect(episode.duration).toBe(2)
    expect(show.name).toBe('My uploads')
    expect(show.show_type).toBe('Uncategorized')

    const [stored] = storedFiles()
    expect(stored).toMatch(/^[0-9a-f-]{36}$/)
    expect(stored).not.toContain('my-episode')
  })

  it('fills in details from the tags inside the file', async () => {
    const buffer = mp3File({ TIT2: 'Tagged title', TPE1: 'Tagged host', TALB: 'Tagged show', TCON: 'Science' })
    const { episode, show } = await uploadOk(alice, buffer, 'x.mp3')
    expect(episode.title).toBe('Tagged title')
    expect(show.name).toBe('Tagged show')
    expect(show.show_type).toBe('Science')
    expect(show.host_name).toBe('Tagged host')
  })

  it('removes HTML from tags and file names', async () => {
    const tagged = await uploadOk(alice, mp3File({ TIT2: '<script>alert(1)</script>Nice', TALB: '<img src=x onerror=alert(1)>Show' }), 'x.mp3')
    expect(tagged.episode.title).toBe('Nice')
    expect(tagged.show.name).toBe('Show')
    const named = await uploadOk(alice, wavFile(), '<b>Bold.wav')
    expect(named.episode.title).toBe('Bold')
  })

  it('ignores folders in the file name', async () => {
    const { episode } = await uploadOk(alice, wavFile(), '../../../evil.wav')
    expect(episode.title).toBe('evil')
    expect(fs.existsSync(path.join(uploadDir, '..', 'evil.wav'))).toBe(false)
    expect(storedFiles()).toHaveLength(1)
  })

  it('adds a second file with the same show name to the same show', async () => {
    const first = await uploadOk(alice, mp3File({ TALB: 'Shared' }), 'a.mp3')
    const second = await uploadOk(alice, mp3File({ TALB: 'Shared' }), 'b.mp3')
    expect(second.show.id).toBe(first.show.id)
  })

  it('checks the real file, not its name or claimed type', async () => {
    const fakes = [
      ['a program named as audio', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(500)]), 'song.mp3'],
      ['a web page named as audio', Buffer.from('<html><script>alert(1)</script></html>'), 'song.wav'],
      ['an SVG named as audio', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'song.mp3'],
      ['a video file', Buffer.concat([Buffer.from([0, 0, 0, 32]), Buffer.from('ftypisom'), Buffer.alloc(500)]), 'song.mp3'],
      ['plain text', Buffer.from('just some text, not audio at all'), 'song.mp3']
    ]
    for (const [, buffer, filename] of fakes) {
      await upload(alice, buffer, filename, 'audio/mpeg').expect(415)
    }
    expect(storedFiles()).toEqual([])
    const { rows } = await db.query('SELECT count(*)::int AS n FROM episodes')
    expect(rows[0].n).toBe(0)
  })

  it('answers 400 for a request with no file', async () => {
    await as(alice, request(app).post('/me/uploads')).expect(400)
  })

  it('answers 400 for a file in the wrong field', async () => {
    await as(alice, request(app).post('/me/uploads')).attach('other', wavFile(), 'a.wav').expect(400)
    expect(storedFiles()).toEqual([])
  })

  it('answers 400 for more than one file', async () => {
    await as(alice, request(app).post('/me/uploads'))
      .attach('file', wavFile(), 'a.wav').attach('file', wavFile(), 'b.wav').expect(400)
    expect(storedFiles()).toEqual([])
  })

  it('answers 413 for a file over the size limit, and keeps nothing', async () => {
    await upload(alice, wavFile(60)).expect(413)
    expect(storedFiles()).toEqual([])
  })

  it('answers 413 when the user is out of storage, and keeps other users working', async () => {
    await uploadOk(alice, wavFile(30))
    await uploadOk(alice, wavFile(30))
    const before = storedFiles().length
    await upload(alice, wavFile(30)).expect(413)
    expect(storedFiles()).toHaveLength(before)
    await uploadOk(bob, wavFile(30))
  })
})

describe('playing an uploaded file', () => {
  it('streams with a stream link, and supports seeking', async () => {
    const { episode } = await uploadOk()
    const url = await streamUrl(alice, episode.id)

    const res = await request(app).get(url).expect(200)
    expect(res.headers['content-type']).toContain('audio/')
    expect(res.headers['x-content-type-options']).toBe('nosniff')
    expect(res.headers['cache-control']).toContain('private')

    const part = await request(app).get(url).set('Range', 'bytes=0-99').expect(206)
    expect(part.headers['content-length']).toBe('100')
  })

  it('is refused with no token', async () => {
    const { episode } = await uploadOk()
    await request(app).get(`/episodes/${episode.id}/audio`).expect(404)
    await as(alice, request(app).get(`/episodes/${episode.id}/audio`)).expect(404)
  })

  it.each(['not-a-token', 'a.b.c', ''])('is refused with the token %j', async (token) => {
    const { episode } = await uploadOk()
    await request(app).get(`/episodes/${episode.id}/audio?token=${token}`).expect(404)
  })

  it('does not accept a login token as a stream token', async () => {
    const { episode } = await uploadOk()
    await request(app).get(`/episodes/${episode.id}/audio?token=${alice}`).expect(404)
  })

  it('does not accept a stream token as a login token', async () => {
    const { episode } = await uploadOk()
    const token = new URL(await streamUrl(alice, episode.id), 'http://x').searchParams.get('token')
    await request(app).get('/me/feeds').set('Authorization', `Bearer ${token}`).expect(403)
  })

  it('does not let a stream token open a different file', async () => {
    const first = await uploadOk(alice, wavFile(), 'a.wav')
    const second = await uploadOk(alice, wavFile(), 'b.wav')
    const token = new URL(await streamUrl(alice, first.episode.id), 'http://x').searchParams.get('token')
    await request(app).get(`/episodes/${second.episode.id}/audio?token=${token}`).expect(404)
  })

  it('stops working once the file is deleted', async () => {
    const { episode } = await uploadOk()
    const url = await streamUrl(alice, episode.id)
    await as(alice, request(app).delete(`/me/uploads/${episode.id}`)).expect(200)
    await request(app).get(url).expect(404)
  })

  it('does not write the stream token to the logs', async () => {
    const { episode } = await uploadOk()
    const url = await streamUrl(alice, episode.id)
    const token = new URL(url, 'http://x').searchParams.get('token')
    const spy = vi.spyOn(console, 'log')
    await request(app).get(url).expect(200)
    const logged = spy.mock.calls.flat().join(' ')
    spy.mockRestore()
    expect(logged).not.toContain(token)
  })
})

// Uploaded files are private to the person who uploaded them.
describe('an uploaded file is private', () => {
  let episode
  let show

  beforeEach(async () => {
    ({ episode, show } = await uploadOk())
  })

  describe.each([
    ['a guest', (req) => req],
    ['another user', (req) => as(bob, req)],
    ['an admin', (req) => as(admin, req)]
  ])('for %s', (_, viewer) => {
    it('does not appear in lists or by exact ID', async () => {
      expect(JSON.stringify((await viewer(request(app).get('/shows'))).body)).not.toContain(show.id)
      expect(JSON.stringify((await viewer(request(app).get('/episodes?type=Latest'))).body)).not.toContain(episode.id)
      await viewer(request(app).get(`/shows/${show.id}`)).expect(404)
      await viewer(request(app).get(`/episodes/ep/${episode.id}`)).expect(404)
    })
  })

  it('cannot be reached or changed by another user', async () => {
    await as(bob, request(app).get(`/me/uploads/${episode.id}/stream-url`)).expect(404)
    await as(bob, request(app).patch(`/me/uploads/${episode.id}`)).send({ title: 'Taken' }).expect(404)
    await as(bob, request(app).delete(`/me/uploads/${episode.id}`)).expect(404)
    expect(storedFiles()).toHaveLength(1)
  })

  it('cannot be changed by an admin', async () => {
    await as(admin, request(app).delete(`/episodes/${episode.id}`)).expect(404)
    await as(admin, request(app).patch(`/me/uploads/${episode.id}`)).send({ title: 'Taken' }).expect(404)
  })

  it('is managed only through upload routes, so a catalog episode cannot be changed', async () => {
    const catalog = await insertShow()
    const { rows } = await db.query(
      `INSERT INTO episodes(id, title, description, audio_link, date_added, date_updated, show_id)
       VALUES(gen_random_uuid(), 'Catalog', 'd', 'audios/a.mp3', now(), now(), $1) RETURNING id`, [catalog.id]
    )
    await as(alice, request(app).patch(`/me/uploads/${rows[0].id}`)).send({ title: 'Taken' }).expect(404)
    await as(alice, request(app).delete(`/me/uploads/${rows[0].id}`)).expect(404)
  })
})

describe('editing', () => {
  it('changes the title', async () => {
    const { episode } = await uploadOk()
    const res = await as(alice, request(app).patch(`/me/uploads/${episode.id}`)).send({ title: '<b>New</b> title' }).expect(200)
    expect(res.body.episode.title).toBe('New title')
  })

  it('moves the episode to a new show with a category, and removes the empty show', async () => {
    const { episode, show: oldShow } = await uploadOk()
    const res = await as(alice, request(app).patch(`/me/uploads/${episode.id}`)).send({ showName: 'Morning', category: 'News' }).expect(200)
    expect(res.body.show).toMatchObject({ name: 'Morning', show_type: 'News' })
    expect(res.body.episode.show_id).toBe(res.body.show.id)
    await as(alice, request(app).get(`/shows/${oldShow.id}`)).expect(404)
  })

  it('moves the episode into an existing show of the user', async () => {
    const first = await uploadOk(alice, mp3File({ TALB: 'One' }), 'a.mp3')
    const second = await uploadOk(alice, mp3File({ TALB: 'Two' }), 'b.mp3')
    const res = await as(alice, request(app).patch(`/me/uploads/${second.episode.id}`)).send({ showName: 'One' }).expect(200)
    expect(res.body.show.id).toBe(first.show.id)
  })

  it('does not move an episode into another user\'s show of the same name', async () => {
    const bobs = await uploadOk(bob, mp3File({ TALB: 'Same' }), 'a.mp3')
    const { episode } = await uploadOk(alice, wavFile(), 'b.wav')
    const res = await as(alice, request(app).patch(`/me/uploads/${episode.id}`)).send({ showName: 'Same' }).expect(200)
    expect(res.body.show.id).not.toBe(bobs.show.id)
  })

  it.each([
    ['nothing to change', {}],
    ['a field it does not allow', { storage_key: '../../secret' }],
    ['a title that is only HTML', { title: '<script>x</script>' }],
    ['a title that is too long', { title: 'x'.repeat(301) }],
    ['a show name that is too long', { showName: 'x'.repeat(201) }],
    ['a category that is too long', { category: 'x'.repeat(61) }]
  ])('answers 400 for %s', async (_, body) => {
    const { episode } = await uploadOk()
    await as(alice, request(app).patch(`/me/uploads/${episode.id}`)).send(body).expect(400)
  })
})

describe('deleting', () => {
  it('removes the file from storage, and the show when it becomes empty', async () => {
    const { episode, show } = await uploadOk()
    const res = await as(alice, request(app).delete(`/me/uploads/${episode.id}`)).expect(200)
    expect(res.body.showRemoved).toBe(true)
    expect(storedFiles()).toEqual([])
    await as(alice, request(app).get(`/shows/${show.id}`)).expect(404)
  })

  it('keeps the show when it still has episodes', async () => {
    const first = await uploadOk(alice, wavFile(), 'a.wav')
    await uploadOk(alice, wavFile(), 'b.wav')
    const res = await as(alice, request(app).delete(`/me/uploads/${first.episode.id}`)).expect(200)
    expect(res.body.showRemoved).toBe(false)
    expect(storedFiles()).toHaveLength(1)
    await as(alice, request(app).get(`/shows/${first.show.id}`)).expect(200)
  })

  it('removes all files when the whole show is removed', async () => {
    const first = await uploadOk(alice, wavFile(), 'a.wav')
    await uploadOk(alice, wavFile(), 'b.wav')
    expect(storedFiles()).toHaveLength(2)
    await as(alice, request(app).delete(`/me/feeds/${first.show.id}`)).expect(204)
    expect(storedFiles()).toEqual([])
  })

  it('frees the storage for new uploads', async () => {
    const first = await uploadOk(alice, wavFile(30), 'a.wav')
    await uploadOk(alice, wavFile(30), 'b.wav')
    await as(alice, request(app).delete(`/me/uploads/${first.episode.id}`)).expect(200)
    await uploadOk(alice, wavFile(30), 'c.wav')
  })

  it('removes favorites and saved places with the episode', async () => {
    const { episode } = await uploadOk()
    await as(alice, request(app).put(`/me/favorites/${episode.id}`)).expect(204)
    await as(alice, request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    await as(alice, request(app).delete(`/me/uploads/${episode.id}`)).expect(200)
    expect((await as(alice, request(app).get('/me/favorites'))).body).toEqual([])
    expect((await as(alice, request(app).get('/me/recent'))).body).toEqual([])
  })
})

describe('upload shows and feed routes', () => {
  it('does not try to refresh a show with no feed', async () => {
    const { show } = await uploadOk()
    await as(alice, request(app).post(`/me/feeds/${show.id}/refresh`)).expect(400)
  })

  it('answers 409 when renaming a show to a name already in use', async () => {
    await uploadOk(alice, mp3File({ TALB: 'One' }), 'a.mp3')
    const second = await uploadOk(alice, mp3File({ TALB: 'Two' }), 'b.mp3')
    await as(alice, request(app).patch(`/me/feeds/${second.show.id}`)).send({ name: 'One' }).expect(409)
  })
})

describe('resume and playlists', () => {
  it('work like any other episode', async () => {
    const { episode } = await uploadOk()
    await as(alice, request(app).post(`/episodes/updatetime?episodeID=${episode.id}&new=1`)).expect(200)
    await as(alice, request(app).get(`/episodes/${episode.id}/timestamp`)).expect(200)
    const playlist = await as(alice, request(app).post('/me/playlists')).send({ name: 'Mine' }).expect(201)
    await as(alice, request(app).put(`/me/playlists/${playlist.body.id}/episodes/${episode.id}`)).expect(204)
  })
})
