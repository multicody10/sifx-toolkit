'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { encodeAWEBP } = require('../lib/encode');
const { decodeAWEBP } = require('../lib/decode');
const { writeWav } = require('../lib/wav');
const riff = require('../lib/riff');

const TEST_DIR = __dirname;
const webpPath = path.join(TEST_DIR, 'test.webp');

assert.ok(fs.existsSync(webpPath), 'test/test.webp missing, run the Pillow snippet in README to regenerate it');
const webpBuffer = fs.readFileSync(webpPath);

// Synthesize a short ambient tone in-memory, no external audio file needed.
const sampleRate = 48000, channels = 1, durMs = 1200;
const n = Math.round((sampleRate * durMs) / 1000);
const samples = new Int16Array(n);
for (let i = 0; i < n; i++) {
  const t = i / sampleRate;
  const v = 0.25 * Math.sin(2 * Math.PI * 220 * t) + 0.15 * Math.sin(2 * Math.PI * 330 * t);
  samples[i] = Math.max(-32768, Math.min(32767, Math.round(v * 28000)));
}
const wavBuffer = writeWav({ sampleRate, channels, samples });

// Encode
const out = encodeAWEBP({ webpBuffer, wavBuffer, loopMode: 'loop', gainDb: -6, crossfadeMs: 25 });
assert.ok(out.length > webpBuffer.length, 'encoded file should be larger than the bare image');

// The defining property: it must still parse as a plain valid WebP RIFF container.
riff.assertRiff(out, 'WEBP');
const chunks = riff.listChunks(out);
assert.ok(chunks.some((c) => c.id === 'VP8 ' || c.id === 'VP8L'), 'image chunk must survive untouched');
assert.ok(chunks.some((c) => c.id === 'SAUD'), 'audio chunk must be present');

// Decode
const { webp, audio } = decodeAWEBP(out);
riff.assertRiff(webp, 'WEBP');
assert.ok(!riff.findChunk(webp, 'SAUD'), 'stripped image must not contain SAUD');
assert.deepStrictEqual(webp, webpBuffer, 'stripped image must be byte-identical to the original');

assert.ok(audio, 'audio metadata must be present');
assert.strictEqual(audio.loopMode, 'loop');
assert.strictEqual(audio.gainDb, -6);
assert.strictEqual(audio.sampleRate, sampleRate);
assert.strictEqual(audio.channels, channels);
assert.ok(audio.samples.length > 0, 'decoded PCM must be non-empty');

let rms = 0;
for (const s of audio.samples) rms += s * s;
rms = Math.sqrt(rms / audio.samples.length);
assert.ok(rms > 500, `decoded audio looks silent/corrupt (rms=${rms})`);

console.log('All round-trip assertions passed.');
console.log(`  original image: ${webpBuffer.length}B, encoded file: ${out.length}B, decoded frames: ${audio.samples.length / channels}`);
