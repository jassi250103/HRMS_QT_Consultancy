import { Router } from 'express';
import { one, query } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { validateDescriptor } from '../services/faceRecognition.js';

const router = Router();
router.use(authenticate);

const MAX_SAMPLES = 5;
// Minimum face-api detection score required for a stored sample.
const ENROLL_MIN_SCORE = (() => {
  const raw = Number(process.env.ENROLL_MIN_SCORE);
  return Number.isFinite(raw) && raw > 0 && raw <= 1 ? raw : 0.6;
})();

/* POST /api/face-enrollment - Enroll face for current user
 * Body: { descriptors?: Array<{descriptor:number[128], confidence:number}> | number[128],
 *         descriptor?: number[128], confidence?: number }
 * Descriptors are extracted client-side with face-api.js.
 */
router.post('/', handler(async (req, res) => {
  const { descriptors, descriptor, confidence } = req.body;

  // Normalize into a list of { descriptor, confidence } samples, accepting
  // both the new multi-sample shape and the legacy single-sample shape.
  let samples = [];
  if (Array.isArray(descriptors)) {
    samples = descriptors.map((d) => (d && typeof d === 'object' && 'descriptor' in d
      ? { descriptor: d.descriptor, confidence: d.confidence }
      : { descriptor: d, confidence }));
  } else if (descriptor) {
    samples = [{ descriptor, confidence }];
  }

  samples = samples.filter((s) => s.descriptor);
  if (samples.length === 0) {
    throw ApiError.badRequest('Face descriptor required. Please capture your face.');
  }
  if (samples.length > MAX_SAMPLES) {
    throw ApiError.badRequest(`Too many samples (max ${MAX_SAMPLES}).`);
  }

  for (const s of samples) validateDescriptor(s.descriptor);

  // Reject low-quality captures so enrollment templates stay usable.
  for (const s of samples) {
    if (s.confidence != null && s.confidence < ENROLL_MIN_SCORE) {
      throw ApiError.badRequest(
        `Face detection confidence too low (${(s.confidence * 100).toFixed(0)}%). Please retake in better lighting with your face clearly visible.`
      );
    }
  }

  // Check if already enrolled (one-time enrollment policy)
  const existingRow = await one('SELECT face_enrolled_at FROM staff WHERE id = $1', [req.actor.id]);
  if (existingRow.face_enrolled_at) {
    throw ApiError.conflict(
      'Face already enrolled. Face enrollment is a one-time security measure. Contact HR admin if you need to re-enroll due to appearance changes.'
    );
  }

  const vectors = samples.map((s) => Array.from(toNumberArray(s.descriptor)));
  await query(
    'UPDATE staff SET face_embedding = $2, face_enrolled_at = now() WHERE id = $1',
    [req.actor.id, JSON.stringify(vectors)],
  );

  await writeAudit(query, {
    actor: req.actor,
    action: 'face_enrolled',
    entity: 'staff',
    entityId: req.actor.id,
    after: { enrolledAt: new Date().toISOString(), samples: vectors.length, algorithm: 'face-api.js-128d' },
  });

  res.json({
    message: 'Face enrolled successfully. This cannot be changed without HR admin approval.',
    enrolledAt: new Date().toISOString(),
  });
}));

function toNumberArray(descriptor) {
  const v = Array.isArray(descriptor) ? descriptor : Object.values(descriptor || {});
  return v.map(Number);
}

/* GET /api/face-enrollment/me - Check enrollment status */
router.get('/me', handler(async (req, res) => {
  const row = await one('SELECT face_enrolled_at FROM staff WHERE id = $1', [req.actor.id]);
  res.json({
    enrolled: !!row.face_enrolled_at,
    enrolledAt: row.face_enrolled_at || null,
  });
}));

/* DELETE /api/face-enrollment - Remove face enrollment (ADMIN ONLY) */
router.delete('/', handler(async (req, res) => {
  // Only HR admins can remove face enrollments for security
  if (req.actor.role !== 'hr_admin' && req.actor.role !== 'admin') {
    throw ApiError.forbidden('Only HR admins can remove face enrollments. Please submit a request to HR.');
  }

  const staffId = req.query.staffId || req.actor.id;
  
  await query(
    'UPDATE staff SET face_embedding = NULL, face_enrolled_at = NULL WHERE id = $1',
    [staffId],
  );

  await writeAudit(query, {
    actor: req.actor,
    action: 'face_enrollment_removed_by_admin',
    entity: 'staff',
    entityId: staffId,
  });

  res.json({ message: 'Face enrollment removed by admin. User can now re-enroll.' });
}));

export default router;
