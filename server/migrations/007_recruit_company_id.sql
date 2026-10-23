-- The company-assigned Recruiter ID (recruit.code) is now the main identifier shown to users.
-- Keep an auto-increasing RCT reference internally for DB management, hidden from the form.
ALTER TABLE recruit ADD COLUMN sys_code text;

-- Recruits whose current code is an auto RCT keep that value as their system reference.
UPDATE recruit SET sys_code = code WHERE code ~ '^RCT-[0-9]+$';

-- Rows with a manual employment code get a fresh, sequence-backed system reference.
UPDATE recruit SET sys_code = 'RCT-' || nextval('recruit_code_seq') WHERE sys_code IS NULL;

ALTER TABLE recruit ALTER COLUMN sys_code SET NOT NULL;
ALTER TABLE recruit ALTER COLUMN sys_code SET DEFAULT 'RCT-' || nextval('recruit_code_seq');
ALTER TABLE recruit ADD CONSTRAINT recruit_sys_code_key UNIQUE (sys_code);
