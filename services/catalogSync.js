import { CATALOG_FEEDS } from '../config/catalogFeeds.js'
import { upsertCatalogShow } from '../queries/catalogQueries.js'
import { addNewEpisodes } from '../queries/feedQueries.js'
import { parseFeed } from './feedParser.js'
import { safeFetchText } from './safeFetch.js'

const EPISODES_PER_SHOW = 20
const MAX_FEED_BYTES = 15 * 1024 * 1024
const SYNC_EVERY_MS = 6 * 60 * 60 * 1000

// Reads feeds one at a time to keep memory low on a small server. A feed that is
// down only skips that show, which keeps whatever it already had.
async function syncCatalog (feeds = CATALOG_FEEDS) {
  const result = { synced: 0, failed: [], added: 0 }
  for (const feedUrl of feeds) {
    try {
      const { show, episodes } = parseFeed(await safeFetchText(feedUrl, { maxBytes: MAX_FEED_BYTES }))
      const showID = await upsertCatalogShow(feedUrl, show)
      result.added += await addNewEpisodes(showID, episodes.slice(0, EPISODES_PER_SHOW))
      result.synced += 1
    } catch (err) {
      result.failed.push(feedUrl)
    }
  }
  return result
}

function logResult ({ synced, failed, added }) {
  console.log(`Catalog: ${synced} shows up to date, ${added} new episodes, ${failed.length} feeds failed`)
  if (failed.length > 0) console.log(`Catalog feeds that failed: ${failed.join(', ')}`)
}

// Fills the catalog when the server starts, so the site has shows right away,
// then keeps it fresh. Set CATALOG_SYNC=off to turn this off.
function startCatalogSync () {
  if (process.env.CATALOG_SYNC === 'off') return

  let isRunning = false
  const run = async () => {
    if (isRunning) return
    isRunning = true
    try {
      logResult(await syncCatalog())
    } catch (err) {
      console.error(`Catalog sync failed: ${err.message}`)
    } finally {
      isRunning = false
    }
  }

  run()
  setInterval(run, SYNC_EVERY_MS).unref()
}

export { syncCatalog, startCatalogSync }
