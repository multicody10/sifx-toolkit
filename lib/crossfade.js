'use strict';

function clamp16(v) {
  if (v > 32767) return 32767;
  if (v < -32768) return -32768;
  return v | 0;
}

/**
 * Blend the tail of a loop into its head with a cosine crossfade, then drop the
 * now-redundant tail. The result is `fadeMs` shorter than the input but loops
 * back-to-back without an audible seam, regardless of how naive the player is.
 *
 * @param {Int16Array} samples interleaved PCM16
 * @param {number} channels
 * @param {number} sampleRate
 * @param {number} fadeMs
 * @returns {{ samples: Int16Array, fadeMsUsed: number }}
 */
function crossfadeLoop(samples, channels, sampleRate, fadeMs) {
  const totalFrames = samples.length / channels;
  let fadeFrames = Math.round((sampleRate * fadeMs) / 1000);
  if (fadeFrames <= 0) return { samples, fadeMsUsed: 0 };
  fadeFrames = Math.min(fadeFrames, Math.floor(totalFrames / 2));
  if (fadeFrames <= 0) return { samples, fadeMsUsed: 0 }; // clip too short to crossfade meaningfully

  const outFrames = totalFrames - fadeFrames;
  const out = new Int16Array(outFrames * channels);

  for (let i = 0; i < fadeFrames; i++) {
    const w = 0.5 * (1 - Math.cos((Math.PI * i) / fadeFrames)); // 0 -> 1
    const tailFrame = totalFrames - fadeFrames + i;
    for (let ch = 0; ch < channels; ch++) {
      const head = samples[i * channels + ch];
      const tail = samples[tailFrame * channels + ch];
      out[i * channels + ch] = clamp16(Math.round(head * w + tail * (1 - w)));
    }
  }
  for (let i = fadeFrames; i < outFrames; i++) {
    for (let ch = 0; ch < channels; ch++) {
      out[i * channels + ch] = samples[i * channels + ch];
    }
  }
  return { samples: out, fadeMsUsed: Math.round((fadeFrames * 1000) / sampleRate) };
}

module.exports = { crossfadeLoop };
