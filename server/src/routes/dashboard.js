import { Router } from 'express';
import { rows } from '../db.js';
import { handler } from '../errors.js';
import { authenticate, scopeStaff } from '../middleware/auth.js';
import { getPolicy } from '../services/policy.js';
import { shapeRecruit } from '../services/recruits.js';

const router = Router();
router.use(authenticate, scopeStaff);

const monthOf = (offset = 0) => {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
};

const bounds = (month) => {
  const [year, num] = month.split('-').map(Number);
  const nextYear = num === 12 ? year + 1 : year;
  const nextMonth = num === 12 ? 1 : num + 1;
  return [`${month}-01`, `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`];
};

router.get('/', handler(async (req, res) => {
  const month = req.query.month || monthOf(0);
  const [start, end] = bounds(month);
  const scope = req.scope;
  const policy = await getPolicy();

  const [counts, joined, today, companies, recent, targets] = await Promise.all([
    rows(`SELECT status, count(*)::int AS n FROM recruit WHERE owner_id = ANY($1::uuid[]) GROUP BY status`, [scope]),
    rows(`SELECT r.*, o.name AS owner_name FROM recruit r JOIN staff o ON o.id = r.owner_id
           WHERE r.owner_id = ANY($1::uuid[]) AND r.doj >= $2 AND r.doj < $3 ORDER BY r.doj DESC`, [scope, start, end]),
    rows(`SELECT r.*, o.name AS owner_name FROM recruit r JOIN staff o ON o.id = r.owner_id
           WHERE r.owner_id = ANY($1::uuid[]) AND r.doj = $2 ORDER BY r.code DESC`, [scope, new Date().toISOString().slice(0, 10)]),
    rows(`SELECT company, count(*)::int AS n FROM recruit
           WHERE owner_id = ANY($1::uuid[]) AND company <> '' GROUP BY company ORDER BY count(*) DESC, company`, [scope]),
    rows(`SELECT r.*, o.name AS owner_name FROM recruit r JOIN staff o ON o.id = r.owner_id
           WHERE r.owner_id = ANY($1::uuid[]) ORDER BY r.created_at DESC, r.code DESC LIMIT 8`, [scope]),
    rows(`SELECT COALESCE(sum(COALESCE(t.target, $3)), 0)::int AS target FROM staff s
           LEFT JOIN placement_target t ON t.staff_id = s.id AND t.month = $1
          WHERE s.active AND s.role = 'recruiter' AND s.id = ANY($2::uuid[])`, [month, scope, policy.targetDefault]),
  ]);

  const status = Object.fromEntries(counts.map((row) => [row.status, row.n]));
  res.json({
    month,
    summary: { month, target: targets[0].target, achieved: joined.length },
    kpis: {
      total: counts.reduce((sum, row) => sum + row.n, 0),
      active: status.active || 0,
      notActive: status.not_active || 0,
      joinedThisMonth: joined.length,
      joinedToday: today.length,
    },
    byCompany: companies.slice(0, 8).map((row) => ({ company: row.company, count: row.n })),
    recent: recent.map(shapeRecruit),
    todayJoined: today.map(shapeRecruit),
  });
}));

export default router;
