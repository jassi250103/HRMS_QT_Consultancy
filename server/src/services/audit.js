import { pool } from '../db.js';

/* audit_log is append-only. Nothing in the API updates or deletes a row once written. */
export async function writeAudit(db, { actor, action, entity, entityId = '', before = null, after = null, req }) {
  const runner = db && typeof db.query === 'function' ? db : pool;
  await runner.query(
    `INSERT INTO audit_log (actor_id, actor_name, action, entity, entity_id, before_data, after_data, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9)`,
    [
      actor?.id ?? null,
      actor?.name ?? 'system',
      action,
      entity,
      String(entityId ?? ''),
      before ? JSON.stringify(before) : null,
      after ? JSON.stringify(after) : null,
      req?.ip ?? '',
      req?.get?.('user-agent') ?? '',
    ],
  );
}
