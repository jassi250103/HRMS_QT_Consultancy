import { one, query } from '../db.js';

let cached = null;

const MAP = {
  late_after: 'lateAfter',
  notice_days: 'noticeDays',
  target_default: 'targetDefault',
  password_min_length: 'passwordMinLength',
  max_failed_attempts: 'maxFailedAttempts',
  lock_minutes: 'lockMinutes',
  password_history: 'passwordHistory',
  office_latitude: 'officeLatitude',
  office_longitude: 'officeLongitude',
  geofence_radius_meters: 'geofenceRadiusMeters',
};

export async function getPolicy() {
  if (cached) return cached;
  const row = await one('SELECT * FROM policy WHERE id = true');
  if (!row) throw new Error('policy row missing — run the migrations');
  cached = Object.fromEntries(Object.entries(MAP).map(([from, to]) => [to, row[from]]));
  // Postgres returns time as HH:MM:SS; the portal and the tests compare against HH:MM.
  if (typeof cached.lateAfter === 'string' && /^\d{2}:\d{2}:\d{2}$/.test(cached.lateAfter)) {
    cached.lateAfter = cached.lateAfter.slice(0, 5);
  }
  return cached;
}

/* Only the admin endpoints change policy; everything else reads the cached copy. */
export async function putPolicy(next, client = null) {
  const text = `INSERT INTO policy (id, late_after, notice_days, target_default, password_min_length,
                    max_failed_attempts, lock_minutes, password_history, office_latitude, office_longitude, geofence_radius_meters, updated_by)
       VALUES (true, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       ON CONFLICT (id) DO UPDATE SET late_after = EXCLUDED.late_after, notice_days = EXCLUDED.notice_days,
         target_default = EXCLUDED.target_default, password_min_length = EXCLUDED.password_min_length,
         max_failed_attempts = EXCLUDED.max_failed_attempts, lock_minutes = EXCLUDED.lock_minutes,
         password_history = EXCLUDED.password_history, office_latitude = EXCLUDED.office_latitude,
         office_longitude = EXCLUDED.office_longitude, geofence_radius_meters = EXCLUDED.geofence_radius_meters,
         updated_by = EXCLUDED.updated_by, updated_at = now()
       RETURNING *`;
  const params = [next.lateAfter, next.noticeDays, next.targetDefault, next.passwordMinLength,
    next.maxFailedAttempts, next.lockMinutes, next.passwordHistory,
    next.officeLatitude || null, next.officeLongitude || null, next.geofenceRadiusMeters || null,
    next.updatedBy];
  const result = client ? await client.query(text, params) : await query(text, params);
  cached = null;
  return result.rows[0];
}

export function clearPolicyCache() {
  cached = null;
}

/* Haversine formula to calculate distance between two coordinates in meters */
export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth's radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/* Check if a coordinate is within the geofence */
export function isInGeofence(markedLat, markedLon, policy) {
  if (!policy.officeLatitude || !policy.officeLongitude || !markedLat || !markedLon) {
    return { inside: false, distance: null };
  }
  const distance = haversineDistance(
    parseFloat(policy.officeLatitude),
    parseFloat(policy.officeLongitude),
    parseFloat(markedLat),
    parseFloat(markedLon)
  );
  const radius = policy.geofenceRadiusMeters || 100;
  return { inside: distance <= radius, distance };
}
