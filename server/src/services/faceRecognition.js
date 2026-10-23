/**
 * Face Recognition Service
 *
 * Face detection + descriptor extraction happen in the browser (face-api.js).
 * The server stores one or more 128-d descriptors per person and compares a
 * live descriptor against them using Euclidean distance (best-of-N wins).
 *
 * face-api.js descriptors are L2-normalized: lower distance = more similar.
 * Same person across days/lighting/clothing typically lands 0.3-0.5;
 * different people rarely below ~0.5. Accept boundary defaults to 0.5.
 */

import { ApiError } from '../errors.js';

const DESCRIPTOR_DIM = 128;

export const FACE_MATCH_MAX_DISTANCE = (() => {
  const raw = Number(process.env.FACE_MATCH_MAX_DISTANCE);
  return Number.isFinite(raw) && raw > 0 && raw < 1 ? raw : 0.5;
})();

function toVector(descriptor) {
  if (Array.isArray(descriptor)) return descriptor;
  if (descriptor && typeof descriptor === 'object') return Object.values(descriptor);
  return null;
}

function isFiniteVector(v) {
  return Array.isArray(v) && v.length === DESCRIPTOR_DIM && v.every((x) => typeof x === 'number' && Number.isFinite(x));
}

// A real face embedding is high-variance with a healthy norm. A crafted
// all-zero / constant vector is degenerate and must never be enrolled or matched.
function isDegenerate(v) {
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0));
  if (!Number.isFinite(norm) || norm < 1e-3) return true;
  const unique = new Set(v.map((x) => Math.round(x * 1e6) / 1e6));
  return unique.size < 16;
}

export function euclideanDistance(a, b) {
  let sum = 0;
  for (let i = 0; i < DESCRIPTOR_DIM; i++) {
    const diff = a[i] - b[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

// Accepts a stored face_embedding in either shape: a single 128-array (legacy)
// or an array of 128-arrays (multi-sample). Returns a list of usable vectors.
export function enrolledSamples(stored) {
  let data = stored;
  if (typeof stored === 'string') {
    try { data = JSON.parse(stored); } catch { return []; }
  }
  if (!Array.isArray(data) || data.length === 0) return [];
  const candidates = Array.isArray(data[0]) ? data : [data];
  return candidates.filter((v) => isFiniteVector(toVector(v)) && !isDegenerate(toVector(v)));
}

/**
 * Compare a live descriptor against the enrolled sample(s).
 * Fail-closed: any malformed/non-finite input yields verified=false, never an accept.
 */
export function verifyFace(storedEnrolled, liveDescriptor) {
  const live = toVector(liveDescriptor);
  if (!isFiniteVector(live)) {
    return { verified: false, distance: null, threshold: FACE_MATCH_MAX_DISTANCE, message: 'Invalid face capture. Please retry.' };
  }
  if (isDegenerate(live)) {
    return { verified: false, distance: null, threshold: FACE_MATCH_MAX_DISTANCE, message: 'Face capture is not usable. Please retry with your face clearly visible.' };
  }

  const samples = enrolledSamples(storedEnrolled).map(toVector);
  if (samples.length === 0) {
    return { verified: false, distance: null, threshold: FACE_MATCH_MAX_DISTANCE, message: 'No usable enrolled face on record. Please contact HR to re-enroll.' };
  }

  let best = Infinity;
  for (const sample of samples) {
    const d = euclideanDistance(sample, live);
    if (Number.isFinite(d) && d < best) best = d;
  }

  if (!Number.isFinite(best)) {
    return { verified: false, distance: null, threshold: FACE_MATCH_MAX_DISTANCE, message: 'Face verification failed. Please try again.' };
  }

  const verified = best <= FACE_MATCH_MAX_DISTANCE;
  return {
    verified,
    distance: best,
    threshold: FACE_MATCH_MAX_DISTANCE,
    message: verified
      ? 'Face verified successfully'
      : `Face does not match the enrolled template (distance ${best.toFixed(3)}, must be <= ${FACE_MATCH_MAX_DISTANCE}). Please use the enrolled person's own face in better lighting, or contact HR to re-enroll.`,
  };
}

/**
 * Validate a descriptor before storing it (enrollment). Throws on any bad input.
 */
export function validateDescriptor(descriptor) {
  const v = toVector(descriptor);
  if (!v) throw ApiError.badRequest('Face descriptor is required');
  if (v.length !== DESCRIPTOR_DIM) throw ApiError.badRequest(`Invalid descriptor length: expected ${DESCRIPTOR_DIM}, got ${v.length}`);
  if (!isFiniteVector(v)) throw ApiError.badRequest('Face descriptor must contain only finite numbers');
  if (isDegenerate(v)) throw ApiError.badRequest('Face descriptor is not usable. Recapture with your face clearly and centrally in frame.');
  return true;
}
