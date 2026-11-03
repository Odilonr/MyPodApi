function requireAdmin (req, res, next) {
  if (req.role !== 'admin') {
    return res.sendStatus(403)
  }
  next()
}

export { requireAdmin }
