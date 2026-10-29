import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import { config } from '../config.js';
import { closePool, query, transaction } from '../db.js';
import { hashPassword } from '../security/passwords.js';
import { clearPolicyCache, putPolicy } from '../services/policy.js';
import * as fixture from './seed-data.js';

const KINDS = ['aadhaar', 'pan', 'resume', 'passbook'];
const TYPES = {
  '.pdf': 'application/pdf', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};
const TINY_PDF = '%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n';
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAAAv/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AVN//2Q==',
  'base64',
);

function placeholderFor(fileName) {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg' || ext === '.png') return { bytes: TINY_JPEG, contentType: TYPES[ext] };
  return { bytes: Buffer.from(TINY_PDF), contentType: TYPES[ext] || TYPES['.pdf'] };
}

const daysBack = (days) => new Date(Date.now() - days * 864e5);

async function seed() {
  const existing = await query('SELECT count(*)::int AS n FROM staff');
  if (existing.rows[0].n > 0 && !process.argv.includes('--force')) {
    throw new Error('The database already holds staff records. Re-run with --force to replace them.');
  }

  const password = process.env.SEED_PASSWORD || fixture.demoPassword;
  await mkdir(config.uploadDir, { recursive: true });

  await transaction(async (db) => {
    for (const table of ['audit_log', 'recruit_document', 'recruit', 'attendance', 'leave_request', 'resignation',
      'placement_target', 'master_item', 'refresh_session', 'password_history', 'staff_account', 'staff']) {
      await db.query(`TRUNCATE ${table} RESTART IDENTITY CASCADE`);
    }

    const ids = {};
    for (const person of fixture.staff) {
      const inserted = await db.query(
        `INSERT INTO staff (employee_code, name, designation, role, location, hub, city, team_note, mandate,
                 gender, dob, mobile, email, address, doj, hr, cluster, active)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, true) RETURNING id`,
        [person.employeeCode, person.name, person.designation, person.role, person.location, person.hub, person.city,
          person.teamNote, person.mandate, person.gender, person.dob, person.mobile, person.email, person.address,
          person.doj, person.hr, person.cluster],
      );
      ids[person.key] = inserted.rows[0].id;
    }
    for (const person of fixture.staff) {
      if (!person.reportsTo) continue;
      await db.query('UPDATE staff SET manager_id = $2 WHERE id = $1', [ids[person.key], ids[person.reportsTo]]);
    }

    for (const [key, account] of Object.entries(fixture.accounts)) {
      const hash = await hashPassword(password);
      await db.query(
        `INSERT INTO staff_account (staff_id, login_id, password_hash, must_change, locked, last_login_at)
         VALUES ($1, lower($2), $3, $4, $5, $6)`,
        [ids[key], account.loginId, hash, account.mustChange, account.locked, daysBack(account.lastLoginDays)],
      );
      await db.query('INSERT INTO password_history (staff_id, password_hash) VALUES ($1, $2)', [ids[key], hash]);
    }

    for (const [kind, values] of Object.entries(fixture.master)) {
      for (const value of values) {
        await db.query("INSERT INTO master_item (kind, value) VALUES ($1, $2) ON CONFLICT DO NOTHING", [kind, value]);
      }
    }

    const admin = ids['meera-krishnan'];
    const manager = ids['sanjay-iyer'];

    for (const recruit of fixture.recruits) {
      const closed = recruit.status === 'not_active';
      const inserted = await db.query(
        `INSERT INTO recruit (code, name, gender, dob, mobile, email, address, status, role, company, city, hub,
                hr_contact, doj, owner_id, deactivation_reason, remarks, created_at, closed_by, closed_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20) RETURNING id`,
        [recruit.code, recruit.name, recruit.gender, recruit.dob, recruit.mobile, recruit.email, recruit.address,
          recruit.status || 'active', recruit.role, recruit.company, recruit.city, recruit.hub, recruit.hr,
          recruit.doj, ids[recruit.owner], recruit.reason || '', recruit.remarks || '',
          daysBack(Math.max(0, (recruit.closedDays || 0) + 30)),
          closed ? manager : null, closed ? daysBack(recruit.closedDays || 1) : null],
      );

      for (const kind of KINDS) {
        const file = recruit.docs?.[kind];
        if (!file) continue;
        const { bytes, contentType } = placeholderFor(file.name);
        const stored = path.join(config.uploadDir, String(inserted.rows[0].id), `${kind}-seed${path.extname(file.name).toLowerCase() || '.pdf'}`);
        await mkdir(path.dirname(stored), { recursive: true });
        await writeFile(stored, bytes);
        await db.query(
          `INSERT INTO recruit_document (recruit_id, kind, file_name, size_bytes, content_type, stored_path)
           VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (recruit_id, kind) DO NOTHING`,
          [inserted.rows[0].id, kind, file.name, file.size, contentType, stored],
        );
      }
    }
    await db.query(
      `SELECT setval('recruit_code_seq', (SELECT coalesce(greatest(
          max((regexp_match(code, '^RCT-([0-9]+)$'))[1]::int),
          max((regexp_match(sys_code, '^RCT-([0-9]+)$'))[1]::int)
        ), 1000) + 1 FROM recruit))`,
    );

    const lateAfter = fixture.policy.lateAfter;
    for (const row of fixture.attendanceRows()) {
      const login = row.loginTime && row.pending && row.loginTime <= lateAfter
        ? `10:${row.loginTime.slice(3)}`
        : row.loginTime;
      const staffId = ids[row.owner];
      await db.query(
        `INSERT INTO attendance (staff_id, work_date, status, login_time, late, marked_by, decision, remarks,
                    marked_at, decided_by, decided_at)
         VALUES ($1, $2, $3, $4, $5, $1, $6, '', $9::timestamptz, $7::uuid, $8)
         ON CONFLICT (staff_id, work_date) DO NOTHING`,
        [staffId, row.date, row.status, login, Boolean(login && login > lateAfter),
          row.pending ? 'pending' : 'n/a',
          row.pending ? null : manager, row.pending ? null : daysBack(1), row.date],
      );
    }

    for (const leave of fixture.leaveRequests) {
      const decided = leave.status !== 'applied';
      await db.query(
        `INSERT INTO leave_request (staff_id, leave_date, reason, status, applied_at, decided_by, decided_at, remarks)
         VALUES ($1, $2, $3, $4, $5, $6::uuid, $7, $8)`,
        [ids[leave.owner], leave.date, leave.reason, leave.status, daysBack(leave.appliedDays),
          decided ? manager : null, decided ? daysBack(leave.decidedDays) : null,
          decided ? (leave.status === 'rejected' ? 'Coverage was already short that day' : 'Approved, arrange cover before you leave') : ''],
      );
    }

    for (const filing of fixture.resignationFilings) {
      await db.query(
        `INSERT INTO resignation (staff_id, reason, notice_date, requested_last_day, last_day, status, filed_at, remarks)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [ids[filing.owner], filing.reason, filing.noticeDate, filing.requestedLastDay, filing.requestedLastDay,
          filing.status, daysBack(filing.filedDays), filing.remarks],
      );
    }

    for (const [month, byPerson] of Object.entries(fixture.targets)) {
      for (const [key, target] of Object.entries(byPerson)) {
        await db.query(
          'INSERT INTO placement_target (staff_id, month, target, assigned_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [ids[key], month, target, admin],
        );
      }
    }
    for (const month of [fixture.monthOf(0), fixture.monthOf(-1)]) {
      for (const key of ['ananya-rao', 'vikram-desai', 'neha-kulkarni']) {
        const target = fixture.targets[month]?.[key] ?? fixture.policy.targetDefault;
        await db.query('INSERT INTO placement_target (staff_id, month, target, assigned_by) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
          [ids[key], month, target, admin]);
      }
    }

    clearPolicyCache();
    await putPolicy({
      ...fixture.policy,
      maxFailedAttempts: 5,
      lockMinutes: 15,
      passwordHistory: 3,
      updatedBy: admin,
    }, db);

    await db.query(
      `INSERT INTO audit_log (actor_name, action, entity, entity_id, after_data) VALUES ('system', 'database_seeded', 'system', '', $1)`,
      [JSON.stringify({ staff: fixture.staff.length, recruits: fixture.recruits.length })],
    );
  });

  console.log(`Seeded ${fixture.staff.length} staff and ${fixture.recruits.length} recruits. Login password: "${password}".`);
}

seed()
  .then(closePool)
  .catch(async (error) => {
    console.error(error.message || error);
    await closePool();
    process.exitCode = 1;
  });
