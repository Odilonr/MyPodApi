// Small real audio files, built in memory, so tests need no sample files.

export function wavFile (seconds = 2) {
  const sampleRate = 4000
  const samples = sampleRate * seconds
  const wav = Buffer.alloc(44 + samples, 128)
  wav.write('RIFF', 0)
  wav.writeUInt32LE(36 + samples, 4)
  wav.write('WAVEfmt ', 8)
  wav.writeUInt32LE(16, 16)
  wav.writeUInt16LE(1, 20)
  wav.writeUInt16LE(1, 22)
  wav.writeUInt32LE(sampleRate, 24)
  wav.writeUInt32LE(sampleRate, 28)
  wav.writeUInt16LE(1, 32)
  wav.writeUInt16LE(8, 34)
  wav.write('data', 36)
  wav.writeUInt32LE(samples, 40)
  return wav
}

// An MP3 with an ID3 tag, followed by silent MPEG audio frames.
export function mp3File (tags = {}) {
  const frames = Object.entries(tags).map(([id, text]) => {
    const body = Buffer.concat([Buffer.from([3]), Buffer.from(text, 'utf8')])
    const header = Buffer.alloc(10)
    header.write(id, 0)
    // ID3 version 2.4 stores each frame size in 7-bit bytes.
    header[4] = (body.length >> 21) & 0x7f
    header[5] = (body.length >> 14) & 0x7f
    header[6] = (body.length >> 7) & 0x7f
    header[7] = body.length & 0x7f
    return Buffer.concat([header, body])
  })
  const tagBody = Buffer.concat(frames)
  const tagHeader = Buffer.from([
    0x49, 0x44, 0x33, 4, 0, 0,
    (tagBody.length >> 21) & 0x7f, (tagBody.length >> 14) & 0x7f, (tagBody.length >> 7) & 0x7f, tagBody.length & 0x7f
  ])
  // MPEG 1 Layer III, 128 kbps, 44.1 kHz: each frame is 417 bytes.
  const frame = Buffer.alloc(417)
  frame[0] = 0xff
  frame[1] = 0xfb
  frame[2] = 0x90
  frame[3] = 0x00
  const audio = Buffer.concat(Array(40).fill(frame))
  return Buffer.concat([tagHeader, tagBody, audio])
}
