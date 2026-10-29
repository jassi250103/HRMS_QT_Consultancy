import { Router } from 'express';
import { one, query, rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { authenticate, scopeStaff } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { canDecide, decisionSignature, isAdmin, requireDecision, seesStaff } from '../services/scope.js';
import { getPolicy, isInGeofence } from '../services/policy.js';
import { attendanceMark, decision as decisionSchema } from '../validation/schemas.js';
import { verifyFace } from '../services/faceRecognition.js';
import { autoFillAttendance } from '../services/attendanceAutoFill.js';

const router = Router();
router.use(authenticate, scopeStaff);

const SELECT = `
  SELECT a.*, s.name AS staff_name, s.employee_code, s.role AS staff_role, s.manager_id,
         m.name AS marked_by_name, d.name AS decided_by_name
    FROM attendance a
    JOIN staff s ON s.id = a.staff_id
    LEFT JOIN staff m ON m.id = a.marked_by
    LEFT JOIN staff d ON d.id = a.decided_by`;

const shape = (row) => ({
  id: row.id,
  staffId: row.staff_id,
  staffName: row.staff_name,
  employeeCode: row.employee_code,
  workDate: row.work_date,
  status: row.status,
  loginTime: row.login_time,
  late: row.late,
  markedBy: row.marked_by_name,
  markedAt: row.marked_at,
  decision: row.decision,
  decidedBy: row.decided_by_name,
  decidedAt: row.decided_at,
  remarks: row.remarks,
  latitude: row.marked_latitude,
  longitude: row.marked_longitude,
  distanceMeters: row.distance_meters,
  faceVerified: row.face_verified,
  manualOverride: row.manual_override,
  overrideReason: row.override_reason,
});

/* A late login is a request, not a record: it only becomes attendance once the manager accepts it. */
function isLate(loginTime, lateAfter) {
  if (!loginTime) return false;
  return String(loginTime).slice(0, 5) > String(lateAfter).slice(0, 5);
}

router.get('/', handler(async (req, res) => {
  const from = req.query.from || new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const staffId = req.query.staffId;
  if (staffId && !(await seesStaff(req.actor, staffId))) throw ApiError.forbidden('Outside your scope');

  // Auto-fill unmarked attendance dates before returning data
  const ids = staffId ? [staffId] : req.scope;
  await autoFillAttendance(ids, from, to);

  // Pagination parameters
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 25;
  const offset = (page - 1) * limit;

  
  // Get total count for pagination
  const countRow = await one(
    'SELECT COUNT(*) as total FROM attendance WHERE staff_id = ANY($1::uuid[]) AND work_date BETWEEN $2 AND $3',
    [ids, from, to]
  );
  const total = parseInt(countRow.total);
  
  // Get paginated records
  const items = await rows(
    `${SELECT} WHERE a.staff_id = ANY($1::uuid[]) AND a.work_date BETWEEN $2 AND $3 ORDER BY a.work_date DESC LIMIT $4 OFFSET $5`,
    [ids, from, to, limit, offset]
  );
  
  res.json({ 
    items: items.map(shape), 
    from, 
    to,
    pagination: {
      page,
      limit,
      total,
      totalPages: Math.ceil(total / limit),
      hasNext: offset + limit < total,
      hasPrev: page > 1,
    }
  });
}));

router.get('/pending', handler(async (req, res) => {
  const items = await rows(
    `${SELECT} JOIN staff_descendants($1) line ON line.staff_id = a.staff_id
     WHERE a.decision = 'pending' ORDER BY a.work_date DESC`,
    [req.actor.id],
  );
  const mine = await rows(`${SELECT} WHERE a.staff_id = $1 AND a.decision = 'pending'`, [req.actor.id]);
  res.json({ items: [...items, ...mine].map(shape) });
}));

router.post('/', handler(async (req, res) => {
  const input = attendanceMark.parse(req.body);
  const staffId = input.staffId || req.actor.id;
  if (staffId !== req.actor.id) {
    const allowed = await canDecide(req.actor, staffId);
    requireDecision(req.actor, staffId, allowed);
  }

  const policy = await getPolicy();
  const late = input.status === 'present' && isLate(input.loginTime, policy.lateAfter);
  const markingForOther = staffId !== req.actor.id;
  const decision = late && markingForOther ? 'n/a' : late ? 'pending' : 'n/a';

  /* Backup path: a manager/admin marking for a report skips face + geofence, but a Present
     mark must carry a reason so the override is auditable. Self-marks never set this flag. */
  let manualOverride = false;
  let overrideReason = null;
  if (markingForOther) {
    if (input.status === 'present' && !input.overrideReason) {
      throw ApiError.badRequest('An override reason is required when marking someone Present without face verification.');
    }
    if (input.overrideReason) {
      manualOverride = true;
      overrideReason = input.overrideReason;
    }
  }

  /* Geofence and face verification: MANDATORY for all self attendance marking */
  let distanceMeters = null;
  let faceVerified = false;

  if (staffId === req.actor.id) {
    // MANDATORY: Check geofence - must be within office radius (for present status only)
    if (input.status === 'present') {
      if (!policy.officeLatitude || !policy.officeLongitude) {
        throw ApiError.badRequest('Office location not configured. Contact HR admin to set up geofence.');
      }
      
      if (!input.latitude || !input.longitude) {
        throw ApiError.badRequest('Location access required. Please enable location services and try again.');
      }
      
      const geoCheck = isInGeofence(input.latitude, input.longitude, policy);
      if (!geoCheck.inside) {
        throw ApiError.forbidden(
          `Outside office geofence. You are ${geoCheck.distance}m from office (limit: ${policy.geofenceRadiusMeters || 100}m). Attendance can only be marked from office premises.`
        );
      }
      distanceMeters = geoCheck.distance;
    }

    // MANDATORY: Face verification required for ALL attendance marking (present/absent/leave)
    const staffRow = await one('SELECT face_embedding FROM staff WHERE id = $1', [staffId]);
    if (!staffRow.face_embedding) {
      throw ApiError.forbidden('Face not enrolled. Please enroll your face in Face Enrollment page before marking attendance.');
    }
    
    if (!input.faceDescriptor) {
      throw ApiError.badRequest('Face capture required. Please allow camera access and capture your face for verification.');
    }
    
    try {
      const result = verifyFace(staffRow.face_embedding, input.faceDescriptor);
      if (!result.verified) {
        throw ApiError.forbidden(result.message);
      }
      faceVerified = true;
    } catch (error) {
      if (error instanceof ApiError) throw error;
      console.error('[Face Verification] Error:', error);
      throw ApiError.internal('Face verification service unavailable. Please try again later.');
    }
  }

  const row = await one(
    `INSERT INTO attendance (staff_id, work_date, status, login_time, late, marked_by, decision, remarks,
       marked_latitude, marked_longitude, distance_meters, face_verified, manual_override, override_reason)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (staff_id, work_date) DO UPDATE
       SET status = EXCLUDED.status, login_time = EXCLUDED.login_time, late = EXCLUDED.late,
           marked_by = EXCLUDED.marked_by, decision = EXCLUDED.decision, remarks = EXCLUDED.remarks,
           marked_latitude = EXCLUDED.marked_latitude, marked_longitude = EXCLUDED.marked_longitude,
           distance_meters = EXCLUDED.distance_meters, face_verified = EXCLUDED.face_verified,
           manual_override = EXCLUDED.manual_override, override_reason = EXCLUDED.override_reason,
           decided_by = NULL, decided_at = NULL
     RETURNING *`,
    [staffId, input.workDate, input.status, input.loginTime || null, late, req.actor.id, decision,
     input.remarks || '', input.latitude || null, input.longitude || null, distanceMeters, faceVerified,
     manualOverride, overrideReason],
  );
  await writeAudit(query, { actor: req.actor, action: 'attendance_marked', entity: 'attendance', entityId: row.id, after: row });

  const full = await one(`${SELECT} WHERE a.id = $1`, [row.id]);
  const message = late
    ? 'Marked late — waiting for approval'
    : 'Record saved';
  res.status(201).json({ item: shape(full), message });
}));

router.post('/:id/decision', handler(async (req, res) => {
  const { decision, remarks } = decisionSchema.parse(req.body);
  const target = await one('SELECT a.*, s.manager_id FROM attendance a JOIN staff s ON s.id = a.staff_id WHERE a.id = $1', [req.params.id]);
  if (!target) throw ApiError.notFound('No such attendance record');
  if (target.decision !== 'pending') throw ApiError.conflict('This record is already decided');

  const allowed = await canDecide(req.actor, target.staff_id);
  requireDecision(req.actor, target.staff_id, allowed);

  /* Rejecting a late mark withdraws the claim: the day stands as Absent until it is re-marked. */
  const row = await one(
    `UPDATE attendance SET decision = $2, decided_by = $3, decided_at = now(),
       remarks = COALESCE(NULLIF($4, ''), remarks),
       status = CASE WHEN $2 = 'rejected' THEN 'absent' ELSE status END,
       login_time = CASE WHEN $2 = 'rejected' THEN NULL ELSE login_time END,
       late = CASE WHEN $2 = 'rejected' THEN false ELSE late END
     WHERE id = $1 RETURNING *`,
    [req.params.id, decision, req.actor.id, remarks ?? null],
  );
  await writeAudit(query, {
    actor: req.actor, action: `attendance_${decision}`, entity: 'attendance', entityId: row.id,
    before: { decision: target.decision, status: target.status }, after: { decision, status: row.status },
    req,
  });

  const full = await one(`${SELECT} WHERE a.id = $1`, [row.id]);
  res.json({ item: { ...shape(full), signature: decisionSignature(req.actor) }, message: `Marked ${decision}` });
}));

export default router;
