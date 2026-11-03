import { getAllowedOrigins } from "../config/allowedOrigins.js";

export const credentials = (req, res, next) => {
  const origin = req.headers.origin
  if (getAllowedOrigins().includes(origin)) {
    res.header('Access-Control-Allow-Credentials', 'true')
  }
  next()
}
