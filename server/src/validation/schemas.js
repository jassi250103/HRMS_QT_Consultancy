import { z } from 'zod';

export const login = z.object({
  loginId: z.string().trim().min(3, 'Enter your login ID').max(80),
  password: z.string().min(1, 'Enter your password').max(200),
});

const dateOrNull = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullable().optional();
const time = z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM');
const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

const recruitCore = {
  name: z.string().trim().min(1, 'Name is required').max(120),
  gender: z.string().trim().max(20).optional(),
  dob: dateOrNull,
  mobile: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  status: z.enum(['active', 'not_active']).optional(),
  role: z.string().trim().max(80).optional(),
  company: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  hub: z.string().trim().max(80).optional(),
  hrContact: z.string().trim().max(120).optional(),
  doj: dateOrNull,
  ownerId: z.string().uuid().optional(),
  deactivationReason: z.string().trim().max(120).optional(),
  remarks: z.string().trim().max(1000).optional(),
  code: z.string().trim().min(1, 'Recruiter ID is required').max(50), // Company-assigned ID; the recruit's main identifier
};

export const recruitCreate = z.object(recruitCore).refine(
  (v) => v.status !== 'not_active' || (v.deactivationReason || '').length > 0,
  { path: ['deactivationReason'], message: 'Reason required' },
);

export const recruitUpdate = z.object(recruitCore).partial().refine(
  (v) => v.status !== 'not_active' || (v.deactivationReason || '').length > 0,
  { path: ['deactivationReason'], message: 'Reason required' },
);

export const staffCreate = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  designation: z.string().trim().max(120).optional(),
  role: z.enum(['recruiter', 'manager', 'hr_admin']),
  managerId: z.string().uuid().nullable().optional(),
  location: z.string().trim().max(120).optional(),
  hub: z.string().trim().max(80).optional(),
  city: z.string().trim().max(80).optional(),
  teamNote: z.string().trim().max(240).optional(),
  mandate: z.string().trim().max(240).optional(),
  gender: z.string().trim().max(20).optional(),
  dob: dateOrNull,
  mobile: z.string().trim().max(20).optional(),
  email: z.string().trim().max(120).optional(),
  address: z.string().trim().max(400).optional(),
  doj: dateOrNull,
  hr: z.string().trim().max(120).optional(),
  cluster: z.string().trim().max(240).optional(),
});

export const staffUpdate = staffCreate.partial();

/* The login ID is usually derived from the name, so the admin can omit it. */
export const provision = z.object({
  loginId: z.string().trim().min(3).max(80).regex(/^[a-z0-9._@-]+$/i, 'Login ID may not contain spaces').optional(),
});

/* Length rules live in the policy row, so validation here only requires a value. */
export const passwordChange = z.object({
  currentPassword: z.string().min(1, 'Enter the current password').max(200),
  newPassword: z.string().min(1, 'Enter the new password').max(200),
});

export const adminReset = z.object({
  newPassword: z.string().min(1, 'Enter the new password').max(200).optional(),
});

export const attendanceMark = z.object({
  staffId: z.string().uuid().optional(),
  workDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  status: z.enum(['present', 'absent', 'leave']),
  loginTime: time.nullable().optional(),
  remarks: z.string().trim().max(400).optional(),
  latitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  longitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  faceDescriptor: z.array(z.number()).length(128).optional(), // 128-dim facial descriptor array
  overrideReason: z.string().trim().min(1, 'Select an override reason').max(240).optional(),
});

export const decision = z.object({
  decision: z.enum(['accepted', 'rejected']),
  remarks: z.string().trim().max(400).optional(),
});

export const leaveApply = z.object({
  staffId: z.string().uuid().optional(),
  leaveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  reason: z.string().trim().min(1, 'Select a reason').max(120),
  remarks: z.string().trim().max(400).optional(),
});

export const resignationFile = z.object({
  staffId: z.string().uuid().optional(),
  reason: z.string().trim().min(1, 'Select a reason').max(120),
  noticeDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  requestedLastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date'),
  remarks: z.string().trim().max(400).optional(),
});

export const resignationDecision = z.object({
  decision: z.enum(['notice_accepted', 'accepted', 'rejected']),
  lastDay: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  remarks: z.string().trim().max(400).optional(),
});

export const targetSet = z.object({
  staffId: z.string().uuid(),
  month,
  target: z.coerce.number().int().min(0).max(500),
});

export const masterCreate = z.object({
  kind: z.enum(['companies', 'roles', 'cities', 'hubs', 'hrs', 'deactivation_reasons', 'leave_reasons', 'resignation_reasons']),
  value: z.string().trim().min(1, 'Enter a value').max(120),
});

export const masterRename = z.object({ value: z.string().trim().min(1, 'Enter a value').max(120) });

export const masterRetire = z.object({ active: z.boolean() });

export const policyUpdate = z.object({
  lateAfter: time,
  noticeDays: z.coerce.number().int().min(0).max(120),
  targetDefault: z.coerce.number().int().min(0).max(500),
  passwordMinLength: z.coerce.number().int().min(8).max(64),
  maxFailedAttempts: z.coerce.number().int().min(3).max(20),
  lockMinutes: z.coerce.number().int().min(1).max(1440),
  passwordHistory: z.coerce.number().int().min(0).max(24),
  officeLatitude: z.coerce.number().min(-90).max(90).optional().nullable(),
  officeLongitude: z.coerce.number().min(-180).max(180).optional().nullable(),
  geofenceRadiusMeters: z.coerce.number().int().min(10).max(5000).optional().nullable(),
});

const sheetRowImport = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120),
  mobile: z.string().trim().min(4, 'Mobile is required').max(20),
  detail: z.string().trim().max(240).optional(),
});

export const sheetCreate = z.object({
  name: z.string().trim().min(1, 'Sheet name is required').max(120),
  note: z.string().trim().max(400).optional(),
  recruiterIds: z.array(z.string().uuid()).min(1, 'Assign at least one recruiter').max(50),
  rows: z.array(sheetRowImport).min(1, 'Add at least one contact').max(5000),
});

export const sheetRowsAppend = z.object({
  rows: z.array(sheetRowImport).min(1, 'Add at least one contact').max(5000),
});

export const sheetAssign = z.object({
  recruiterIds: z.array(z.string().uuid()).min(1, 'Pick at least one recruiter').max(50),
});

export const sheetStatusUpdate = z.object({ status: z.enum(['open', 'closed']) });

export const sheetEntryUpdate = z.object({
  status: z.enum(['new', 'no_answer', 'interested', 'interviewed', 'not_interested', 'wrong_number']).optional(),
  remarks: z.string().trim().max(1000).optional(),
});

export const sheetConvert = z.object({
  role: z.string().trim().max(80).optional(),
  company: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  hub: z.string().trim().max(80).optional(),
  hrContact: z.string().trim().max(120).optional(),
  doj: dateOrNull,
  remarks: z.string().trim().max(1000).optional(),
});
