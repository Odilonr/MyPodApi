import createError from 'http-errors'

// Column names cannot be sent as SQL parameters, so only names from a fixed
// list may ever be placed into an UPDATE statement.
function getAllowedColumns (updates, allowedColumns) {
  const columns = Object.keys(updates)
  if (columns.length === 0) {
    throw createError(400, 'No fields to update')
  }
  if (!columns.every((column) => allowedColumns.includes(column))) {
    throw createError(400, 'Invalid field in update')
  }
  return columns
}

export { getAllowedColumns }
