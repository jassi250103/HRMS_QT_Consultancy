-- ---------------------------------------------------------------- geofence and face recognition for attendance

-- Policy: office location and geofence radius (meters)
ALTER TABLE policy ADD COLUMN IF NOT EXISTS office_latitude numeric(9, 6);
ALTER TABLE policy ADD COLUMN IF NOT EXISTS office_longitude numeric(9, 6);
ALTER TABLE policy ADD COLUMN IF NOT EXISTS geofence_radius_meters integer DEFAULT 100 CHECK (geofence_radius_meters >= 10 AND geofence_radius_meters <= 5000);

COMMENT ON COLUMN policy.office_latitude IS 'Office latitude for geofenced attendance';
COMMENT ON COLUMN policy.office_longitude IS 'Office longitude for geofenced attendance';
COMMENT ON COLUMN policy.geofence_radius_meters IS 'Allowed radius in meters from office for marking attendance';

-- Staff: face embedding for biometric verification
ALTER TABLE staff ADD COLUMN face_embedding jsonb;
ALTER TABLE staff ADD COLUMN face_enrolled_at timestamptz;

COMMENT ON COLUMN staff.face_embedding IS 'Stored face feature vector for verification';
COMMENT ON COLUMN staff.face_enrolled_at IS 'Timestamp of last face enrollment';

-- Attendance: capture location and face verification result
ALTER TABLE attendance ADD COLUMN marked_latitude numeric(9, 6);
ALTER TABLE attendance ADD COLUMN marked_longitude numeric(9, 6);
ALTER TABLE attendance ADD COLUMN distance_meters integer;
ALTER TABLE attendance ADD COLUMN face_verified boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN attendance.marked_latitude IS 'Latitude where attendance was marked';
COMMENT ON COLUMN attendance.marked_longitude IS 'Longitude where attendance was marked';
COMMENT ON COLUMN attendance.distance_meters IS 'Distance from office in meters';
COMMENT ON COLUMN attendance.face_verified IS 'Whether face verification succeeded';

-- Index for auditing location-based attendance
CREATE INDEX attendance_location_idx ON attendance (marked_latitude, marked_longitude) WHERE marked_latitude IS NOT NULL;
