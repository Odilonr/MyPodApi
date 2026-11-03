import { vi, beforeAll, beforeEach, afterAll } from 'vitest'
import { db, applyMigrations, clearTables } from './helpers/db.js'

// The real SQL runs against PGlite, which is PostgreSQL running inside Node.
vi.mock('../config/dbConn.js', async () => {
  const { poolQuery, getClient } = await import('./helpers/db.js')
  return { poolQuery, getClient }
})

beforeAll(async () => {
  await applyMigrations(db)
})

beforeEach(async () => {
  await clearTables()
})

afterAll(async () => {
  await db.close()
})
