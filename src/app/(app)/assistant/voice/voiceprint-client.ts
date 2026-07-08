"use client";

import { normalizeVoiceprintVector, VOICEPRINT_SIZE } from "@/lib/voice/voiceprint";

function mean(values: Float32Array, start: number, end: number): number {
  let sum = 0;
  const cappedEnd = Math.min(values.length, end);
  for (let i = start; i < cappedEnd; i++) sum += Math.abs(values[i] ?? 0);
  return cappedEnd > start ? sum / (cappedEnd - start) : 0;
}

function zeroCrossingRate(values: Float32Array, start: number, end: number): number {
  let crossings = 0;
  let count = 0;
  const cappedEnd = Math.min(values.length, end);
  for (let i = Math.max(start + 1, 1); i < cappedEnd; i++) {
    const prev = values[i - 1] ?? 0;
    const next = values[i] ?? 0;
    if ((prev < 0 && next >= 0) || (prev >= 0 && next < 0)) crossings++;
    count++;
  }
  return count > 0 ? crossings / count : 0;
}

async function decodeBlob(blob: Blob): Promise<AudioBuffer> {
  const Ctx: typeof AudioContext =
    window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
  const ctx = new Ctx();
  try {
    const buffer = await blob.arrayBuffer();
    return await ctx.decodeAudioData(buffer.slice(0));
  } finally {
    void ctx.close().catch(() => {});
  }
}

export async function computeVoiceprintFromBlob(blob: Blob): Promise<number[]> {
  const audio = await decodeBlob(blob);
  const channel = audio.getChannelData(0);
  const duration = Math.max(0.001, audio.duration);
  const samples = channel.length;
  const bucketCount = 6;
  const vector: number[] = [];

  for (let i = 0; i < bucketCount; i++) {
    const start = Math.floor((samples * i) / bucketCount);
    const end = Math.floor((samples * (i + 1)) / bucketCount);
    vector.push(mean(channel, start, end));
  }

  for (let i = 0; i < bucketCount; i++) {
    const start = Math.floor((samples * i) / bucketCount);
    const end = Math.floor((samples * (i + 1)) / bucketCount);
    vector.push(zeroCrossingRate(channel, start, end));
  }

  vector.push(Math.min(1, duration / 5));
  vector.push(audio.sampleRate / 96000);

  return normalizeVoiceprintVector(vector.slice(0, VOICEPRINT_SIZE));
}
