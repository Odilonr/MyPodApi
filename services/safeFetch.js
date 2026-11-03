import dns from 'dns'
import http from 'http'
import https from 'https'
import net from 'net'
import zlib from 'zlib'

const MAX_BYTES = 5 * 1024 * 1024
const TIMEOUT_MS = 10000
const MAX_REDIRECTS = 5
const REDIRECT_CODES = [301, 302, 303, 307, 308]

class FeedFetchError extends Error {
  constructor (message, status) {
    super(message)
    this.status = status
  }
}

const refused = () => new FeedFetchError('This address cannot be used', 400)
const unreachable = () => new FeedFetchError('The feed could not be reached', 502)

// Addresses that are not on the public internet. Without this list, a user
// could make the server read its own private services, such as the cloud
// metadata address 169.254.169.254. This attack is called SSRF.
const privateAddresses = new net.BlockList()
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4]
]) {
  privateAddresses.addSubnet(address, prefix, 'ipv4')
}
for (const [address, prefix] of [
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64],
  ['2001:db8::', 32], ['fc00::', 7], ['fe80::', 10], ['ff00::', 8]
]) {
  privateAddresses.addSubnet(address, prefix, 'ipv6')
}

function isBlockedAddress (address) {
  return privateAddresses.check(address, net.isIPv6(address) ? 'ipv6' : 'ipv4')
}

function parseAddress (text, allowedPorts) {
  let url
  try {
    url = new URL(text)
  } catch {
    throw refused()
  }
  const allowedPort = url.port === '' || allowedPorts.includes(url.port)
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || !allowedPort) {
    throw refused()
  }
  return url
}

// Checks the address at the moment of connecting. Checking earlier would let a
// site answer with a public address first and a private one for the real request.
function checkedLookup (lookup, isBlocked) {
  return (hostname, options, callback) => {
    lookup(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err)
      if (addresses.length === 0 || addresses.some(({ address }) => isBlocked(address))) {
        return callback(refused())
      }
      return options.all
        ? callback(null, addresses)
        : callback(null, addresses[0].address, addresses[0].family)
    })
  }
}

function sendRequest (url, { lookup, isBlocked, signal }) {
  return new Promise((resolve, reject) => {
    const client = url.protocol === 'https:' ? https : http
    const request = client.request(url, {
      method: 'GET',
      agent: false,
      lookup: checkedLookup(lookup, isBlocked),
      signal,
      headers: {
        'User-Agent': 'MyPod feed reader',
        Accept: 'application/rss+xml, application/xml, text/xml, */*',
        'Accept-Encoding': 'gzip'
      }
    }, (response) => resolve({ request, response }))
    request.on('error', reject)
    request.end()
  })
}

async function readBody (response, maxBytes) {
  const encoding = response.headers['content-encoding']
  if (encoding && encoding !== 'gzip') throw unreachable()

  const body = encoding === 'gzip' ? zlib.createGunzip() : response
  if (encoding === 'gzip') {
    response.on('error', (err) => body.destroy(err))
    response.pipe(body)
  }

  // Counts the unpacked bytes, so a small compressed file cannot grow too large.
  const chunks = []
  let total = 0
  for await (const chunk of body) {
    total += chunk.length
    if (total > maxBytes) throw new FeedFetchError('This feed is too large', 422)
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

// Reads a web address given by a user. The options exist so that tests can run
// against a local server. Production code uses the defaults.
async function safeFetchText (text, {
  allowedPorts = ['80', '443'],
  isBlocked = isBlockedAddress,
  lookup = dns.lookup,
  maxBytes = MAX_BYTES,
  timeoutMs = TIMEOUT_MS
} = {}) {
  const signal = AbortSignal.timeout(timeoutMs)
  let url = parseAddress(text, allowedPorts)

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    // A literal address skips DNS, so the lookup check would not see it.
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    if (net.isIP(hostname) && isBlocked(hostname)) throw refused()

    let exchange
    try {
      exchange = await sendRequest(url, { lookup, isBlocked, signal })
    } catch (err) {
      throw err instanceof FeedFetchError ? err : unreachable()
    }
    const { request, response } = exchange

    try {
      if (REDIRECT_CODES.includes(response.statusCode)) {
        const location = response.headers.location
        if (!location) throw unreachable()
        // Every redirect goes through the same checks again.
        url = parseAddress(new URL(location, url).href, allowedPorts)
        continue
      }
      if (response.statusCode < 200 || response.statusCode >= 300) throw unreachable()
      return await readBody(response, maxBytes)
    } catch (err) {
      throw err instanceof FeedFetchError ? err : unreachable()
    } finally {
      request.destroy()
    }
  }
  throw unreachable()
}

export { safeFetchText, isBlockedAddress, FeedFetchError }
