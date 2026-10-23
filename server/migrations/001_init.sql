-- 001_init.sql — QT Consultancy HRMS schema.
-- Roles are exactly three: recruiter, manager, hr_admin. Everything else is a status or a kind.

CREATE FUNCTION set_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------- people

CREATE TABLE staff (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_code  text NOT NULL UNIQUE,
  name           text NOT NULL,
  designation    text NOT NULL DEFAULT '',
  role           text NOT NULL CHECK (role IN ('recruiter', 'manager', 'hr_admin')),
  manager_id     uuid REFERENCES staff(id) ON DELETE RESTRICT,
  location       text NOT NULL DEFAULT '',
  hub            text NOT NULL DEFAULT '',
  city           text NOT NULL DEFAULT '',
  team_note      text NOT NULL DEFAULT '',
  mandate        text NOT NULL DEFAULT '',
  active         boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CHECK (manager_id IS NULL OR manager_id <> id)
);

CREATE INDEX staff_manager_idx ON staff (manager_id);

CREATE TRIGGER staff_touch BEFORE UPDATE ON staff
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Passwords are compared only. No view, endpoint or log line ever exposes password_hash.
CREATE TABLE staff_account (
  staff_id           uuid PRIMARY KEY REFERENCES staff(id) ON DELETE CASCADE,
  login_id           text NOT NULL,
  password_hash      text NOT NULL,
  must_change        boolean NOT NULL DEFAULT true,
  locked             boolean NOT NULL DEFAULT false,
  failed_attempts    integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until       timestamptz,
  password_updated_at timestamptz NOT NULL DEFAULT now(),
  created_by         uuid REFERENCES staff(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  last_login_at      timestamptz
);

CREATE UNIQUE INDEX staff_account_login_idx ON staff_account (lower(login_id));

CREATE TABLE password_history (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  staff_id       uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  password_hash  text NOT NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX password_history_staff_idx ON password_history (staff_id, created_at DESC);

CREATE TABLE refresh_session (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  token_hash  text NOT NULL UNIQUE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  revoked_at  timestamptz,
  replaced_by uuid,
  ip          text NOT NULL DEFAULT '',
  user_agent  text NOT NULL DEFAULT ''
);

CREATE INDEX refresh_session_staff_idx ON refresh_session (staff_id, expires_at DESC);

-- ---------------------------------------------------------------- recruits

CREATE TABLE recruit (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code                 text NOT NULL UNIQUE,
  name                 text NOT NULL,
  gender               text NOT NULL DEFAULT '',
  dob                  date,
  mobile               text NOT NULL DEFAULT '',
  email                text NOT NULL DEFAULT '',
  address              text NOT NULL DEFAULT '',
  status               text NOT NULL CHECK (status IN ('active', 'not_active')),
  role                 text NOT NULL DEFAULT '',
  company              text NOT NULL DEFAULT '',
  city                 text NOT NULL DEFAULT '',
  hub                  text NOT NULL DEFAULT '',
  hr_contact           text NOT NULL DEFAULT '',
  doj                  date,
  owner_id             uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  deactivation_reason  text NOT NULL DEFAULT '',
  remarks              text NOT NULL DEFAULT '',
  closed_by            uuid REFERENCES staff(id) ON DELETE SET NULL,
  closed_at            timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  -- Active -> Not Active is never allowed without a reason.
  CHECK (status = 'active' OR btrim(deactivation_reason) <> '')
);

CREATE INDEX recruit_owner_idx ON recruit (owner_id, status);
CREATE INDEX recruit_doj_idx ON recruit (doj DESC);
CREATE INDEX recruit_company_idx ON recruit (company);

CREATE TRIGGER recruit_touch BEFORE UPDATE ON recruit
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- Human-readable recruit codes keep the RCT-1234 shape the portal already shows.
CREATE SEQUENCE recruit_code_seq START 1189;

-- Uploads are optional by policy, so a recruit can legitimately have zero rows here.
CREATE TABLE recruit_document (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recruit_id   uuid NOT NULL REFERENCES recruit(id) ON DELETE CASCADE,
  kind         text NOT NULL CHECK (kind IN ('aadhaar', 'pan', 'resume', 'passbook')),
  file_name    text NOT NULL,
  size_bytes   integer NOT NULL DEFAULT 0 CHECK (size_bytes >= 0),
  content_type text NOT NULL DEFAULT 'application/octet-stream',
  stored_path  text NOT NULL,
  uploaded_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  uploaded_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (recruit_id, kind)
);

CREATE INDEX recruit_document_recruit_idx ON recruit_document (recruit_id);

-- ---------------------------------------------------------------- working rules

CREATE TABLE attendance (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  work_date   date NOT NULL,
  status      text NOT NULL CHECK (status IN ('present', 'absent', 'leave')),
  login_time  time,
  late        boolean NOT NULL DEFAULT false,
  marked_by   uuid REFERENCES staff(id) ON DELETE SET NULL,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  decision    text NOT NULL DEFAULT 'n/a' CHECK (decision IN ('n/a', 'pending', 'accepted', 'rejected')),
  decided_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  decided_at  timestamptz,
  remarks     text NOT NULL DEFAULT '',
  UNIQUE (staff_id, work_date)
);

CREATE INDEX attendance_date_idx ON attendance (work_date DESC);

CREATE TABLE leave_request (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  leave_date  date NOT NULL,
  reason      text NOT NULL,
  status      text NOT NULL DEFAULT 'applied' CHECK (status IN ('applied', 'accepted', 'rejected')),
  applied_at  timestamptz NOT NULL DEFAULT now(),
  decided_by  uuid REFERENCES staff(id) ON DELETE SET NULL,
  decided_at  timestamptz,
  remarks     text NOT NULL DEFAULT ''
);

CREATE INDEX leave_request_staff_idx ON leave_request (staff_id, leave_date DESC);

CREATE TABLE resignation (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id           uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  reason             text NOT NULL,
  notice_date        date NOT NULL,
  requested_last_day date NOT NULL,
  last_day           date,
  status             text NOT NULL DEFAULT 'filed'
    CHECK (status IN ('filed', 'notice_accepted', 'accepted', 'rejected', 'withdrawn')),
  filed_at           timestamptz NOT NULL DEFAULT now(),
  decided_by         uuid REFERENCES staff(id) ON DELETE SET NULL,
  decided_at         timestamptz,
  remarks            text NOT NULL DEFAULT ''
);

CREATE INDEX resignation_staff_idx ON resignation (staff_id, filed_at DESC);

-- Assigned by the HR Admin, one value per recruiter per month. Roll-ups are derived, never stored.
CREATE TABLE placement_target (
  staff_id    uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  month       char(7) NOT NULL,
  target      integer NOT NULL CHECK (target >= 0 AND target <= 500),
  assigned_by uuid REFERENCES staff(id) ON DELETE SET NULL,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (staff_id, month)
);

CREATE TABLE master_item (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind       text NOT NULL CHECK (kind IN (
    'companies', 'roles', 'cities', 'hubs', 'hrs',
    'deactivation_reasons', 'leave_reasons', 'resignation_reasons'
  )),
  value      text NOT NULL,
  active     boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  retired_at timestamptz,
  UNIQUE (kind, value)
);

CREATE INDEX master_item_kind_idx ON master_item (kind, active);

-- Single row; the portal reads it when it evaluates lateness, notice and password rules.
CREATE TABLE policy (
  id                  boolean PRIMARY KEY DEFAULT true CHECK (id),
  late_after          time NOT NULL DEFAULT '09:30',
  notice_days         integer NOT NULL DEFAULT 7 CHECK (notice_days >= 0),
  target_default      integer NOT NULL DEFAULT 20 CHECK (target_default >= 0),
  password_min_length integer NOT NULL DEFAULT 10 CHECK (password_min_length >= 8),
  max_failed_attempts integer NOT NULL DEFAULT 5 CHECK (max_failed_attempts >= 3),
  lock_minutes        integer NOT NULL DEFAULT 15 CHECK (lock_minutes >= 1),
  password_history    integer NOT NULL DEFAULT 3 CHECK (password_history >= 0),
  updated_by          uuid REFERENCES staff(id) ON DELETE SET NULL,
  updated_at          timestamptz NOT NULL DEFAULT now()
);

INSERT INTO policy (id) VALUES (true) ON CONFLICT DO NOTHING;

-- ---------------------------------------------------------------- audit

CREATE TABLE audit_log (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  actor_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  actor_name  text NOT NULL DEFAULT 'system',
  action      text NOT NULL,
  entity      text NOT NULL,
  entity_id   text NOT NULL DEFAULT '',
  before_data jsonb,
  after_data  jsonb,
  ip          text NOT NULL DEFAULT '',
  user_agent  text NOT NULL DEFAULT ''
);

CREATE INDEX audit_log_recent_idx ON audit_log (occurred_at DESC);
CREATE INDEX audit_log_entity_idx ON audit_log (entity, entity_id);

-- ---------------------------------------------------------------- helpers

-- The reporting line below a person, used for every manager scope check.
CREATE FUNCTION staff_descendants(root uuid) RETURNS TABLE (staff_id uuid, depth integer)
LANGUAGE sql STABLE AS $$
  WITH RECURSIVE line AS (
    SELECT s.id AS staff_id, 0 AS depth FROM staff s WHERE s.id = root
    UNION ALL
    SELECT st.id, line.depth + 1 FROM staff st JOIN line ON st.manager_id = line.staff_id
  )
  SELECT * FROM line;
$$;
