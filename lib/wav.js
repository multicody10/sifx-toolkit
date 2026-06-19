'use strict';

const riff = require('./riff');

/** Read a PCM16 WAV file buffer. Returns { sampleRate, channels, samples: Int16Array }. */
function readWav(buffer) {
  riff.assertRiff(buffer, 'WAVE');
  const fmtChunk = riff.findChunk(buffer, 'fmt ');
  const dataChunk = riff.findChunk(buffer, 'data');
  if (!fmtChunk || !dataChunk) throw new Error('WAV missing fmt or data chunk');

  const audioFormat = buffer.readUInt16LE(fmtChunk.dataStart);
  const channels = buffer.readUInt16LE(fmtChunk.dataStart + 2);
  const sampleRate = buffer.readUInt32LE(fmtChunk.dataStart + 4);
  const bitsPerSample = buffer.readUInt16LE(fmtChunk.dataStart + 14);

  if (audioFormat !== 1) throw new Error('Only uncompressed PCM WAV is supported (audioFormat=1)');
  if (bitsPerSample !== 16) throw new Error('Only 16-bit PCM WAV is supported');

  const dataBuf = buffer.subarray(dataChunk.dataStart, dataChunk.dataStart + dataChunk.size);
  const samples = new Int16Array(dataBuf.length / 2);
  for (let i = 0; i < samples.length; i++) samples[i] = dataBuf.readInt16LE(i * 2);

  return { sampleRate, channels, samples };
}

/** Write a PCM16 WAV file buffer from { sampleRate, channels, samples: Int16Array }. */
function writeWav({ sampleRate, channels, samples }) {
  const bitsPerSample = 16;
  const blockAlign = channels * (bitsPerSample / 8);
  const dataPayload = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i++) dataPayload.writeInt16LE(samples[i], i * 2);

  const fmtPayload = Buffer.alloc(16);
  fmtPayload.writeUInt16LE(1, 0); // PCM
  fmtPayload.writeUInt16LE(channels, 2);
  fmtPayload.writeUInt32LE(sampleRate, 4);
  fmtPayload.writeUInt32LE(sampleRate * blockAlign, 8); // byte rate
  fmtPayload.writeUInt16LE(blockAlign, 12);
  fmtPayload.writeUInt16LE(bitsPerSample, 14);

  return riff.buildRiff('WAVE', [
    { id: 'fmt ', payload: fmtPayload },
    { id: 'data', payload: dataPayload },
  ]);
}

module.exports = { readWav, writeWav };
