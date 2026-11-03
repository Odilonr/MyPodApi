import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { PGlite } from '@electric-sql/pglite'

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'migrations')

export const db = new PGlite()

// Same shape as config/dbConn.js, so the app code runs unchanged.
export async function poolQuery(text, params) {
  return db.query(text, params)
}

export async function getClient() {
  return { query: (text, params) => db.query(text, params), release() {} }
}

// Runs the "Up" part of each migration file, in order. `before` and `from` let
// a test look at the database as it was before a migration, then apply the rest.
export async function applyMigrations(database, { before, from } = {}) {
  const files = fs.readdirSync(migrationsDir).filter((file) => file.endsWith('.sql')).sort()
  for (const file of files) {
    if (before && file >= before) continue
    if (from && file < from) continue
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8')
    await database.exec(sql.split(/^\s*--\s*Down Migration/im)[0])
  }
}

export async function clearTables() {
  await db.exec('TRUNCATE users, shows, episodes, episodes_progress CASCADE')
}
