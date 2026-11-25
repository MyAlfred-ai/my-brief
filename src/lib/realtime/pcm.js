/**
 * Conversions de l'audio du direct, partagées par le canal (channel.js) et les
 * dialectes (dialects.js) : un module à part pour qu'aucun des deux n'importe
 * l'autre.
 */

/** PCM float32 [-1,1] → int16, format attendu par les API Realtime. */
export function float32ToPcm16(float32Array) {
  const pcm16 = new Int16Array(float32Array.length);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return pcm16;
}

export function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
