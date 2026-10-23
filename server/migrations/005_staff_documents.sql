-- Staff HR documents: same shape as recruit_document, owned by a staff member.

CREATE TABLE staff_document (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id     uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('offer_letter', 'appointment_letter', 'id_proof', 'resume', 'other')),
  file_name    text NOT NULL,
  size_bytes   integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  stored_path  text NOT NULL,
  uploaded_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, kind)
);

CREATE INDEX staff_document_staff_idx ON staff_document (staff_id);
