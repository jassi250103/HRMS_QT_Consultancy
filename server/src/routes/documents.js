import { randomUUID } from 'node:crypto';
import { mkdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Router } from 'express';
import { config } from '../config.js';
import { one, query } from '../db.js';
import { ApiError, handler } from '../errors.js';
import { writeAudit } from '../services/audit.js';
import { DOCUMENT_KINDS } from '../services/recruits.js';

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

function targetPath(recruitId, kind, extension) {
  return path.join(config.uploadDir, recruitId, `${kind}-${randomUUID()}${extension}`);
}

/* Uploads arrive as the raw request body; only six document types are accepted, by extension. */
router.post('/:kind', handler(async (req, res) => {
  const kind = req.params.kind;
  if (!DOCUMENT_KINDS.includes(kind)) throw ApiError.badRequest('Unknown document type');
  // Either handle works: the uuid the app holds, or the recruit code in a URL.
  const recruit = await one('SELECT id, code FROM recruit WHERE (id::text = $1 OR code = $1) AND owner_id = ANY($2::uuid[])', [req.params.id, req.scope]);
  if (!recruit) throw ApiError.notFound('No such recruit');

  const requested = String(req.get('x-file-name') || `${kind}.pdf`);
  const safeName = path.basename(requested).slice(0, 120);
  const extension = path.extname(safeName).toLowerCase();
  const contentType = TYPES[extension];
  if (!contentType) throw ApiError.badRequest('Use PDF, JPG, PNG, DOC or DOCX', { file: 'Use PDF, JPG, PNG, DOC or DOCX' });

  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (bytes.length === 0) throw ApiError.badRequest('The file is empty');
  if (bytes.length > MAX_BYTES) throw ApiError.badRequest('The file is larger than 5 MB');

  const stored = targetPath(recruit.id, kind, extension);
  await mkdir(path.dirname(stored), { recursive: true });
  await writeFile(stored, bytes);

  const existing = await one('SELECT stored_path FROM recruit_document WHERE recruit_id = $1 AND kind = $2', [recruit.id, kind]);
  await query(
    `INSERT INTO recruit_document (recruit_id, kind, file_name, size_bytes, content_type, stored_path, uploaded_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (recruit_id, kind) DO UPDATE
       SET file_name = EXCLUDED.file_name, size_bytes = EXCLUDED.size_bytes, content_type = EXCLUDED.content_type,
           stored_path = EXCLUDED.stored_path, uploaded_by = EXCLUDED.uploaded_by, uploaded_at = now()`,
    [recruit.id, kind, safeName, bytes.length, contentType, stored, req.actor.id],
  );
  if (existing && existing.stored_path !== stored) await unlink(existing.stored_path).catch(() => {});
  await writeAudit(query, { actor: req.actor, action: 'document_uploaded', entity: 'recruit', entityId: recruit.id, after: { kind, file: safeName }, req });

  res.status(201).json({ message: 'File attached', document: { kind, name: safeName, size: bytes.length, contentType, uploadedOn: new Date().toISOString() } });
}));

const getDoc = `SELECT d.* FROM recruit_document d JOIN recruit r ON r.id = d.recruit_id
  WHERE (r.id::text = $1 OR r.code = $1) AND d.kind = $2 AND r.owner_id = ANY($3::uuid[])`;

router.get('/:kind', handler(async (req, res) => {
  if (!DOCUMENT_KINDS.includes(req.params.kind)) throw ApiError.badRequest('Unknown document type');
  const row = await one(getDoc, [req.params.id, req.params.kind, req.scope]);
  if (!row) throw ApiError.notFound('No file on record');
  res.setHeader('content-type', row.content_type);
  res.setHeader('content-disposition', `attachment; filename="${row.file_name.replace(/"/g, '')}"`);
  res.sendFile(path.resolve(row.stored_path));
}));

router.delete('/:kind', handler(async (req, res) => {
  if (!DOCUMENT_KINDS.includes(req.params.kind)) throw ApiError.badRequest('Unknown document type');
  const row = await one(getDoc, [req.params.id, req.params.kind, req.scope]);
  if (!row) throw ApiError.notFound('No file on record');
  await query('DELETE FROM recruit_document WHERE id = $1', [row.id]);
  await unlink(row.stored_path).catch(() => {});
  await writeAudit(query, { actor: req.actor, action: 'document_removed', entity: 'recruit', entityId: row.recruit_id, before: { kind: row.kind, file: row.file_name }, req });
  res.json({ message: 'File removed' });
}));

export default router;
