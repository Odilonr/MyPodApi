import { setUserAdmin } from '../queries/userQueries.js'

const username = process.argv[2]

if (!username) {
  console.error('Usage: npm run make-admin -- <username>')
  process.exit(1)
}

const updated = await setUserAdmin(username)
console.log(updated ? `${username} is now an admin` : `No user named ${username}`)
process.exit(updated ? 0 : 1)
