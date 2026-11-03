import { beforeEach, describe, expect, it, vi } from 'vitest'
import request from 'supertest'
import { insertUser } from './helpers/fixtures.js'

// The app reads this when it loads, so it has to be set before the import.
vi.hoisted(() => {
  process.env.TRUST_PROXY = '1'
})

const { default: app } = await import('../app.js')

describe('behind the HTTPS proxy', () => {
  let user

  beforeEach(async () => {
    user = await insertUser()
  })

  const failLogin = (address) => request(app)
    .post('/user/auth')
    .set('X-Forwarded-For', address)
    .send({ username: user.username, password: 'wrong' })

  it('limits each visitor by their real address, not the proxy address', async () => {
    for (let i = 0; i < 10; i++) {
      await failLogin('203.0.113.10').expect(401)
    }
    await failLogin('203.0.113.10').expect(429)
    await failLogin('203.0.113.20').expect(401)
  })

  it('cannot be fooled by a visitor adding a fake address', async () => {
    // The proxy adds the real address last, so only the last one counts.
    for (let i = 0; i < 10; i++) {
      await failLogin(`198.51.100.${i}, 203.0.113.30`).expect(401)
    }
    await failLogin('198.51.100.99, 203.0.113.30').expect(429)
  })

  it('sees the real address from the proxy', () => {
    expect(app.get('trust proxy')).toBe(1)
  })
})
