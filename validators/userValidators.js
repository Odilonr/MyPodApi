import { z } from 'zod'

// bcrypt ignores everything after 72 bytes, so a longer password would give a
// false sense of safety.
const BCRYPT_MAX_BYTES = 72

const registerSchema = z.object({
  username: z.string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[A-Za-z0-9_.-]+$/, 'Username can only use letters, numbers, _ . and -'),
  email: z.email('Enter a valid email').max(254),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .refine((password) => Buffer.byteLength(password) <= BCRYPT_MAX_BYTES, 'Password must be at most 72 bytes')
})

export { registerSchema }
