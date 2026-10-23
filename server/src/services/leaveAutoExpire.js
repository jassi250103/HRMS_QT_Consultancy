import { query } from '../db.js';

/**
 * Auto-expire leave applications for past dates that are still in 'applied' status.
 * These leaves were never decided by the manager before the date passed.
 */
export async function expirePendingLeaves() {
  const result = await query(
    `UPDATE leave_request
     SET status = 'rejected',
         remarks = COALESCE(remarks, '') || ' [Auto-rejected: date passed without approval]',
         decided_at = now()
     WHERE status = 'applied' AND leave_date < CURRENT_DATE`,
  );

  return result.rowCount;
}
