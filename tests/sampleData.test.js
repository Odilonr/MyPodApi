import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { seedSampleData } from '../scripts/sampleData.js'
import { db } from './helpers/db.js'

let audioDir

beforeAll(() => {
  audioDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mypod-seed-'))
})

afterAll(() => {
  fs.rmSync(audioDir, { recursive: true, force: true })
})

describe('seedSampleData', () => {
  it('labels every show as a sample and invents no ratings', async () => {
    await seedSampleData(audioDir)
    const { rows } = await db.query('SELECT name, description, review_stars, review_count FROM shows')
    expect(rows.length).toBeGreaterThan(0)
    for (const show of rows) {
      expect(show.name).toMatch(/^Sample: /)
      expect(show.description).toContain('sample')
      expect(show.review_stars).toBeNull()
      expect(show.review_count).toBeNull()
    }
  })

  it('creates a playable audio file for every episode', async () => {
    await seedSampleData(audioDir)
    const { rows } = await db.query('SELECT audio_link, duration FROM episodes')
    expect(rows.length).toBeGreaterThan(0)
    for (const episode of rows) {
      const file = path.join(audioDir, episode.audio_link.replace(/^audios\//, ''))
      const header = fs.readFileSync(file).subarray(0, 4).toString()
      expect(header).toBe('RIFF')
      expect(episode.duration).toBeGreaterThan(0)
    }
  })

  it('adds nothing new when it runs twice', async () => {
    await seedSampleData(audioDir)
    const before = (await db.query('SELECT count(*)::int AS n FROM episodes')).rows[0].n
    await seedSampleData(audioDir)
    const after = (await db.query('SELECT count(*)::int AS n FROM episodes')).rows[0].n
    expect(after).toBe(before)
  })
})
