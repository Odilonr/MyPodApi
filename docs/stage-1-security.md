# Stage 1 security fixes

Each problem below has a test in `tests/`. The tests were run on the old code first, to prove each problem was real, and then the code was fixed.

| # | Problem | What the old code did in the test | Now | Test file |
|---|---|---|---|---|
| 1 | Any file could be read through `/episodes/audio?path=` | Returned a fake secret file with status 200 | 404. Audio is found by episode ID and must stay inside `AUDIO_DIR` | `audio.test.js` |
| 2 | Anyone could change the catalog | Writes with no login returned 201 | 401 with no login, 403 for a regular user | `accessControl.test.js` |
| 3 | SQL injection through JSON keys | A key containing SQL was accepted with 201 | 400. Only a fixed list of column names is allowed | `sqlInjection.test.js` |
| 4 | Open CORS | Any website was allowed, and requests with no `Origin` got a 500 | 403 unless listed in `CORS_ORIGINS` | `cors.test.js` |
| 5 | Wrong CORS header | The middleware never set `Access-Control-Allow-Credentials` | It sets the correct header | `cors.test.js` |
| 6 | Crash on a missing header | 500 | 401 | `verifyJWT.test.js` |
| 7 | Everyone was an admin | A new user got the `admin` role | A new user gets the `regular` role | `migrations.test.js` |
| 8 | Repo cleanup | Logs were tracked, migrations were missing, and there was no `.env.example` | All fixed | `repo.test.js` |

## Also fixed

- **Login limits:** after 10 failed logins from one address in 15 minutes, login answers 429.
- **Register checks:** the username, email and password are checked before anything is saved.
- **Node 26:** `jsonwebtoken` could not load on Node 26, so the server could not start. It was replaced with `jose`.
- **Token logging:** the playback handlers wrote login tokens to the console. They no longer do.
- **Hanging requests:** a bad episode ID made playback requests hang, because an error in an async callback was never caught. They now answer 404 or 400.
- **Missing table:** no migration created `episodes_progress`. One does now.

## Test runs

Tests ran one file at a time on PGlite, which is PostgreSQL running inside Node.

| Run | Code | Result |
|---|---|---|
| CORS tests only | Old code, Node 22 | 7 of 9 failed |
| All tests, after the CORS fix | Old code with only CORS fixed, Node 22 | 58 of 87 failed |
| All tests | Fixed code, Node 26 | 88 of 88 passed |

CORS was fixed first because bug 4 returned a 500 for every test request, which hid the other bugs.

## Known limits

- `npm audit` finds 0 problems in production packages. It reports 3 moderate warnings in `node-pg-migrate`, a tool used only to run migrations. npm's only fix is to downgrade it.
- Episode audio stays public, like the rest of the catalog, because an `<audio>` tag cannot send a login header.
- The login limit is kept in memory, so it resets on restart and does not work across several servers.
- Refresh tokens are stored as plain text in the database, and they are not replaced after each use.
- Login answers faster for an unknown username, and register says when a username is taken. Both can reveal which usernames exist.
