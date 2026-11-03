import { z } from 'zod'

// To add a section type, add it here and in the frontend's section list.
const SECTION_TYPES = ['recent', 'start_here', 'latest', 'shows', 'favorites', 'playlists', 'topics']

const sectionSchema = z.strictObject({
  type: z.enum(SECTION_TYPES),
  visible: z.boolean(),
  size: z.enum(['small', 'large']),
  hiddenItems: z.array(z.string().min(1).max(100)).max(200)
})

const layoutSchema = z.strictObject({
  sections: z.array(sectionSchema)
    .length(SECTION_TYPES.length)
    .refine((sections) => new Set(sections.map((section) => section.type)).size === SECTION_TYPES.length, 'Each section must appear once')
})

const defaultSection = (type) => ({ type, visible: true, size: 'large', hiddenItems: [] })

export { SECTION_TYPES, layoutSchema, defaultSection }
