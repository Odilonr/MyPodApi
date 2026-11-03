import { describe, it, expect } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertShow, insertEpisode } from './helpers/fixtures.js'

describe('GET /shows/:id/episodes', () => {
  it('returns only that show, newest first', async () => {
    const show = await insertShow()
    const other = await insertShow()
    const older = await insertEpisode(show.id)
    const newer = await insertEpisode(show.id)
    await insertEpisode(other.id)
    await db.query(`UPDATE episodes SET date_added = '2026-01-01' WHERE id = $1`, [older.id])
    await db.query(`UPDATE episodes SET date_added = '2026-02-01' WHERE id = $1`, [newer.id])

    const res = await request(app).get(`/shows/${show.id}/episodes`).expect(200)
    expect(res.body.map((episode) => episode.id)).toEqual([newer.id, older.id])
    expect(res.body[0].show_name).toBe(show.name)
  })

  it('returns an empty list for a show with no episodes', async () => {
    const show = await insertShow()
    const res = await request(app).get(`/shows/${show.id}/episodes`).expect(200)
    expect(res.body).toEqual([])
  })

  it('answers 404 for an unknown show', async () => {
    await request(app).get('/shows/3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11/episodes').expect(404)
  })

  it('answers 404 for an ID that is not a UUID', async () => {
    await request(app).get('/shows/not-a-uuid/episodes').expect(404)
  })
})
