import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { insertShow, insertEpisode } from './helpers/fixtures.js'

// Issue 1: /episodes/audio?path=... streamed any file, with no login.
const SECRET_FILE = '.env.stage1-test'
const SECRET_TEXT = 'ACCESS_TOKEN_SECRET=not-a-real-secret'
const AUDIO_BYTES = Buffer.alloc(1000, 'a')

let tempDir
let showId

beforeAll(() => {
  fs.writeFileSync(SECRET_FILE, SECRET_TEXT)
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mypod-audio-'))
  fs.mkdirSync(path.join(tempDir, 'audios', 'sample'), { recursive: true })
  fs.mkdirSync(path.join(tempDir, 'audios-private'))
  fs.writeFileSync(path.join(tempDir, 'audios', 'sample', 'episode.mp3'), AUDIO_BYTES)
  fs.writeFileSync(path.join(tempDir, 'audios-private', 'secret.mp3'), SECRET_TEXT)
  fs.writeFileSync(path.join(tempDir, 'secret.txt'), SECRET_TEXT)
  process.env.AUDIO_DIR = path.join(tempDir, 'audios')
})

afterAll(() => {
  fs.rmSync(SECRET_FILE, { force: true })
  fs.rmSync(tempDir, { recursive: true, force: true })
  delete process.env.AUDIO_DIR
})

beforeEach(async () => {
  showId = (await insertShow()).id
})

async function audioResponse(audioLink, headers = {}) {
  const episode = await insertEpisode(showId, { audio_link: audioLink })
  return request(app).get(`/episodes/${episode.id}/audio`).set(headers)
}

describe('the old audio URL', () => {
  it('does not return a secret file named in the URL', async () => {
    const res = await request(app).get(`/episodes/audio?path=${SECRET_FILE}`).buffer(true).parse(textParser)
    expect(res.status).toBe(404)
    expect(res.body).not.toContain(SECRET_TEXT)
  })

  it('does not return source code named in the URL', async () => {
    const res = await request(app).get('/episodes/audio?path=package.json').buffer(true).parse(textParser)
    expect(res.status).toBe(404)
    expect(res.body).not.toContain('"dependencies"')
  })

  describe('when the file is missing', () => {
    let errorSpy
    beforeEach(() => { errorSpy = vi.spyOn(console, 'error') })
    afterEach(() => { errorSpy.mockRestore() })

    it('answers once and does not also throw an error', async () => {
      const res = await request(app).get('/episodes/audio?path=missing.mp3')
      expect(res.status).toBe(404)
      await new Promise((resolve) => setImmediate(resolve))
      const logged = errorSpy.mock.calls.flat().join(' ')
      expect(logged).not.toContain('Audio not found')
      expect(logged).not.toContain('ERR_HTTP_HEADERS_SENT')
    })
  })
})

describe('GET /episodes/:id/audio', () => {
  it('streams the audio file saved for that episode', async () => {
    const res = await audioResponse('audios/sample/episode.mp3')
    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toContain('audio/mpeg')
    expect(res.headers['content-length']).toBe('1000')
  })

  it('supports a byte range, so the player can seek', async () => {
    const res = await audioResponse('sample/episode.mp3', { Range: 'bytes=100-199' })
    expect(res.status).toBe(206)
    expect(res.headers['content-range']).toBe('bytes 100-199/1000')
    expect(res.headers['content-length']).toBe('100')
  })

  it('answers 416 for a range past the end of the file', async () => {
    const res = await audioResponse('sample/episode.mp3', { Range: 'bytes=5000-' })
    expect(res.status).toBe(416)
  })

  it.each([
    ['a parent folder', '../secret.txt'],
    ['a parent folder after the audios prefix', 'audios/../../secret.txt'],
    ['a folder whose name starts the same way', '../audios-private/secret.mp3'],
    ['the audio folder itself', 'audios/'],
    ['an absolute path', () => path.join(tempDir, 'secret.txt')]
  ])('will not serve a path that leaves the audio folder: %s', async (_, link) => {
    const res = await audioResponse(typeof link === 'function' ? link() : link)
    expect(res.status).toBe(404)
    expect(res.text || '').not.toContain(SECRET_TEXT)
  })

  it('answers 404 when the saved file does not exist', async () => {
    const res = await audioResponse('audios/sample/missing.mp3')
    expect(res.status).toBe(404)
  })

  it('answers 404 for an unknown episode', async () => {
    const res = await request(app).get('/episodes/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/audio')
    expect(res.status).toBe(404)
  })

  it('answers 404 for an ID that is not a UUID', async () => {
    const res = await request(app).get('/episodes/not-a-uuid/audio')
    expect(res.status).toBe(404)
  })
})

// The old route sends every file as audio/mpeg, so read the body as plain text.
function textParser(res, callback) {
  let text = ''
  res.setEncoding('utf8')
  res.on('data', (chunk) => { text += chunk })
  res.on('end', () => callback(null, text))
}
