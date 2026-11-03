import http from 'http'
import zlib from 'zlib'
import { afterAll, beforeAll, describe, it, expect } from 'vitest'
import { safeFetchText, isBlockedAddress, FeedFetchError } from '../services/safeFetch.js'

// The real checks block this test server, because it runs on 127.0.0.1. These
// options treat it as a public website, and keep every other check real.
let server
let port
let lastPath

const asPublic = (extra = {}) => ({
  allowedPorts: [String(port)],
  isBlocked: (address) => address !== '127.0.0.1' && isBlockedAddress(address),
  lookup: (hostname, options, callback) => {
    const address = hostname === 'public.test' ? '127.0.0.1' : hostname === 'rebind.test' ? '10.0.0.5' : null
    if (!address) return callback(new Error('not found'))
    return options.all ? callback(null, [{ address, family: 4 }]) : callback(null, address, 4)
  },
  ...extra
})

beforeAll(async () => {
  server = http.createServer((req, res) => {
    lastPath = req.url
    if (req.url === '/feed') return res.end('<rss>ok</rss>')
    if (req.url === '/gzip') {
      res.setHeader('Content-Encoding', 'gzip')
      return res.end(zlib.gzipSync('<rss>zipped</rss>'))
    }
    if (req.url === '/huge') return res.end(Buffer.alloc(2000, 'a'))
    if (req.url === '/zip-bomb') {
      res.setHeader('Content-Encoding', 'gzip')
      return res.end(zlib.gzipSync(Buffer.alloc(100000, 'a')))
    }
    if (req.url === '/slow') return undefined
    if (req.url === '/missing') { res.statusCode = 404; return res.end('no') }
    if (req.url === '/to-feed') { res.statusCode = 302; res.setHeader('Location', '/feed'); return res.end() }
    if (req.url === '/to-metadata') { res.statusCode = 302; res.setHeader('Location', 'http://169.254.169.254/latest/meta-data/'); return res.end() }
    if (req.url === '/to-private-name') { res.statusCode = 302; res.setHeader('Location', `http://rebind.test:${port}/feed`); return res.end() }
    if (req.url === '/to-file') { res.statusCode = 302; res.setHeader('Location', 'file:///etc/passwd'); return res.end() }
    if (req.url === '/loop') { res.statusCode = 302; res.setHeader('Location', '/loop'); return res.end() }
    res.statusCode = 500
    return res.end()
  })
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  port = server.address().port
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
})

const url = (path, host = 'public.test') => `http://${host}:${port}${path}`

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1', '127.1.2.3', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1',
    '169.254.169.254', '100.64.0.1', '0.0.0.0', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fe80::1', 'fc00::1', 'fd12:3456::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1'
  ])('blocks %s', (address) => {
    expect(isBlockedAddress(address)).toBe(true)
  })

  it.each(['8.8.8.8', '1.1.1.1', '151.101.1.1', '172.32.0.1', '2606:4700:4700::1111'])('allows %s', (address) => {
    expect(isBlockedAddress(address)).toBe(false)
  })
})

describe('safeFetchText with the real rules', () => {
  it.each([
    ['the local machine', 'http://127.0.0.1/feed'],
    ['the local machine by name', 'http://localhost/feed'],
    ['the cloud metadata address', 'http://169.254.169.254/latest/meta-data/'],
    ['a private network', 'http://192.168.1.1/feed'],
    ['IPv6 local', 'http://[::1]/feed'],
    ['a number form of 127.0.0.1', 'http://2130706433/feed'],
    ['a hex form of 127.0.0.1', 'http://0x7f.0.0.1/feed'],
    ['a short form of 127.0.0.1', 'http://127.1/feed'],
    ['a file path', 'file:///etc/passwd'],
    ['FTP', 'ftp://example.com/feed'],
    ['JavaScript', 'javascript:alert(1)'],
    ['a port that is not for websites', 'http://example.com:22/feed'],
    ['a username in the address', 'http://user:pass@example.com/feed'],
    ['text that is not an address', 'not a url']
  ])('refuses %s', async (_, address) => {
    await expect(safeFetchText(address)).rejects.toBeInstanceOf(FeedFetchError)
  })
})

describe('safeFetchText with a test server', () => {
  it('returns the page', async () => {
    await expect(safeFetchText(url('/feed'), asPublic())).resolves.toBe('<rss>ok</rss>')
  })

  it('reads a compressed page', async () => {
    await expect(safeFetchText(url('/gzip'), asPublic())).resolves.toBe('<rss>zipped</rss>')
  })

  it('follows a safe redirect', async () => {
    await expect(safeFetchText(url('/to-feed'), asPublic())).resolves.toBe('<rss>ok</rss>')
  })

  it('checks the address again after a redirect', async () => {
    await expect(safeFetchText(url('/to-metadata'), asPublic())).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('refuses a redirect to a name that points to a private address', async () => {
    lastPath = null
    await expect(safeFetchText(url('/to-private-name'), asPublic())).rejects.toBeInstanceOf(FeedFetchError)
    expect(lastPath).toBe('/to-private-name')
  })

  it('refuses a redirect to a file', async () => {
    await expect(safeFetchText(url('/to-file'), asPublic())).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('stops following endless redirects', async () => {
    await expect(safeFetchText(url('/loop'), asPublic())).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('stops at the size limit', async () => {
    await expect(safeFetchText(url('/huge'), asPublic({ maxBytes: 1000 }))).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('counts the unpacked size, so a small zip cannot grow too large', async () => {
    await expect(safeFetchText(url('/zip-bomb'), asPublic({ maxBytes: 1000 }))).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('stops at the time limit', async () => {
    await expect(safeFetchText(url('/slow'), asPublic({ timeoutMs: 100 }))).rejects.toBeInstanceOf(FeedFetchError)
  })

  it('reports an error page', async () => {
    await expect(safeFetchText(url('/missing'), asPublic())).rejects.toBeInstanceOf(FeedFetchError)
  })
})
