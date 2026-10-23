import { query, rows, one } from '../db.js';

/**
 * Auto-fill attendance records for unmarked dates within a date range.
 * - Sundays are roster-off and never auto-filled
 * - Dates before a person joined are left blank (floor = doj, else their record's created date)
 * - If approved leave exists for that date → status = 'leave'
 * - Otherwise → status = 'absent'
 */
export async function autoFillAttendance(staffIds, fromDate, toDate) {
  if (!staffIds || staffIds.length === 0) return;

  // Find dates without attendance records for each staff member, on/after their joining date
  const missingDates = await rows(
    `SELECT s.id AS staff_id, d.date::date AS work_date
     FROM unnest($1::uuid[]) s(id)
     JOIN staff st ON st.id = s.id
     CROSS JOIN generate_series($2::date, $3::date, '1 day'::interval) d(date)
     LEFT JOIN attendance a ON a.staff_id = s.id AND a.work_date = d.date::date
     WHERE a.id IS NULL AND EXTRACT(ISODOW FROM d.date) < 7
       AND d.date::date >= COALESCE(st.doj, st.created_at::date)`,
    [staffIds, fromDate, toDate],
  );

  if (missingDates.length === 0) return;

  // For each missing date, check if there's an approved leave
  for (const row of missingDates) {
    const leaveRecord = await one(
      `SELECT id FROM leave_request
       WHERE staff_id = $1 AND leave_date = $2 AND status = 'accepted'
       LIMIT 1`,
      [row.staff_id, row.work_date],
    ).catch(() => null);

    const status = leaveRecord ? 'leave' : 'absent';

    // Insert the auto-filled attendance record
    await query(
      `INSERT INTO attendance (staff_id, work_date, status, decision, marked_by, remarks)
       VALUES ($1, $2, $3, 'n/a', NULL, $4)
       ON CONFLICT (staff_id, work_date) DO NOTHING`,
      [row.staff_id, row.work_date, status, leaveRecord ? 'Auto-filled from approved leave' : 'Auto-filled: no mark recorded'],
    ).catch(() => {
      // Ignore conflicts - another process may have inserted simultaneously
    });
  }

  return missingDates.length;
}
