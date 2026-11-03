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

export { loginLimiter }
