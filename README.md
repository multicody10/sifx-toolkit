# SIFX — Sound Image Format eXtended

A still image with a looping ambient sound baked into it. The file is a
perfectly valid WebP everywhere — Discord, browsers, Slack, image viewers,
Photoshop — so it always renders as a normal picture with zero extra tooling.
Only a SIFX-aware player also plays the sound.

## The trick

WebP is a RIFF container:

```
"RIFF" | u32 size | "WEBP" | chunk | chunk | chunk…
```

RIFF decoders are required by spec to skip chunk IDs they don't recognize.
So the audio rides as one extra chunk, `SAUD`, appended after the standard
image chunks. Any WebP decoder opens the file exactly as before. Only a
player that specifically looks for `SAUD` finds and plays the sound.

## `SAUD` chunk layout

All integers little-endian.

| offset | field | type | notes |
|---|---|---|---|
| 0 | version | u8 | currently `1` |
| 1 | loop_mode | u8 | `0` = once, `1` = loop |
| 2 | gain_centibels | i16 | dB × 100 |
| 4 | crossfade_ms | u32 | seam fade baked into the audio |
| 8 | sample_rate | u32 | 8000 / 12000 / 16000 / 24000 / 48000 |
| 12 | channels | u8 | 1 or 2 |
| 13 | reserved | u8 | |
| 14 | frame_samples | u16 | samples/channel per Opus packet (960 = 20ms @ 48kHz) |
| 16 | total_frames | u32 | trim target after decode |
| 20 | packet_count | u32 | |
| 24+ | packets | — | `packet_count ×` [u16 len + len bytes] |

Audio codec: raw Opus packets (no Ogg container).

## Install

```
npm install
```

## Browser player + encoder

Open `player/index.html` in Chrome or Edge. Two tabs:

**play** — drop any `.sifx` file; shows the image immediately, then decodes
and plays the embedded loop.

**create** — drop any image (PNG, JPEG, WebP, GIF…) and any audio file
(MP3, WAV, OGG, FLAC…), set loop mode, gain, and crossfade, hit
"create .sifx", download the result.

The browser player ships vendored files alongside `index.html`:
`opus-decoder.min.js` (decode), `opusscript_native_wasm.js`,
`opusscript_native_wasm.wasm`, and `opusscript_native_wasm_binary.js`
(encode). Keep them in the same folder.

## CLI

```
node cli.js encode --image in.webp --audio in.wav --out out.sifx \
  [--once] [--gain -6] [--crossfade 30] [--frame-ms 20]

node cli.js decode --in out.sifx [--out-image plain.webp] [--out-audio loop.wav]

node cli.js info  --in out.sifx
```

Audio input must be 16-bit PCM WAV at 8000/12000/16000/24000/48000 Hz.
Resample first if needed: `ffmpeg -i in.wav -ar 48000 out.wav`

## Node API

```js
const { encodeAWEBP, decodeAWEBP } = require('./index');

const sifx = encodeAWEBP({
  webpBuffer: fs.readFileSync('photo.webp'),
  wavBuffer:  fs.readFileSync('ambience.wav'),
  loopMode:   'loop',
  gainDb:     -6,
  crossfadeMs: 30,
});
fs.writeFileSync('photo.sifx', sifx); // valid .webp everywhere

const { webp, audio } = decodeAWEBP(sifx);
// webp:  byte-identical to original image
// audio: { loopMode, gainDb, sampleRate, channels, samples: Int16Array }
```

## Tests

```
npm test
```

Runs a full Node round-trip (encode → decode, image byte-identity check, audio
RMS sanity) and validates the Opus packets through the same `opus-decoder` WASM
library that the browser player uses.

## Distribution on Discord

Upload as a normal `.webp`. Discord previews it inline as a static image.
Viewers who open it in the SIFX player (or any SIFX-aware tool) hear the loop.
The split — image always renders, sound is opt-in — is the entire design.
