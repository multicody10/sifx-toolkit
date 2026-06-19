'use strict';

const riff = require('./riff');
const wav = require('./wav');
const { crossfadeLoop } = require('./crossfade');
const opusCodec = require('./opus-codec');
const saud = require('./saud');

/**
 * @param {Object} opts
 * @param {Buffer} opts.webpBuffer  a valid WebP file
 * @param {Buffer} opts.wavBuffer   a 16-bit PCM WAV file at 8000/12000/16000/24000/48000 Hz
 * @param {'loop'|'once'} [opts.loopMode='loop']
 * @param {number} [opts.gainDb=0]        playback attenuation in dB, e.g. -6
 * @param {number} [opts.crossfadeMs=30]  loop-seam smoothing, ignored when loopMode is 'once'
 * @param {number} [opts.frameMs=20]      Opus frame duration: 2.5, 5, 10, 20, 40, or 60
 * @returns {Buffer} a file that is still a fully valid, renderable WebP, with an
 *   appended SAUD chunk that ordinary decoders ignore and aware players read.
 */
function encodeAWEBP(opts) {
  const { webpBuffer, wavBuffer, loopMode = 'loop', gainDb = 0, crossfadeMs = 30, frameMs = 20 } = opts;

  riff.assertRiff(webpBuffer, 'WEBP');
  const { sampleRate, channels, samples } = wav.readWav(wavBuffer);
  if (!opusCodec.VALID_SAMPLE_RATES.includes(sampleRate)) {
    throw new Error(
      `WAV is ${sampleRate}Hz; Opus needs one of ${opusCodec.VALID_SAMPLE_RATES.join(', ')}Hz. ` +
        `Resample first, e.g.: ffmpeg -i in.wav -ar 48000 out.wav`
    );
  }

  let pcm = samples;
  let crossfadeMsUsed = 0;
  if (loopMode === 'loop' && crossfadeMs > 0) {
    const result = crossfadeLoop(samples, channels, sampleRate, crossfadeMs);
    pcm = result.samples;
    crossfadeMsUsed = result.fadeMsUsed;
  }

  const { packets, frameSamples, totalFrames } = opusCodec.encodePcmToPackets(pcm, channels, sampleRate, frameMs);

  const payload = saud.encodeSaud({
    loopMode: loopMode === 'loop' ? saud.LOOP_MODE.LOOP : saud.LOOP_MODE.ONCE,
    gainCentibels: Math.round(gainDb * 100),
    crossfadeMs: crossfadeMsUsed,
    sampleRate,
    channels,
    frameSamples,
    totalFrames,
    packets,
  });

  return riff.appendChunk(webpBuffer, 'SAUD', payload);
}

module.exports = { encodeAWEBP };
