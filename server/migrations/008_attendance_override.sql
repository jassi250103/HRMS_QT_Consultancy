-- ------------------------------------------------- manual attendance override (face/geofence backup path)
-- When a person cannot verify by face (camera broken, not enrolled, repeated failures),
-- the direct manager or HR Admin may mark for them with a recorded reason.

ALTER TABLE attendance ADD COLUMN manual_override boolean NOT NULL DEFAULT false;
ALTER TABLE attendance ADD COLUMN override_reason text;

COMMENT ON COLUMN attendance.manual_override IS 'Marked by manager/admin as a fallback because face/geofence verification was unavailable';
COMMENT ON COLUMN attendance.override_reason IS 'Reason recorded for a manual override mark';
