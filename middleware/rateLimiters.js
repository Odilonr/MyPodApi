import { rateLimit } from 'express-rate-limit'

// Counts failed logins per IP address, to slow down password guessing. The
// count is kept in memory, so it resets on restart and is per server.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { status: 429, message: 'Too many failed logins, try again later', error: null }
})

// Each of these requests makes the server contact another website, so limit
// them per user. Otherwise the server could be used to flood other sites.
const feedLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  keyGenerator: (req) => req.user,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { status: 429, message: 'Too many feed requests, try again later', error: null }
})

export { loginLimiter, feedLimiter }
