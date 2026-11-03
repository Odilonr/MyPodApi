import createError from 'http-errors'
import { getAllowedOrigins } from "./allowedOrigins.js";

export const corsOption = {
  credentials:true,
  origin: (origin, callback) => {
    if (!origin || getAllowedOrigins().includes(origin)) {
      callback(null, true)
    } else {
      callback(createError(403, 'Not allowed by CORS'))
    }
  },
  optionsSuccessStatus: 200
}
