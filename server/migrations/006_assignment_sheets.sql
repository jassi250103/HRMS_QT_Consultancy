-- 006_assignment_sheets.sql — Calling sheets that replace the WhatsApp sheet + paper diary.
-- A sheet is a list of candidates; it is assigned to one or more recruiters IN FULL.
-- Each recruiter works their own copy: status lives on sheet_entry, one row per (candidate, recruiter).

CREATE TABLE assignment_sheet (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  note        text NOT NULL DEFAULT '',
  status      text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  created_by  uuid NOT NULL REFERENCES staff(id) ON DELETE RESTRICT,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE sheet_row (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id    uuid NOT NULL REFERENCES assignment_sheet(id) ON DELETE CASCADE,
  name        text NOT NULL,
  mobile      text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  -- Joining is a fact about the candidate, not about one recruiter's copy.
  recruit_id  uuid REFERENCES recruit(id) ON DELETE SET NULL,
  joined_by   uuid REFERENCES staff(id) ON DELETE SET NULL,
  joined_at   timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  -- Mobile is stored normalized to 10 digits; one candidate appears once per sheet.
  CHECK (mobile ~ '^[0-9]{10}$'),
  UNIQUE (sheet_id, mobile)
);

CREATE INDEX sheet_row_sheet_idx ON sheet_row (sheet_id);
CREATE INDEX sheet_row_mobile_idx ON sheet_row (mobile);

CREATE TABLE sheet_entry (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  row_id       uuid NOT NULL REFERENCES sheet_row(id) ON DELETE CASCADE,
  recruiter_id uuid NOT NULL REFERENCES staff(id) ON DELETE CASCADE,
  status       text NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'no_answer', 'interested', 'interviewed', 'joined', 'not_interested', 'wrong_number')),
  remarks      text NOT NULL DEFAULT '',
  status_at    timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (row_id, recruiter_id)
);

CREATE INDEX sheet_entry_recruiter_idx ON sheet_entry (recruiter_id, status);
CREATE INDEX sheet_entry_row_idx ON sheet_entry (row_id);

-- The diary: every assignment and status move is recorded here.
CREATE TABLE sheet_activity (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sheet_id    uuid NOT NULL REFERENCES assignment_sheet(id) ON DELETE CASCADE,
  row_id      uuid REFERENCES sheet_row(id) ON DELETE CASCADE,
  actor_id    uuid REFERENCES staff(id) ON DELETE SET NULL,
  actor_name  text NOT NULL DEFAULT '',
  action      text NOT NULL,
  detail      text NOT NULL DEFAULT '',
  occurred_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sheet_activity_sheet_idx ON sheet_activity (sheet_id, occurred_at DESC);
CREATE INDEX sheet_activity_row_idx ON sheet_activity (row_id, occurred_at DESC);

CREATE TRIGGER assignment_sheet_touch BEFORE UPDATE ON assignment_sheet
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER sheet_entry_touch BEFORE UPDATE ON sheet_entry
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
