import { createHash } from 'node:crypto';

export function sha256Buffer(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function buildManifest(tourId, captures, generatedAt = new Date().toISOString()) {
  return {
    tourId,
    generatedAt,
    captures,
  };
}
