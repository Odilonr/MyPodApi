import app from './app.js'
import { startCatalogSync } from './services/catalogSync.js'

const PORT = process.env.PORT || 3500

app.listen(PORT, () => {
  console.log(`Server is running on port: ${PORT}`)
  startCatalogSync()
})
