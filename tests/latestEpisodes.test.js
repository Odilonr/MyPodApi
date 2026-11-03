import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { insertShow, insertEpisode } from './helpers/fixtures.js'

describe('GET /episodes?type=Latest', () => {
  beforeEach(async () => {
    const show = await insertShow()
    for (let i = 0; i < 12; i++) await insertEpisode(show.id)
  })

  it('returns 8 by default', async () => {
    const res = await request(app).get('/episodes?type=Latest').expect(200)
    expect(res.body).toHaveLength(8)
  })

  it('accepts a limit', async () => {
    const res = await request(app).get('/episodes?type=Latest&limit=10').expect(200)
    expect(res.body).toHaveLength(10)
  })

  it.each(['abc', '0', '-1', '1; DROP TABLE episodes', '100000'])('uses a safe limit for %s', async (limit) => {
    const res = await request(app).get(`/episodes?type=Latest&limit=${encodeURIComponent(limit)}`).expect(200)
    expect(res.body.length).toBeGreaterThan(0)
    expect(res.body.length).toBeLessThanOrEqual(12)
  })
})
