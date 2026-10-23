import { Router } from 'express';
import { query } from '../db.js';
import { handler } from '../errors.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import { writeAudit } from '../services/audit.js';
import { getPolicy, putPolicy } from '../services/policy.js';
import { policyUpdate } from '../validation/schemas.js';

const router = Router();
router.use(authenticate);

/* Attendance lateness, notice period, default target and the password rules all read from this one row. */
router.get('/', handler(async (_req, res) => {
  res.json(await getPolicy());
}));

router.put('/', requireAdmin, handler(async (req, res) => {
  const input = policyUpdate.parse(req.body);
  const before = await getPolicy();
  const row = await putPolicy({ ...input, updatedBy: req.actor.id });
  await writeAudit(query, { actor: req.actor, action: 'policy_updated', entity: 'policy', entityId: 'policy', before, after: input, req });
  res.json({ item: await getPolicy(), message: 'Policy saved' });
}));

export default router;
