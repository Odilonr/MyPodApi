import { describe, it, expect, beforeEach } from 'vitest'
import request from 'supertest'
import app from '../app.js'
import { db } from './helpers/db.js'
import { insertUser, accessToken } from './helpers/fixtures.js'

const TYPES = ['recent', 'start_here', 'latest', 'shows', 'favorites', 'playlists', 'topics']
const section = (type, overrides = {}) => ({ type, visible: true, size: 'large', hiddenItems: [], ...overrides })
const defaults = () => TYPES.map((type) => section(type))

let aliceToken
let bobToken

beforeEach(async () => {
  aliceToken = accessToken(await insertUser({ username: 'alice' }))
  bobToken = accessToken(await insertUser({ username: 'bob' }))
})

const getLayout = (token) => request(app).get('/me/layout').set('Authorization', `Bearer ${token}`)
const saveLayout = (token, body) => request(app).put('/me/layout').set('Authorization', `Bearer ${token}`).send(body)

describe('login is required', () => {
  it('answers 401 for reading', async () => {
    await request(app).get('/me/layout').expect(401)
  })

  it('answers 401 for saving', async () => {
    await request(app).put('/me/layout').send({ sections: defaults() }).expect(401)
  })
})

describe('GET /me/layout', () => {
  it('gives a new user the starting layout', async () => {
    const res = await getLayout(aliceToken).expect(200)
    expect(res.body.sections).toEqual(defaults())
    expect(res.body.isCustom).toBe(false)
  })

  it('adds a section type that did not exist when the user saved', async () => {
    await saveLayout(aliceToken, { sections: [...defaults()].reverse() }).expect(200)
    await db.query(`DELETE FROM pod_sections WHERE section_type = 'topics'`)
    const res = await getLayout(aliceToken).expect(200)
    expect(res.body.sections.map((item) => item.type)).toEqual(['playlists', 'favorites', 'shows', 'latest', 'start_here', 'recent', 'topics'])
  })
})

describe('PUT /me/layout', () => {
  it('saves the order, hidden sections, sizes and hidden items', async () => {
    const sections = [
      section('favorites', { size: 'small' }),
      section('shows', { hiddenItems: ['3f1f8a52-7d3a-4d55-9c55-0a4f0a9a1a11'] }),
      section('recent', { visible: false }),
      section('topics', { hiddenItems: ['Travel'] }),
      section('latest'),
      section('start_here'),
      section('playlists')
    ]
    const saved = await saveLayout(aliceToken, { sections }).expect(200)
    expect(saved.body.sections).toEqual(sections)

    const res = await getLayout(aliceToken).expect(200)
    expect(res.body.sections).toEqual(sections)
    expect(res.body.isCustom).toBe(true)
  })

  it('replaces the old layout when saved again', async () => {
    await saveLayout(aliceToken, { sections: [...defaults()].reverse() }).expect(200)
    await saveLayout(aliceToken, { sections: defaults() }).expect(200)
    expect((await getLayout(aliceToken)).body.sections).toEqual(defaults())
    const { rows } = await db.query('SELECT count(*)::int AS n FROM pods')
    expect(rows[0].n).toBe(1)
  })

  it.each([
    ['no body', undefined],
    ['sections that are not a list', { sections: 'all' }],
    ['a missing section', { sections: defaults().slice(1) }],
    ['a repeated section', { sections: [...defaults().slice(1), section('latest')] }],
    ['an unknown section', { sections: [...defaults().slice(1), section('admin_panel')] }],
    ['SQL in a section type', { sections: [...defaults().slice(1), section("recent'; DROP TABLE users; --")] }],
    ['a bad size', { sections: [...defaults().slice(1), section('recent', { size: 'huge' })] }],
    ['visible that is not true or false', { sections: [...defaults().slice(1), section('recent', { visible: 'yes' })] }],
    ['hidden items that are not a list', { sections: [...defaults().slice(1), section('recent', { hiddenItems: 'x' })] }],
    ['too many hidden items', { sections: [...defaults().slice(1), section('recent', { hiddenItems: Array(201).fill('x') })] }],
    ['a hidden item that is too long', { sections: [...defaults().slice(1), section('recent', { hiddenItems: ['x'.repeat(101)] })] }],
    ['an extra field on a section', { sections: [...defaults().slice(1), section('recent', { user_id: 'someone' })] }],
    ['an extra field on the layout', { sections: defaults(), userId: 'someone' }]
  ])('answers 400 and saves nothing for %s', async (_, body) => {
    await saveLayout(aliceToken, body).expect(400)
    expect((await getLayout(aliceToken)).body.isCustom).toBe(false)
  })

  it('keeps the old layout when a new one is rejected', async () => {
    const reversed = [...defaults()].reverse()
    await saveLayout(aliceToken, { sections: reversed }).expect(200)
    await saveLayout(aliceToken, { sections: defaults().slice(1) }).expect(400)
    expect((await getLayout(aliceToken)).body.sections).toEqual(reversed)
  })
})

// The layout route has no ID in its URL. The owner always comes from the login
// token, so there is no ID for another user to guess.
describe('each user has their own layout', () => {
  it("does not show one user's layout to another", async () => {
    await saveLayout(aliceToken, { sections: [...defaults()].reverse() }).expect(200)
    const res = await getLayout(bobToken).expect(200)
    expect(res.body.isCustom).toBe(false)
    expect(res.body.sections).toEqual(defaults())
  })

  it("does not change one user's layout when another saves", async () => {
    const reversed = [...defaults()].reverse()
    await saveLayout(aliceToken, { sections: reversed }).expect(200)
    await saveLayout(bobToken, { sections: defaults() }).expect(200)
    expect((await getLayout(aliceToken)).body.sections).toEqual(reversed)
  })

  it('removes the layout when the user is removed', async () => {
    await saveLayout(aliceToken, { sections: defaults() }).expect(200)
    await db.query(`DELETE FROM users WHERE username = 'alice'`)
    const { rows } = await db.query('SELECT count(*)::int AS n FROM pod_sections')
    expect(rows[0].n).toBe(0)
  })
})
