import { poolQuery } from '../config/dbConn.js'
import { format } from 'date-fns'
import { v4 as uuidv4 } from 'uuid'

// A catalog show has no owner. The feed link identifies it, so a new sync
// updates the same show instead of making a copy.
async function upsertCatalogShow (feedUrl, show) {
  const author = show.author ?? 'Unknown'
  const result = await poolQuery(
    `INSERT INTO shows(id, name, description, profile_img_link, release_schedule, studio, host_name, show_type, date_added, feed_url, source_link)
     VALUES($1, $2, $3, $4, 'From RSS feed', $5, $6, $7, $8, $9, $10)
     ON CONFLICT (feed_url) WHERE owner_id IS NULL AND feed_url IS NOT NULL
     DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, profile_img_link = EXCLUDED.profile_img_link,
       studio = EXCLUDED.studio, host_name = EXCLUDED.host_name, show_type = EXCLUDED.show_type, source_link = EXCLUDED.source_link
     RETURNING id`,
    [uuidv4(), show.name, show.description, show.image ?? 'generated', author, author, show.category,
      format(new Date(), 'yyyy-MM-dd HH:mm:ss'), feedUrl, show.link]
  )
  return result.rows[0].id
}

export { upsertCatalogShow }
