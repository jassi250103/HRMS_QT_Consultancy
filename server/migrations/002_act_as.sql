-- HR Admin impersonation sessions. acting_id names the admin behind a session whose staff_id
-- is the person being viewed; it is NULL for a normal sign-in.
ALTER TABLE refresh_session ADD COLUMN acting_id uuid REFERENCES staff(id) ON DELETE SET NULL;

CREATE INDEX refresh_session_acting_idx ON refresh_session (acting_id) WHERE acting_id IS NOT NULL;
