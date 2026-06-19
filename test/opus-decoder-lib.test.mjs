// Validates the pure-WASM decoder (same one the player will use) against real
// packets produced by our encoder, runs under plain Node so it's actually
// exercised here rather than just read and trusted.
import { OpusDecoder } from 'opus-decoder';
import { createRequire } from 'module';
import fs from 'fs';

const require = createRequire(import.meta.url);
const riff = require('../lib/riff.js');
const saud = require('../lib/saud.js');

const buf = fs.readFileSync(new URL('./test_aw.webp', import.meta.url));
const chunk = riff.findChunk(buf, 'SAUD');
if (!chunk) throw new Error('no SAUD chunk found, run npm test first to regenerate test_aw.webp');

const payload = buf.subarray(chunk.dataStart, chunk.dataStart + chunk.size);
const s = saud.decodeSaud(payload);
console.log(`SAUD: ${s.sampleRate}Hz ${s.channels}ch, ${s.packets.length} packets, totalFrames=${s.totalFrames}`);

const decoder = new OpusDecoder({ sampleRate: s.sampleRate, channels: s.channels });
await decoder.ready;

const result = decoder.decodeFrames(s.packets.map((p) => new Uint8Array(p)));
console.log(`decoded: ${result.samplesDecoded} samples, sampleRate=${result.sampleRate}, errors=${result.errors.length}`);
if (result.errors.length) console.log(result.errors);

const ch0 = result.channelData[0].slice(0, s.totalFrames);
let rms = 0;
for (const v of ch0) rms += v * v;
rms = Math.sqrt(rms / ch0.length);
console.log(`trimmed to totalFrames, RMS=${rms.toFixed(4)} (Float32, so 0..1 scale)`);

if (result.errors.length > 0) { console.error('FAIL: decode errors'); process.exit(1); }
if (result.samplesDecoded < s.totalFrames) { console.error('FAIL: decoded fewer samples than totalFrames'); process.exit(1); }
if (rms < 0.01) { console.error('FAIL: decoded audio looks silent'); process.exit(1); }
console.log('PASS: opus-decoder (the same lib the browser player now uses) decodes our packets correctly.');
decoder.free();
