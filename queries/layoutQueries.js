import { poolQuery, getClient } from '../config/dbConn.js'
import { v4 as uuidv4 } from 'uuid'

// The owner comes from the login token, and every query filters on it.
async function getLayoutSections (userID) {
  const queryText = `SELECT pod_sections.section_type AS type, pod_sections.visible, pod_sections.size, pod_sections.settings
                     FROM pod_sections
                     JOIN pods ON pod_sections.pod_id = pods.id
                     WHERE pods.user_id = $1
                     ORDER BY pod_sections.position`
  const result = await poolQuery(queryText, [userID])
  return result.rows.map(({ type, visible, size, settings }) => ({
    type,
    visible,
    size,
    hiddenItems: settings.hiddenItems ?? []
  }))
}

// Replaces the whole layout in one transaction, so a failure keeps the old one.
async function saveLayoutSections (userID, sections) {
  const client = await getClient()
  try {
    await client.query('BEGIN')
    const pod = await client.query(
      `INSERT INTO pods(id, user_id) VALUES($1, $2)
       ON CONFLICT (user_id) DO UPDATE SET updated_at = now()
       RETURNING id`,
      [uuidv4(), userID]
    )
    const podID = pod.rows[0].id
    await client.query('DELETE FROM pod_sections WHERE pod_id = $1', [podID])
    for (const [position, section] of sections.entries()) {
      await client.query(
        `INSERT INTO pod_sections(pod_id, section_type, position, visible, size, settings)
         VALUES($1, $2, $3, $4, $5, $6)`,
        [podID, section.type, position, section.visible, section.size, JSON.stringify({ hiddenItems: section.hiddenItems })]
      )
    }
    await client.query('COMMIT')
  } catch (e) {
    await client.query('ROLLBACK')
    throw e
  } finally {
    client.release()
  }
}

export { getLayoutSections, saveLayoutSections }
