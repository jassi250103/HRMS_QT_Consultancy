/**
 * Admin Face Enrollment Reset
 * Allows HR admins to reset face enrollment for specific staff members
 */

import { Router } from 'express';
import { one, query, pool } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';

const router = Router();
router.use(authenticate);

/**
 * POST /api/admin/face-enrollment/reset/:staffId
 * Reset face enrollment for a specific staff member
 */
router.post('/reset/:staffId', requireAdmin, handler(async (req, res) => {
  const staffId = req.params.staffId;
  
  // Verify staff member exists
  const staffRow = await one('SELECT id, name, employee_code FROM staff WHERE id = $1', [staffId]);
  if (!staffRow) {
    throw ApiError.notFound('Staff member not found');
  }
  
  // Check if they have face enrollment
  const hasFace = await one('SELECT face_embedding FROM staff WHERE id = $1', [staffId]);
  if (!hasFace.face_embedding) {
    throw ApiError.badRequest('Staff member does not have face enrollment');
  }
  
  // Reset face enrollment
  await query(
    'UPDATE staff SET face_embedding = NULL, face_enrolled_at = NULL WHERE id = $1',
    [staffId]
  );
  
  // Audit log
  await writeAudit(pool, {
    actor: { id: req.actor.id, name: req.actor.name || 'admin' },
    action: 'face_enrollment_reset',
    entity: 'staff',
    entityId: staffId,
    after: { message: `Face enrollment reset for ${staffRow.name}` },
    req,
  });
  
  res.json({
    success: true,
    message: `Face enrollment reset for ${staffRow.name}. They can now re-enroll their face.`,
  });
}));

/**
 * GET /api/admin/face-enrollment/status
 * Get face enrollment status for all staff
 */
router.get('/status', requireAdmin, handler(async (req, res) => {
  const result = await query(`
    SELECT 
      id, 
      name, 
      employee_code, 
      role,
      CASE WHEN face_embedding IS NOT NULL THEN true ELSE false END as has_face_enrolled,
      face_enrolled_at
    FROM staff 
    ORDER BY name
  `);
  
  const staff = result.rows;
  
  res.json({
    total: staff.length,
    enrolled: staff.filter(s => s.has_face_enrolled).length,
    notEnrolled: staff.filter(s => !s.has_face_enrolled).length,
    staff: staff,
  });
}));

export default router;
