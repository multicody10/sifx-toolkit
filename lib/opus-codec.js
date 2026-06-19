'use strict';

const OpusScript = require('opusscript');

const VALID_SAMPLE_RATES = [8000, 12000, 16000, 24000, 48000];

function assertSampleRate(sampleRate) {
  if (!VALID_SAMPLE_RATES.includes(sampleRate)) {
    throw new Error(`Opus requires sample rate in ${VALID_SAMPLE_RATES.join(', ')}, got ${sampleRate}`);
  }
}

/**
 * Encode interleaved PCM16 into a list of raw Opus packets at a fixed frame size.
 * If the input isn't an exact multiple of the frame size, the tail is padded by
 * wrapping around to the start of the clip (not silence) since this audio is a
 * loop, those padding samples get trimmed off again at decode time using
 * `totalFrames`, so the wrap-padding never reaches the speaker.
 *
 * @returns {{ packets: Buffer[], frameSamples: number, totalFrames: number }}
 */
function encodePcmToPackets(samples, channels, sampleRate, frameMs = 20) {
  assertSampleRate(sampleRate);
  const frameSamples = Math.round((sampleRate * frameMs) / 1000);
  const totalFrames = samples.length / channels;
  const numPackets = Math.ceil(totalFrames / frameSamples);
  const paddedFrames = numPackets * frameSamples;

  const padded = new Int16Array(paddedFrames * channels);
  padded.set(samples, 0);
  for (let f = totalFrames; f < paddedFrames; f++) {
    const srcFrame = f % totalFrames;
    for (let ch = 0; ch < channels; ch++) {
      padded[f * channels + ch] = samples[srcFrame * channels + ch];
    }
  }

  const encoder = new OpusScript(sampleRate, channels, OpusScript.Application.AUDIO);
  const packets = [];
  try {
    for (let f = 0; f < paddedFrames; f += frameSamples) {
      const slice = Buffer.from(padded.buffer, f * channels * 2, frameSamples * channels * 2);
      packets.push(Buffer.from(encoder.encode(slice, frameSamples)));
    }
  } finally {
    encoder.delete();
  }
  return { packets, frameSamples, totalFrames };
}

/** Decode a list of raw Opus packets back to interleaved PCM16, trimmed to totalFrames. */
function decodePacketsToPcm(packets, channels, sampleRate, totalFrames) {
  assertSampleRate(sampleRate);
  const decoder = new OpusScript(sampleRate, channels, OpusScript.Application.AUDIO);
  let out;
  try {
    const decoded = packets.map((p) => decoder.decode(p));
    const totalBytes = decoded.reduce((sum, b) => sum + b.length, 0);
    const full = Buffer.concat(decoded, totalBytes);
    const fullSamples = new Int16Array(full.buffer, full.byteOffset, full.length / 2);
    out = fullSamples.slice(0, totalFrames * channels);
  } finally {
    decoder.delete();
  }
  return out;
}

module.exports = { encodePcmToPackets, decodePacketsToPcm, VALID_SAMPLE_RATES };
