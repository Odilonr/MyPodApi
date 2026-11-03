import { XMLParser } from 'fast-xml-parser'
import { decode } from 'he'
import sanitizeHtml from 'sanitize-html'

const MAX_EPISODES = 300
const MAX_NAME = 200
const MAX_TITLE = 300
const MAX_DESCRIPTION = 5000
const MAX_LINK = 2000
const MAX_INTEGER = 2147483647
const DEFAULT_CATEGORY = 'Uncategorized'
const VIDEO_FILE = /\.(mp4|m4v|mov|webm)$/i

class FeedParseError extends Error {
  constructor (message = 'This address is not a podcast feed') {
    super(message)
    this.status = 422
  }
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  parseTagValue: false,
  parseAttributeValue: false,
  isArray: (name) => name === 'item'
})

const first = (value) => (Array.isArray(value) ? value[0] : value)

function rawText (node) {
  const value = first(node)
  if (value === undefined || value === null) return ''
  return typeof value === 'object' ? String(value['#text'] ?? '') : String(value)
}

// Turns feed text into plain text. HTML tags and scripts are removed here, and
// React also escapes the text when it is shown, so this is two layers of defense.
function cleanText (text, maxLength) {
  const spaced = String(text).replace(/<(br|\/p|\/div|\/li)[^>]*>/gi, ' ')
  const stripped = sanitizeHtml(spaced, {
    allowedTags: [],
    allowedAttributes: {},
    nonTextTags: ['script', 'style', 'textarea', 'option', 'noscript', 'iframe']
  })
  return decode(stripped).replace(/\s+/g, ' ').trim().slice(0, maxLength)
}

function webLink (value) {
  if (typeof value !== 'string' || value.length > MAX_LINK) return null
  try {
    const url = new URL(value.trim())
    return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch {
    return null
  }
}

function parseDuration (value) {
  const text = rawText(value).trim()
  if (!/^\d+(:\d{1,2}){0,2}(\.\d+)?$/.test(text)) return null
  const seconds = text.split(':').reduce((total, part) => total * 60 + Number(part), 0)
  return seconds > 0 && seconds <= MAX_INTEGER ? Math.floor(seconds) : null
}

function parseDate (value) {
  const date = new Date(rawText(value))
  return Number.isNaN(date.getTime()) ? new Date() : date
}

// Many feeds give a generic type or none, so the file extension decides then.
function parseMediaType (type, url) {
  if (type.startsWith('video/')) return 'video'
  if (type.startsWith('audio/')) return 'audio'
  const isGeneric = type === '' || type === 'application/octet-stream' || type === 'binary/octet-stream'
  if (!isGeneric) return null
  return VIDEO_FILE.test(new URL(url).pathname) ? 'video' : 'audio'
}

function parseEpisode (item) {
  const enclosure = first(item.enclosure)
  const audioUrl = webLink(enclosure?.['@_url'])
  if (!audioUrl) return null
  const mediaType = parseMediaType(String(enclosure['@_type'] ?? '').toLowerCase().trim(), audioUrl)
  if (!mediaType) return null
  return {
    mediaType,
    externalId: rawText(item.guid).trim().slice(0, MAX_LINK) || audioUrl,
    title: cleanText(rawText(item.title), MAX_TITLE) || 'Untitled episode',
    description: cleanText(rawText(item.description) || rawText(item['itunes:summary']), MAX_DESCRIPTION),
    audioUrl,
    duration: parseDuration(item['itunes:duration']),
    publishedAt: parseDate(item.pubDate)
  }
}

function parseFeed (xml) {
  // Custom entities can read server files or use huge memory (XXE and entity
  // bombs). Real podcast feeds do not need them, so refuse the whole document.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml)) throw new FeedParseError()

  let document
  try {
    document = parser.parse(xml)
  } catch {
    throw new FeedParseError()
  }

  const channel = first(document?.rss?.channel)
  if (!channel || typeof channel !== 'object') throw new FeedParseError()

  const name = cleanText(rawText(channel.title), MAX_NAME)
  if (!name) throw new FeedParseError()

  const seen = new Set()
  const episodes = (channel.item ?? [])
    .map(parseEpisode)
    .filter((episode) => {
      if (!episode || seen.has(episode.externalId)) return false
      seen.add(episode.externalId)
      return true
    })
    .sort((a, b) => b.publishedAt - a.publishedAt)
    .slice(0, MAX_EPISODES)
  if (episodes.length === 0) throw new FeedParseError('This feed has no episodes that can be played')

  return {
    show: {
      name,
      description: cleanText(rawText(channel.description) || rawText(channel['itunes:summary']), MAX_DESCRIPTION),
      author: cleanText(rawText(channel['itunes:author']), MAX_NAME) || null,
      image: webLink(first(channel['itunes:image'])?.['@_href']) ?? webLink(rawText(first(channel.image)?.url)),
      link: webLink(rawText(channel.link)),
      category: cleanText(first(channel['itunes:category'])?.['@_text'] ?? '', 60) || DEFAULT_CATEGORY
    },
    episodes
  }
}

export { parseFeed, cleanText, FeedParseError }
