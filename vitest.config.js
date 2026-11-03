import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.js'],
    // This computer is low on memory, so run one test file at a time.
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
    silent: 'passed-only',
    testTimeout: 10000,
    hookTimeout: 30000,
    env: {
      ACCESS_TOKEN_SECRET: 'test-access-secret',
      REFRESH_TOKEN_SECRET: 'test-refresh-secret',
      CORS_ORIGINS: 'http://localhost:5173,http://localhost:5500'
    }
  }
})
