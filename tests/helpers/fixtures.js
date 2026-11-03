import bcrypt from 'bcrypt'
import { signToken } from './tokens.js'
import { v4 as uuidv4 } from 'uuid'
import { db } from './db.js'

export async function insertUser({ username = 'listener', password = 'correct-horse', isAdmin = false } = {}) {
  const id = uuidv4()
  await db.query(
    `INSERT INTO users(id, created_at, updated_at, username, password, email, is_admin)
     VALUES($1, now(), now(), $2, $3, $4, $5)`,
    [id, username, await bcrypt.hash(password, 4), `${username}@example.com`, isAdmin]
  )
  return { id, username, password }
}

export async function insertShow(overrides = {}) {
  const show = {
    id: uuidv4(),
    name: `Sample Show ${uuidv4()}`,
    description: 'Sample description',
    profile_img_link: 'sample.png',
    release_schedule: 'Weekly',
    studio: 'Sample Studio',
    host_name: 'Sample Host',
    show_type: 'Sample',
    ...overrides
  }
  await db.query(
    `INSERT INTO shows(id, name, description, profile_img_link, release_schedule, studio, host_name, show_type, date_added)
     VALUES($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [show.id, show.name, show.description, show.profile_img_link, show.release_schedule, show.studio, show.host_name, show.show_type]
  )
  return show
}

export async function insertEpisode(showId, overrides = {}) {
  const episode = {
    id: uuidv4(),
    title: `Sample Episode ${uuidv4()}`,
    description: 'Sample description',
    audio_link: 'audios/sample/episode.mp3',
    duration: 60,
    ...overrides
  }
  await db.query(
    `INSERT INTO episodes(id, title, description, audio_link, date_added, date_updated, duration, show_id)
     VALUES($1, $2, $3, $4, now(), now(), $5, $6)`,
    [episode.id, episode.title, episode.description, episode.audio_link, episode.duration, showId]
  )
  return episode
}

export function accessToken(user, role = 'regular') {
  return signToken({ userID: user.id, role }, process.env.ACCESS_TOKEN_SECRET)
}
