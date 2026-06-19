'use strict';

const VERSION = 1;
const HEADER_LEN = 24;

const LOOP_MODE = { ONCE: 0, LOOP: 1 };

/**
 * SAUD chunk payload layout (all little-endian):
 *   u8  version
 *   u8  loop_mode        (0 = once, 1 = loop)
 *   i16 gain_centibels   (dB * 100, signed)
 *   u32 crossfade_ms     (loop-seam crossfade baked into the audio, for reference)
 *   u32 sample_rate      (Opus rate: 8000/12000/16000/24000/48000)
 *   u8  channels
 *   u8  reserved
 *   u16 frame_samples    (samples/channel per Opus packet, e.g. 960 = 20ms @ 48kHz)
 *   u32 total_frames     (true playable length; trims wrap-padding after decode)
 *   u32 packet_count
 *   then packet_count * [u16 len, len bytes of raw Opus packet]
 */
function encodeSaud({ loopMode, gainCentibels, crossfadeMs, sampleRate, channels, frameSamples, totalFrames, packets }) {
  let bodyLen = HEADER_LEN;
  for (const p of packets) bodyLen += 2 + p.length;

  const buf = Buffer.alloc(bodyLen);
  buf.writeUInt8(VERSION, 0);
  buf.writeUInt8(loopMode, 1);
  buf.writeInt16LE(gainCentibels, 2);
  buf.writeUInt32LE(crossfadeMs, 4);
  buf.writeUInt32LE(sampleRate, 8);
  buf.writeUInt8(channels, 12);
  buf.writeUInt8(0, 13); // reserved
  buf.writeUInt16LE(frameSamples, 14);
  buf.writeUInt32LE(totalFrames, 16);
  buf.writeUInt32LE(packets.length, 20);

  let offset = HEADER_LEN;
  for (const p of packets) {
    buf.writeUInt16LE(p.length, offset);
    p.copy(buf, offset + 2);
    offset += 2 + p.length;
  }
  return buf;
}

function decodeSaud(buf) {
  const version = buf.readUInt8(0);
  if (version !== VERSION) throw new Error(`Unsupported SAUD version ${version}`);
  const loopMode = buf.readUInt8(1);
  const gainCentibels = buf.readInt16LE(2);
  const crossfadeMs = buf.readUInt32LE(4);
  const sampleRate = buf.readUInt32LE(8);
  const channels = buf.readUInt8(12);
  const frameSamples = buf.readUInt16LE(14);
  const totalFrames = buf.readUInt32LE(16);
  const packetCount = buf.readUInt32LE(20);

  const packets = [];
  let offset = HEADER_LEN;
  for (let i = 0; i < packetCount; i++) {
    const len = buf.readUInt16LE(offset);
    packets.push(buf.subarray(offset + 2, offset + 2 + len));
    offset += 2 + len;
  }

  return { version, loopMode, gainCentibels, crossfadeMs, sampleRate, channels, frameSamples, totalFrames, packets };
}

module.exports = { encodeSaud, decodeSaud, LOOP_MODE, VERSION };
