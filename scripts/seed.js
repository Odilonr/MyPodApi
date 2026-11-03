import path from 'path'
import { fileURLToPath } from 'url'
import { seedSampleData } from './sampleData.js'

const apiRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')

await seedSampleData(path.resolve(apiRoot, process.env.AUDIO_DIR || 'audios'))
console.log('Sample shows and episodes are ready')
process.exit(0)
