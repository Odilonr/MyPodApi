import createError from 'http-errors'
import { getLayoutSections, saveLayoutSections } from '../queries/layoutQueries.js'
import { SECTION_TYPES, layoutSchema, defaultSection } from '../validators/layoutValidators.js'

async function getLayoutController (req, res) {
  const saved = await getLayoutSections(req.user)
  // A section type added after this user saved goes at the end.
  const savedTypes = new Set(saved.map((section) => section.type))
  const missing = SECTION_TYPES.filter((type) => !savedTypes.has(type)).map(defaultSection)
  res.json({ sections: [...saved, ...missing], isCustom: saved.length > 0 })
}

async function saveLayoutController (req, res) {
  const layout = layoutSchema.safeParse(req.body)
  if (!layout.success) {
    throw createError(400, 'Invalid layout')
  }
  await saveLayoutSections(req.user, layout.data.sections)
  res.json({ sections: layout.data.sections, isCustom: true })
}

export { getLayoutController, saveLayoutController }
