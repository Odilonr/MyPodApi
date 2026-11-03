import { syncCatalog } from '../services/catalogSync.js'

const { synced, failed, added } = await syncCatalog()
console.log(`Catalog: ${synced} shows up to date, ${added} new episodes, ${failed.length} feeds failed`)
process.exit(0)
