'use strict';

// Minimal RIFF container helpers. WebP is a RIFF file under the hood:
//   bytes 0-3   "RIFF"
//   bytes 4-7   u32 LE, file size - 8
//   bytes 8-11  format tag, "WEBP" for our case
//   bytes 12+   chunks: fourCC(4) + size(u32 LE) + payload(size bytes) + pad(0 or 1 byte to even)
//
// RIFF decoders are required by spec to skip chunk IDs they don't recognize,
// which is the entire reason this format works: appending an unknown chunk
// keeps the file a valid, renderable WebP everywhere.

const RIFF_HEADER_LEN = 12;
const CHUNK_HEADER_LEN = 8;

function assertRiff(buffer, formatTag) {
  if (buffer.length < RIFF_HEADER_LEN) throw new Error('Buffer too small to be RIFF');
  if (buffer.toString('ascii', 0, 4) !== 'RIFF') throw new Error('Missing RIFF magic');
  if (formatTag && buffer.toString('ascii', 8, 12) !== formatTag) {
    throw new Error(`Expected RIFF format "${formatTag}", got "${buffer.toString('ascii', 8, 12)}"`);
  }
}

/** List top-level chunks after the 12-byte RIFF header. */
function listChunks(buffer) {
  assertRiff(buffer);
  const chunks = [];
  let offset = RIFF_HEADER_LEN;
  while (offset + CHUNK_HEADER_LEN <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const dataStart = offset + CHUNK_HEADER_LEN;
    if (dataStart + size > buffer.length) break; // truncated/corrupt, stop here
    chunks.push({ id, size, dataStart, headerStart: offset });
    offset = dataStart + size + (size % 2); // chunks are padded to even length
  }
  return chunks;
}

function findChunk(buffer, id) {
  return listChunks(buffer).find((c) => c.id === id) || null;
}

/** Build a brand new RIFF buffer from a format tag and an ordered list of {id, payload}. */
function buildRiff(formatTag, chunks) {
  let bodyLen = 0;
  for (const c of chunks) bodyLen += CHUNK_HEADER_LEN + c.payload.length + (c.payload.length % 2);
  const totalLen = RIFF_HEADER_LEN + bodyLen;
  const out = Buffer.alloc(totalLen);
  out.write('RIFF', 0, 'ascii');
  out.writeUInt32LE(totalLen - 8, 4);
  out.write(formatTag, 8, 'ascii');
  let offset = RIFF_HEADER_LEN;
  for (const c of chunks) {
    out.write(c.id.padEnd(4, ' '), offset, 'ascii');
    out.writeUInt32LE(c.payload.length, offset + 4);
    c.payload.copy(out, offset + CHUNK_HEADER_LEN);
    offset += CHUNK_HEADER_LEN + c.payload.length;
    if (c.payload.length % 2 === 1) {
      out.writeUInt8(0, offset);
      offset += 1;
    }
  }
  return out;
}

/** Append a chunk to an existing RIFF buffer, fixing up the top-level size field. */
function appendChunk(buffer, id, payload) {
  assertRiff(buffer);
  const pad = payload.length % 2 === 1 ? 1 : 0;
  const addedLen = CHUNK_HEADER_LEN + payload.length + pad;
  const out = Buffer.alloc(buffer.length + addedLen);
  buffer.copy(out, 0);
  const newRiffSize = buffer.readUInt32LE(4) + addedLen;
  out.writeUInt32LE(newRiffSize, 4);
  let offset = buffer.length;
  out.write(id.padEnd(4, ' '), offset, 'ascii');
  out.writeUInt32LE(payload.length, offset + 4);
  payload.copy(out, offset + CHUNK_HEADER_LEN);
  if (pad) out.writeUInt8(0, offset + CHUNK_HEADER_LEN + payload.length);
  return out;
}

/** Strip a chunk by id, returning a clean standalone RIFF buffer without it. */
function removeChunk(buffer, id) {
  assertRiff(buffer);
  const formatTag = buffer.toString('ascii', 8, 12);
  const kept = listChunks(buffer)
    .filter((c) => c.id !== id)
    .map((c) => ({ id: c.id, payload: buffer.subarray(c.dataStart, c.dataStart + c.size) }));
  return buildRiff(formatTag, kept);
}

module.exports = { assertRiff, listChunks, findChunk, buildRiff, appendChunk, removeChunk };
