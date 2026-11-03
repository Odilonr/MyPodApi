# MyPod API

This is the REST API for MyPod, a podcast web app that I am building as a portfolio project. It uses Node.js, Express and PostgreSQL.

**This is a portfolio project. It has no real users, and it is not deployed yet.** The sample shows are made up, and their audio is a generated tone.

The React frontend is in a separate repo.

## What it does

- Serves the catalog of shows and episodes, and streams audio with seeking
- Registers and logs in users with short-lived access tokens and an httpOnly refresh cookie
- Saves each user's place in every episode
- Stores each user's favorites, recently listened episodes and playlists
- Stores each user's home page layout: section order, visibility, size and chosen items
- Imports public podcasts from RSS feeds into a user's private library
- Lets only admins change the catalog

## Run it

You need Node.js and PostgreSQL. This repo includes a Docker Compose file that starts PostgreSQL on localhost only.

```bash
npm install
cp .env.example .env        # then set your own secrets
docker compose up -d
npm run migrate up
npm run seed                # adds the labeled sample shows
npm run dev
```

The API runs on http://localhost:3500.

| Command | What it does |
|---|---|
| `npm test` | Runs the tests. They use PGlite, which is PostgreSQL running inside Node, so they need no database server. |
| `npm run migrate up` | Applies database migrations |
| `npm run seed` | Adds the sample shows and creates their audio files |
| `npm run make-admin -- <username>` | Makes a user an admin |

## Main routes

| Route | Login | What it does |
|---|---|---|
| `GET /shows`, `GET /shows/:id`, `GET /shows/:id/episodes` | No | Browse shows |
| `GET /episodes`, `GET /episodes/ep/:id`, `GET /episodes/:id/audio` | No | Browse episodes and stream audio |
| `POST`, `PUT`, `DELETE` on `/shows` and `/episodes` | Admin | Change the catalog |
| `POST /user/register`, `/auth`, `/refresh`, `/logout` | No | Accounts and sessions |
| `GET /episodes/:id/timestamp`, `POST /episodes/updatetime` | Yes | Saved place in an episode |
| `GET /me/recent` | Yes | Recently listened |
| `GET`, `PUT`, `DELETE` on `/me/favorites` | Yes | Favorites |
| `GET`, `POST`, `PUT`, `DELETE` on `/me/playlists` | Yes | Playlists |
| `GET`, `PUT` on `/me/layout` | Yes | Home page layout |
| `POST /me/feeds/preview` | Yes | Read a feed without saving it |
| `GET`, `POST`, `PATCH`, `DELETE` on `/me/feeds`, `POST /me/feeds/:id/refresh` | Yes | Imported shows |

## Security decisions

When I reviewed the old code, I found serious problems. I wrote a failing test for each one first, then fixed it. [docs/stage-1-security.md](docs/stage-1-security.md) lists each problem, the test and the result.

- **File access:** audio is found by episode ID, and the file must resolve inside the audio folder. This replaced a route that could read any file on the server.
- **Access control:** changing the catalog needs a login and an admin role. New accounts are never admins.
- **User data:** every playlist query includes the owner. If user B asks for user A's playlist, the answer is 404, so B cannot even learn that it exists.
- **Layouts:** the layout route has no ID in its URL, because the owner comes from the login token, so there is no ID to guess. Each save is validated against a fixed list of section types and replaces the old layout in one transaction, so a failed save keeps the old one.
- **Imported shows:** a show with an owner is private. Every catalog query filters on the owner, so guests, other users and admins all get a 404, even with the exact ID. The API never stores or republishes the audio, and the show keeps its original credit and link.
- **Fetching a user's link (SSRF):** the server only reads public `http` and `https` addresses on normal web ports. It checks the real address at the moment it connects, and again after every redirect, so a site can't send it to a private address such as the cloud metadata service. Requests have time and size limits, and the size limit counts unpacked bytes. Feed requests are also rate limited per user.
- **Feed content:** the parser refuses custom XML entities, which blocks XXE and entity bombs. Feed text is cleaned to plain text before saving, and React escapes it again when it is shown. Only `http` and `https` links are kept.
- **SQL:** values are sent as parameters, and column names come from a fixed list.
- **CORS:** only websites listed in `CORS_ORIGINS` can call the API with cookies.
- **Logins:** failed logins are rate limited, passwords are hashed with bcrypt, and register input is validated.
- **Secrets:** they stay in `.env`, which git ignores. `.env.example` has placeholder values only.

## Known limits

- Refresh tokens are stored as plain text in the database, and they are not replaced after each use.
- Login speed and the register error can reveal which usernames exist.
- The login limit is kept in memory, so it resets on restart and does not work across several servers.
- Episode audio is public, like the rest of the catalog.
- `npm audit` finds nothing in production packages, but it reports moderate warnings in `node-pg-migrate`, a tool used only to run migrations.

## What is not done yet

- **More of the build-your-own pod:** the home page layout is done. Next come more pages, cards with their own settings, notes, and collections that users fill themselves.
- **More ways to import:** RSS feeds work today. Next come uploaded audio files, with safe upload handling, then OPML files. Imported shows only get new episodes when the user asks, and single episodes can't be edited yet.
- **Deployment:** a low-cost cloud setup with HTTPS, backups and monitoring.
