import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { one, query, rows } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { writeAudit } from '../services/audit.js';

export const STAFF_DOCUMENT_KINDS = ['offer_letter', 'appointment_letter', 'id_proof', 'resume', 'other'];

const router = Router({ mergeParams: true });

const TYPES = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

const MAX_BYTES = 5 * 1024 * 1024;

function targetPath(staffId, kind, extension) {
  return path.join(config.uploadDir, 'staff', staffId, `${kind}-${randomUUID()}${extension}`);
}

async function staffOr404(id) {
  const staff = await one('SELECT id, name FROM staff WHERE id::text = $1', [id]);
  if (!staff) throw ApiError.notFound('No such staff member');
  return staff;
}

const shapeDoc = (d) => ({
  kind: d.kind,
  name: d.file_name,
  size: d.size_bytes,
  contentType: d.content_type,
  uploadedOn: d.uploaded_at,
});

router.get('/', handler(async (req, res) => {
  const staff = await staffOr404(req.params.id);
  const docs = await rows('SELECT * FROM staff_document WHERE staff_id = $1', [staff.id]);
  res.json({ documents: Object.fromEntries(docs.map((d) => [d.kind, shapeDoc(d)])) });
}));

/* Uploads arrive as the raw request body; only six document types are accepted, by extension. */
router.post('/:kind', handler(async (req, res) => {
  const kind = req.params.kind;
  if (!STAFF_DOCUMENT_KINDS.includes(kind)) throw ApiError.badRequest('Unknown document type');
  const staff = await staffOr404(req.params.id);

  const requested = String(req.get('x-file-name') || `${kind}.pdf`);
  const safeName = path.basename(requested).slice(0, 120);
  const extension = path.extname(safeName).toLowerCase();
  const contentType = TYPES[extension];
  if (!contentType) throw ApiError.badRequest('Use PDF, JPG, PNG, DOC or DOCX');

  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (bytes.length === 0) throw ApiError.badRequest('The file is empty');
  if (bytes.length > MAX_BYTES) throw ApiError.badRequest('The file is larger than 5 MB');

  const stored = targetPath(staff.id, kind, extension);
  await mkdir(path.dirname(stored), { recursive: true });
  await writeFile(stored, bytes);

  const existing = await one('SELECT stored_path FROM staff_document WHERE staff_id = $1 AND kind = $2', [staff.id, kind]);
  await query(
    `INSERT INTO staff_document (staff_id, kind, file_name, size_bytes, content_type, stored_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (staff_id, kind) DO UPDATE
       SET file_name = EXCLUDED.file_name, size_bytes = EXCLUDED.size_bytes, content_type = EXCLUDED.content_type,
           stored_path = EXCLUDED.stored_path, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()`,
    [staff.id, kind, safeName, bytes.length, contentType, stored, req.actor.id],
  );
  if (existing && existing.stored_path !== stored) await unlink(existing.stored_path).catch(() => {});
  await writeAudit(query, { actor: req.actor, action: 'document_uploaded', entity: 'staff', entityId: staff.id, after: { kind, file: safeName }, req });

  res.status(201).json({ message: 'File attached', document: { kind, name: safeName, size: bytes.length, contentType, uploadedOn: new Date().toISOString() } });
}));

const getDoc = 'SELECT * FROM staff_document WHERE staff_id = $1 AND kind = $2';

router.get('/:kind', handler(async (req, res) => {
  if (!STAFF_DOCUMENT_KINDS.includes(req.params.kind)) throw ApiError.badRequest('Unknown document type');
  const staff = await staffOr404(req.params.id);
  const row = await one(getDoc, [staff.id, req.params.kind]);
  if (!row) throw ApiError.notFound('No file on record');
  res.setHeader('content-type', row.content_type);
  res.setHeader('content-disposition', `attachment; filename="${row.file_name.replace(/"/g, '')}"`);
  res.sendFile(path.resolve(row.stored_path));
}));

router.delete('/:kind', handler(async (req, res) => {
  if (!STAFF_DOCUMENT_KINDS.includes(req.params.kind)) throw ApiError.badRequest('Unknown document type');
  const staff = await staffOr404(req.params.id);
  const row = await one(getDoc, [staff.id, req.params.kind]);
  if (!row) throw ApiError.notFound('No file on record');
  await query('DELETE FROM staff_document WHERE id = $1', [row.id]);
  await unlink(row.stored_path).catch(() => {});
  await writeAudit(query, { actor: req.actor, action: 'document_removed', entity: 'staff', entityId: staff.id, before: { kind: row.kind, file: row.file_name }, req });
  res.json({ message: 'File removed' });
}));

export default router;
