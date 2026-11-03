import { describe, it, expect } from 'vitest'
import { parseFeed, FeedParseError } from '../services/feedParser.js'

const feed = (channel) => `<?xml version="1.0"?>
<rss version="2.0" xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd"><channel>${channel}</channel></rss>`

const item = (extra = '') => `<item>
  <title>Episode one</title>
  <guid>ep-1</guid>
  <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
  <enclosure url="https://cdn.example.com/one.mp3" type="audio/mpeg" length="100" />
  ${extra}
</item>`

describe('parseFeed', () => {
  it('reads the show and its episodes', () => {
    const result = parseFeed(feed(`
      <title>A Real Show</title>
      <description>About things</description>
      <link>https://example.com</link>
      <itunes:author>The Host</itunes:author>
      <itunes:image href="https://example.com/art.png" />
      <itunes:category text="Science" />
      ${item('<description>First one</description><itunes:duration>01:02:03</itunes:duration>')}
    `))
    expect(result.show).toEqual({
      name: 'A Real Show',
      description: 'About things',
      author: 'The Host',
      image: 'https://example.com/art.png',
      link: 'https://example.com/',
      category: 'Science'
    })
    expect(result.episodes).toEqual([expect.objectContaining({
      externalId: 'ep-1',
      title: 'Episode one',
      description: 'First one',
      audioUrl: 'https://cdn.example.com/one.mp3',
      duration: 3723
    })])
    expect(result.episodes[0].publishedAt.toISOString()).toBe('2026-11-02T10:00:00.000Z')
  })

  it.each([
    ['seconds', '125', 125],
    ['minutes and seconds', '02:05', 125],
    ['nonsense', 'soon', null]
  ])('reads a duration in %s', (_, text, expected) => {
    const { episodes } = parseFeed(feed(`<title>S</title>${item(`<itunes:duration>${text}</itunes:duration>`)}`))
    expect(episodes[0].duration).toBe(expected)
  })

  it('removes HTML and scripts from text', () => {
    const { show, episodes } = parseFeed(feed(`
      <title><![CDATA[<script>alert(1)</script>Safe <b>Title</b>]]></title>
      <description><![CDATA[<img src=x onerror=alert(1)><p>Hello &amp; welcome</p>]]></description>
      <item>
        <title><![CDATA[<a href="javascript:alert(1)">Click</a>]]></title>
        <enclosure url="https://cdn.example.com/one.mp3" type="audio/mpeg" />
        <description><![CDATA[<style>p{}</style><iframe src="https://evil.example"></iframe>Text]]></description>
      </item>
    `))
    expect(show.name).toBe('Safe Title')
    expect(show.description).toBe('Hello & welcome')
    expect(episodes[0].title).toBe('Click')
    expect(episodes[0].description).toBe('Text')
  })

  it.each([
    ['a JavaScript audio link', 'javascript:alert(1)'],
    ['a file audio link', 'file:///etc/passwd'],
    ['a data audio link', 'data:audio/mp3;base64,AAAA'],
    ['text that is not a link', 'nothing']
  ])('skips an episode with %s', (_, audio) => {
    const { episodes } = parseFeed(feed(`<title>S</title>
      <item><title>Bad</title><enclosure url="${audio}" /></item>${item()}`))
    expect(episodes.map((episode) => episode.title)).toEqual(['Episode one'])
  })

  it('marks an audio episode as audio', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>${item()}`))
    expect(episodes[0].mediaType).toBe('audio')
  })

  it.each([
    ['a video type', 'https://cdn.example.com/one.mp4', 'video/mp4'],
    ['another video type', 'https://cdn.example.com/one', 'video/x-m4v'],
    ['a video file with no type', 'https://cdn.example.com/one.mp4?token=1', ''],
    ['a generic type on a video file', 'https://cdn.example.com/one.m4v', 'application/octet-stream']
  ])('keeps a video episode with %s', (_, url, type) => {
    const { episodes } = parseFeed(feed(`<title>S</title>
      <item><title>Video</title><enclosure url="${url}" type="${type}" /></item>`))
    expect(episodes).toEqual([expect.objectContaining({ title: 'Video', audioUrl: url, mediaType: 'video' })])
  })

  it('accepts a feed that only has video episodes', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>
      <item><title>Long video</title><enclosure url="https://cdn.example.com/one.mp4" type="video/mp4" />
      <itunes:duration>01:00:00</itunes:duration></item>`))
    expect(episodes[0].duration).toBe(3600)
  })

  it('skips an enclosure that is neither audio nor video', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>
      <item><title>PDF</title><enclosure url="https://cdn.example.com/notes.pdf" type="application/pdf" /></item>${item()}`))
    expect(episodes.map((episode) => episode.title)).toEqual(['Episode one'])
  })

  it('skips an episode with no audio', () => {
    const { episodes } = parseFeed(feed(`<title>S</title><item><title>Text only</title></item>${item()}`))
    expect(episodes).toHaveLength(1)
  })

  it('ignores image and website links that are not web links', () => {
    const { show } = parseFeed(feed(`<title>S</title>
      <link>javascript:alert(1)</link><itunes:image href="javascript:alert(1)" />${item()}`))
    expect(show.image).toBeNull()
    expect(show.link).toBeNull()
  })

  it('uses the audio link when an episode has no ID', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>
      <item><title>No guid</title><enclosure url="https://cdn.example.com/two.mp3" /></item>`))
    expect(episodes[0].externalId).toBe('https://cdn.example.com/two.mp3')
  })

  it('keeps only one copy of a repeated episode ID', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>${item()}${item()}`))
    expect(episodes).toHaveLength(1)
  })

  it('keeps a limited number of episodes', () => {
    const items = Array.from({ length: 400 }, (_, index) => `<item><title>E${index}</title><guid>${index}</guid><enclosure url="https://cdn.example.com/${index}.mp3" /></item>`).join('')
    expect(parseFeed(feed(`<title>S</title>${items}`)).episodes).toHaveLength(300)
  })

  it('shortens very long text', () => {
    const { show } = parseFeed(feed(`<title>${'x'.repeat(1000)}</title><description>${'y'.repeat(20000)}</description>${item()}`))
    expect(show.name.length).toBeLessThanOrEqual(200)
    expect(show.description.length).toBeLessThanOrEqual(5000)
  })

  it('handles a bad date', () => {
    const { episodes } = parseFeed(feed(`<title>S</title>${item().replace('Mon, 02 Nov 2026 10:00:00 GMT', 'yesterday-ish')}`))
    expect(episodes[0].publishedAt).toBeInstanceOf(Date)
    expect(Number.isNaN(episodes[0].publishedAt.getTime())).toBe(false)
  })

  it.each([
    ['custom entities, which can read files or use huge memory', `<?xml version="1.0"?><!DOCTYPE rss [<!ENTITY xxe SYSTEM "file:///etc/passwd">]><rss><channel><title>&xxe;</title></channel></rss>`],
    ['an entity bomb', `<!DOCTYPE lolz [<!ENTITY a "aaaa"><!ENTITY b "&a;&a;&a;">]><rss><channel><title>&b;</title></channel></rss>`],
    ['a page that is not a feed', '<html><body>Hello</body></html>'],
    ['plain text', 'hello'],
    ['a feed with no title', feed(item())],
    ['a feed with no playable episodes', feed('<title>S</title><item><title>Text</title></item>')]
  ])('refuses %s', (_, xml) => {
    expect(() => parseFeed(xml)).toThrow(FeedParseError)
  })
})
