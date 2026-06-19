'use strict';

const riff = require('./riff');
const opusCodec = require('./opus-codec');
const saud = require('./saud');

/**
 * @param {Buffer} buffer an SIFX file (a WebP with an appended SAUD chunk)
 * @returns {{ webp: Buffer, audio: null|{ loopMode: 'loop'|'once', gainDb: number,
 *   crossfadeMs: number, sampleRate: number, channels: number, samples: Int16Array } }}
 *   `webp` is always a clean, standalone, fully valid WebP (SAUD stripped out).
 *   `audio` is null if the file has no SAUD chunk, i.e. it's just a plain image.
 */
function decodeAWEBP(buffer) {
  riff.assertRiff(buffer, 'WEBP');
  const chunk = riff.findChunk(buffer, 'SAUD');
  const webp = riff.removeChunk(buffer, 'SAUD');

  if (!chunk) return { webp, audio: null };

  const payload = buffer.subarray(chunk.dataStart, chunk.dataStart + chunk.size);
  const s = saud.decodeSaud(payload);
  const samples = opusCodec.decodePacketsToPcm(s.packets, s.channels, s.sampleRate, s.totalFrames);

  return {
    webp,
    audio: {
      loopMode: s.loopMode === saud.LOOP_MODE.LOOP ? 'loop' : 'once',
      gainDb: s.gainCentibels / 100,
      crossfadeMs: s.crossfadeMs,
      sampleRate: s.sampleRate,
      channels: s.channels,
      samples,
    },
  };
}

module.exports = { decodeAWEBP };
