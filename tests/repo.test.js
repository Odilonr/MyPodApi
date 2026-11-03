import { execFileSync } from 'child_process'
import fs from 'fs'
import { describe, it, expect } from 'vitest'

// Issue 8: repo cleanup.
const tracked = (target) => execFileSync('git', ['ls-files', target], { encoding: 'utf8' }).split('\n').filter(Boolean)
const ignoreList = () => fs.readFileSync('.gitignore', 'utf8').split(/\r?\n/)

describe('repo cleanup', () => {
  it('does not track log files', () => {
    expect(tracked('logs')).toEqual([])
    expect(ignoreList()).toContain('logs')
  })

  it('tracks the migrations', () => {
    expect(ignoreList()).not.toContain('migrations')
    expect(tracked('migrations')).toContain('migrations/1728245278417_users-table-migration.sql')
    expect(tracked('migrations').length).toBeGreaterThanOrEqual(7)
  })

  it('does not track a real .env file', () => {
    expect(tracked('.env')).toEqual([])
    expect(ignoreList()).toContain('.env')
  })

  it('has a .env.example with placeholder values only', () => {
    expect(tracked('.env.example')).toEqual(['.env.example'])
    const values = Object.fromEntries(
      fs.readFileSync('.env.example', 'utf8')
        .split(/\r?\n/)
        .filter((line) => line && !line.startsWith('#'))
        .map((line) => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)])
    )
    expect(Object.keys(values)).toEqual(expect.arrayContaining([
      'DATABASE_URL', 'ACCESS_TOKEN_SECRET', 'REFRESH_TOKEN_SECRET', 'CORS_ORIGINS', 'AUDIO_DIR'
    ]))
    expect(values.ACCESS_TOKEN_SECRET).toContain('change-me')
    expect(values.REFRESH_TOKEN_SECRET).toContain('change-me')
    expect(values.DATABASE_URL).toContain('change-me')
  })
})
