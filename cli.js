#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { encodeAWEBP } = require('./lib/encode');
const { decodeAWEBP } = require('./lib/decode');
const { writeWav } = require('./lib/wav');

function arg(flag, fallback) {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : process.argv[i + 1];
}
function has(flag) {
  return process.argv.includes(flag);
}

function cmdEncode() {
  const imagePath = arg('--image');
  const audioPath = arg('--audio');
  const outPath = arg('--out');
  if (!imagePath || !audioPath || !outPath) {
    console.error('Usage: sifx encode --image <in.webp> --audio <in.wav> --out <out.sifx> [--once] [--gain -6] [--crossfade 30] [--frame-ms 20]');
    process.exit(1);
  }
  const loopMode = has('--once') ? 'once' : 'loop';
  const gainDb = parseFloat(arg('--gain', '0'));
  const crossfadeMs = parseInt(arg('--crossfade', '30'), 10);
  const frameMs = parseInt(arg('--frame-ms', '20'), 10);

  const out = encodeAWEBP({
    webpBuffer: fs.readFileSync(imagePath),
    wavBuffer: fs.readFileSync(audioPath),
    loopMode,
    gainDb,
    crossfadeMs,
    frameMs,
  });
  fs.writeFileSync(outPath, out);
  console.log(`Wrote ${outPath} (${out.length} bytes, ${loopMode} mode)`);
}

function cmdDecode() {
  const inPath = arg('--in');
  const outImage = arg('--out-image');
  const outAudio = arg('--out-audio');
  if (!inPath) {
    console.error('Usage: sifx decode --in <file.sifx> [--out-image <out.webp>] [--out-audio <out.wav>]');
    process.exit(1);
  }
  const { webp, audio } = decodeAWEBP(fs.readFileSync(inPath));
  if (outImage) fs.writeFileSync(outImage, webp);
  if (!audio) {
    console.log('No SAUD chunk found — this is a plain image with no embedded audio.');
    return;
  }
  console.log(`Audio: ${audio.loopMode} mode, ${audio.sampleRate}Hz, ${audio.channels}ch, gain ${audio.gainDb}dB, crossfade ${audio.crossfadeMs}ms, ${audio.samples.length / audio.channels} frames`);
  if (outAudio) {
    fs.writeFileSync(outAudio, writeWav({ sampleRate: audio.sampleRate, channels: audio.channels, samples: audio.samples }));
    console.log(`Wrote ${outAudio}`);
  }
}

function cmdInfo() {
  const inPath = arg('--in');
  if (!inPath) {
    console.error('Usage: sifx info --in <file.sifx>');
    process.exit(1);
  }
  const buf = fs.readFileSync(inPath);
  const riff = require('./lib/riff');
  const chunks = riff.listChunks(buf);
  console.log(`${path.basename(inPath)}: ${buf.length} bytes, ${chunks.length} chunks`);
  for (const c of chunks) console.log(`  ${c.id}  ${c.size} bytes`);
}

const cmd = process.argv[2];
if (cmd === 'encode') cmdEncode();
else if (cmd === 'decode') cmdDecode();
else if (cmd === 'info') cmdInfo();
else {
  console.error('Usage: sifx <encode|decode|info> ...');
  process.exit(1);
}
