import fs from 'fs'
import path from 'path'
import { addShow, getShowByName } from '../queries/showQueries.js'
import { addEpisode, getEpByTitleShowId } from '../queries/episodeQueries.js'

// Made-up shows for trying the app. Real shows only appear when a user imports
// their public feed. The audio is a generated tone, not recorded speech.
const SAMPLE_SHOWS = [
  {
    name: 'Sample: Night Shift Notes',
    studio: 'MyPod sample data',
    host_name: 'Sample host',
    show_type: 'Stories',
    release_schedule: 'Weekly',
    tone: 196,
    episodes: ['The 3 a.m. bus', 'Coffee from a machine', 'The last call of the night']
  },
  {
    name: 'Sample: The Slow Kitchen',
    studio: 'MyPod sample data',
    host_name: 'Sample host',
    show_type: 'Food',
    release_schedule: 'Every two weeks',
    tone: 247,
    episodes: ['Bread takes all day', 'A soup for cold rooms', 'Why onions need patience']
  },
  {
    name: 'Sample: Small Maps',
    studio: 'MyPod sample data',
    host_name: 'Sample host',
    show_type: 'Travel',
    release_schedule: 'Monthly',
    tone: 294,
    episodes: ['A town with one road', 'Walking the old rail line', 'The island you can cross in a day']
  },
  {
    name: 'Sample: Signal Garden',
    studio: 'MyPod sample data',
    host_name: 'Sample host',
    show_type: 'Science',
    release_schedule: 'Weekly',
    tone: 349,
    episodes: ['How radio waves travel', 'Plants that keep time', 'Listening to the weather']
  }
]

const SAMPLE_RATE = 8000
const VOLUME = 18

// Builds a small mono 8-bit WAV file holding a quiet tone that fades in and out.
function createToneWav (frequency, seconds) {
  const sampleCount = SAMPLE_RATE * seconds
  const wav = Buffer.alloc(44 + sampleCount)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + sampleCount, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(SAMPLE_RATE, 24)
  wav.writeUInt32LE(SAMPLE_RATE, 28)
  wav.writeUInt16LE(1, 32)
  wav.writeUInt16LE(8, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(sampleCount, 40)
  for (let i = 0; i < sampleCount; i++) {
    const time = i / SAMPLE_RATE
    const fade = Math.min(1, time, seconds - time)
    wav[44 + i] = Math.round(128 + VOLUME * fade * Math.sin(2 * Math.PI * frequency * time))
  }
  return wav
}

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

async function seedSampleData (audioDir) {
  for (const sample of SAMPLE_SHOWS) {
    if (!(await getShowByName(sample.name))) {
      await addShow({
        name: sample.name,
        description: `A made-up sample show for trying MyPod. It is not a real podcast, and its audio is a generated tone. This one is about ${sample.show_type.toLowerCase()}.`,
        profile_img_link: 'generated',
        release_schedule: sample.release_schedule,
        studio: sample.studio,
        host_name: sample.host_name,
        show_type: sample.show_type
      })
    }
    const show = await getShowByName(sample.name)
    const showDir = path.join(audioDir, 'sample', slug(sample.name))
    fs.mkdirSync(showDir, { recursive: true })

    for (const [index, title] of sample.episodes.entries()) {
      const fileName = `${slug(title)}.wav`
      const seconds = 60 + index * 30
      fs.writeFileSync(path.join(showDir, fileName), createToneWav(sample.tone + index * 20, seconds))
      if (!(await getEpByTitleShowId(title, show.id))) {
        const dateAdded = new Date(Date.now() - (index + 1) * SAMPLE_SHOWS.indexOf(sample) * 86400000 - index * 3600000)
        await addEpisode({
          title,
          description: `Sample episode from ${sample.name.replace('Sample: ', '')}. The audio is a generated tone.`,
          audio_link: `audios/sample/${slug(sample.name)}/${fileName}`,
          date_added: dateAdded.toISOString(),
          duration: seconds,
          show_id: show.id
        })
      }
    }
  }
}

export { seedSampleData }
