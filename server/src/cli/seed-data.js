/* seed-data.js — the demo fixture for `npm run db:seed`.
 *
 * This file is the server's own copy: the browser no longer ships mock data,
 * so `node src/cli/seed.js` reads this module instead of js/data.js.
 * Dates are relative to the day the seed runs so the demo always looks current.
 */

const DAY = 864e5;

function ago(days) {
  const date = new Date(Date.now() - days * DAY);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function monthOf(offset) {
  const now = new Date();
  const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export const demoPassword = 'Staffing@2026';

export const policy = {
  lateAfter: '09:30',
  noticeDays: 7,
  targetDefault: 20,
  passwordMinLength: 10,
};

export const master = {
  companies: [
    'Aster Logistics LLP',
    'BrightEdge Retail Pvt Ltd',
    'Cobalt Facilities Services',
    'DigiNova Tech Solutions',
    'Everest Manufacturing Co.',
  ],
  roles: [
    'Warehouse Associate',
    'Delivery Executive',
    'Retail Sales Associate',
    'Facility Executive',
    'Data Entry Operator',
    'Forklift Operator',
    'Admin Assistant',
    'Customer Support Executive',
  ],
  cities: ['Bengaluru', 'Hyderabad', 'Pune', 'Chennai', 'Delhi NCR', 'Mumbai', 'Ahmedabad', 'Coimbatore'],
  hubs: [
    'Bengaluru · Hoskote Hub',
    'Hyderabad · Medchal Hub',
    'Pune · Chakan Hub',
    'Chennai · Oragadam Hub',
    'Delhi NCR · Manesar Hub',
    'Mumbai · Bhiwandi Hub',
  ],
  hrs: ['Kavita Menon', 'Rohit Bansal', 'Sneha Pillai', 'Arjun Mathew'],
  deactivation_reasons: [
    'Resigned',
    'Terminated',
    'Absconded',
    'Contract Ended',
    'Client Requirement Ended',
    'Other',
  ],
  leave_reasons: [
    'Casual leave',
    'Sick leave',
    'Personal work',
    'Family function',
    'Bank or documentation work',
    'Other',
  ],
  resignation_reasons: [
    'Personal reasons',
    'Joined another organisation',
    'Career change',
    'Relocation',
    'Health',
    'Better compensation',
    'Role mismatch',
    'Other',
  ],
};

const internalCompany = 'QT Consultancy';

export const staff = [
  {
    employeeCode: 'REC-0417', key: 'ananya-rao', name: 'Ananya Rao',
    designation: 'Executive Recruiter', role: 'recruiter', reportsTo: 'sanjay-iyer',
    gender: 'Female', dob: ago(10580), mobile: '98860 12470',
    email: 'ananya.rao@qtconsultancy.in', address: 'Flat 12, Sai Residency, 4th Cross, Koramangala 2nd Block, Bengaluru 560034',
    doj: ago(890), city: 'Bengaluru', hub: 'Bengaluru · Hoskote Hub', location: 'Bengaluru · Hoskote Hub',
    teamNote: '4 sourcing associates support your pipeline',
    mandate: 'Bengaluru + Hyderabad client cluster, contract staffing fulfilment.',
    hr: 'Kavita Menon', cluster: 'Bengaluru + Hyderabad',
  },
  {
    employeeCode: 'REC-0362', key: 'vikram-desai', name: 'Vikram Desai',
    designation: 'Senior Recruiter', role: 'recruiter', reportsTo: 'sanjay-iyer',
    gender: 'Male', dob: ago(11240), mobile: '98860 55913',
    email: 'vikram.desai@qtconsultancy.in', address: 'Site 4, Shriram Silveroak, Hebbal, Bengaluru 560064',
    doj: ago(1490), city: 'Bengaluru', hub: 'Bengaluru · Peenya Hub', location: 'Bengaluru · Peenya Hub',
    teamNote: '2 sourcing associates',
    mandate: 'Warehouse and last-mile roles for the retail vertical.',
    hr: 'Kavita Menon', cluster: 'Bengaluru warehouse + last-mile',
  },
  {
    employeeCode: 'REC-0488', key: 'neha-kulkarni', name: 'Neha Kulkarni',
    designation: 'Recruiter', role: 'recruiter', reportsTo: 'sanjay-iyer',
    gender: 'Female', dob: ago(9460), mobile: '98480 22716',
    email: 'neha.kulkarni@qtconsultancy.in', address: 'Flat 302, Apramey Meadows, Kukatpally, Hyderabad 500072',
    doj: ago(610), city: 'Hyderabad', hub: 'Hyderabad · Kukatpally Hub', location: 'Hyderabad · Kukatpally Hub',
    teamNote: '1 sourcing associate',
    mandate: 'BFSK and collections roles for the South region.',
    hr: 'Rohit Bansal', cluster: 'Hyderabad BFSK + collections',
  },
  {
    employeeCode: 'EMP-0119', key: 'sanjay-iyer', name: 'Sanjay Iyer',
    designation: 'Delivery Manager — GCC Region', role: 'manager', reportsTo: 'rajeev-nair',
    gender: 'Male', dob: ago(13140), mobile: '98200 44176',
    email: 'sanjay.iyer@qtconsultancy.in', address: 'Unit 7, Meridiana Towers, Lower Parel Agasar, Mumbai 400013',
    doj: ago(1980), city: 'Mumbai', hub: 'Mumbai · Andheri East', location: 'Mumbai · Andheri East',
    teamNote: '3 recruiters, 7 sourcing associates',
    mandate: 'GCC hiring delivery across Bengaluru, Hyderabad and Mumbai clusters.',
    hr: 'Meera Krishnan', cluster: 'Bengaluru, Hyderabad + Mumbai (GCC)',
  },
  {
    employeeCode: 'EMP-0042', key: 'meera-krishnan', name: 'Meera Krishnan',
    designation: 'Head of HR', role: 'hr_admin', reportsTo: 'rajeev-nair',
    gender: 'Female', dob: ago(13870), mobile: '98200 31104',
    email: 'meera.krishnan@qtconsultancy.in', address: 'Unit 11, Wadia Lands, Mahim, Mumbai 400016',
    doj: ago(2930), city: 'Mumbai', hub: 'Mumbai · Andheri East', location: 'Mumbai · Andheri East',
    teamNote: '6 HR partners, including Kavita Menon',
    mandate: 'People policy, compliance and staffing partner to the delivery lines.',
    hr: 'Kavita Menon', cluster: 'Company-wide people and compliance',
  },
  {
    employeeCode: 'EMP-0031', key: 'rajeev-nair', name: 'Rajeev Nair',
    designation: 'Director — Staffing Services', role: 'manager', reportsTo: null,
    gender: 'Male', dob: ago(15980), mobile: '98200 70011',
    email: 'rajeev.nair@qtconsultancy.in', address: 'Unit 3, Lower Parel Trade Centre, Mumbai 400013',
    doj: ago(3740), city: 'Mumbai', hub: 'Mumbai · Lower Parel', location: 'Mumbai · Lower Parel',
    teamNote: 'Delivery and People lines report in',
    mandate: 'Staffing P&L for the GCC and retail verticals.',
    hr: 'Kavita Menon', cluster: 'Business unit',
  },
];

/* Rajeev Nair sits in the hierarchy without a login so the admin can create one. */
export const accounts = {
  'ananya-rao': { loginId: 'ananya.rao', mustChange: false, locked: false, lastLoginDays: 1 },
  'vikram-desai': { loginId: 'vikram.desai', mustChange: false, locked: false, lastLoginDays: 2 },
  'neha-kulkarni': { loginId: 'neha.kulkarni', mustChange: false, locked: false, lastLoginDays: 1 },
  'sanjay-iyer': { loginId: 'sanjay.iyer', mustChange: false, locked: false, lastLoginDays: 0 },
  'meera-krishnan': { loginId: 'meera.krishnan', mustChange: false, locked: false, lastLoginDays: 0 },
};

const doc = (fileName, size) => ({ name: fileName, size });

/* Owners are matched by employee code so the seed never hardcodes a uuid. */
export const recruits = [
  {
    code: 'RCT-1188', name: 'Rakesh Kumar Yadav', gender: 'Male', dob: ago(8120),
    mobile: '98451 20377', email: 'rakesh.yadav188@mailbox.in', address: 'Plot 42, Hoskote Industrial Layout, Bengaluru 562110',
    company: 'Aster Logistics LLP', role: 'Warehouse Associate', hr: 'Kavita Menon', doj: ago(0),
    city: 'Bengaluru', hub: 'Bengaluru · Hoskote Hub', owner: 'ananya-rao',
    docs: { aadhaar: doc('aadhaar_rakesh_1188.pdf', 384120), resume: doc('rakesh_yadav_resume.pdf', 621500) },
  },
  {
    code: 'RCT-1187', name: 'Sana Farheen', gender: 'Female', dob: ago(7740),
    mobile: '99014 55820', email: 'sana.farheen1187@mailbox.in', address: 'Line 7, Whitefield Road, Bengaluru 560066',
    company: 'BrightEdge Retail Pvt Ltd', role: 'Retail Sales Associate', hr: 'Sneha Pillai', doj: ago(0),
    city: 'Bengaluru', hub: 'Bengaluru · Hoskote Hub', owner: 'ananya-rao',
    docs: { pan: doc('pan_sana_1187.jpg', 254310) },
  },
  {
    code: 'RCT-1186', name: 'Deepak Chauhan', gender: 'Male', dob: ago(9130),
    mobile: '97394 11208', email: 'deepak.chauhan1186@mailbox.in', address: 'Ramanthapur Village, Kothaguda, Hyderabad 500055',
    company: 'Cobalt Facilities Services', role: 'Facility Executive', hr: 'Rohit Bansal', doj: ago(2),
    city: 'Hyderabad', hub: 'Hyderabad · Medchal Hub', owner: 'ananya-rao',
  },
  {
    code: 'RCT-1185', name: 'Manisha Pawar', gender: 'Female', dob: ago(7305),
    mobile: '98220 44176', email: 'manisha.pawar1185@mailbox.in', address: 'S. No. 88, Chakan Gaon Road, Pune 410501',
    company: 'Everest Manufacturing Co.', role: 'Data Entry Operator', hr: 'Arjun Mathew', doj: ago(4),
    city: 'Pune', hub: 'Pune · Chakan Hub', owner: 'ananya-rao',
    docs: { resume: doc('manisha_pawar_cv.docx', 92400) },
  },
  {
    code: 'RCT-1184', name: 'Arjun Reddy Gopu', gender: 'Male', dob: ago(8600),
    mobile: '90003 76512', email: 'arjun.reddy1184@mailbox.in', address: 'Flat 3B, Medchal Main Road, Hyderabad 501401',
    company: 'DigiNova Tech Solutions', role: 'Customer Support Executive', hr: 'Kavita Menon', doj: ago(5),
    city: 'Hyderabad', hub: 'Hyderabad · Medchal Hub', owner: 'ananya-rao',
  },
  {
    code: 'RCT-1179', name: 'Priyanka Shinde', gender: 'Female', dob: ago(8050),
    mobile: '98675 30214', email: 'priyanka.shinde1179@mailbox.in', address: 'Bhiwandi Ring Road, Thane 421302',
    company: 'Aster Logistics LLP', role: 'Delivery Executive', hr: 'Rohit Bansal', doj: ago(3),
    city: 'Mumbai', hub: 'Mumbai · Bhiwandi Hub', owner: 'vikram-desai',
    docs: { aadhaar: doc('aadhaar_priyanka.pdf', 402180), passbook: doc('passbook_priyanka.jpg', 318770) },
  },
  {
    code: 'RCT-1172', name: 'Mohammed Ashif', gender: 'Male', dob: ago(7560),
    mobile: '94480 12093', email: 'ashif.md1172@mailbox.in', address: 'Opp. Oragadam Gate 4, Sriperumbudur, Chennai 602105',
    company: 'Everest Manufacturing Co.', role: 'Forklift Operator', hr: 'Arjun Mathew', doj: ago(9),
    city: 'Chennai', hub: 'Chennai · Oragadam Hub', owner: 'vikram-desai',
    docs: { pan: doc('pan_ashif.pdf', 210450) },
  },
  {
    code: 'RCT-1168', name: 'Kavya Nambiar', gender: 'Female', dob: ago(7120),
    mobile: '95670 88341', email: 'kavya.nambiar1168@mailbox.in', address: 'Saibaba Colony, Race Course Road, Coimbatore 641012',
    company: 'BrightEdge Retail Pvt Ltd', role: 'Retail Sales Associate', hr: 'Sneha Pillai', doj: ago(16),
    city: 'Coimbatore', hub: 'Chennai · Oragadam Hub', owner: 'neha-kulkarni',
  },
  {
    code: 'RCT-1161', name: 'Suresh Patel', gender: 'Male', dob: ago(10230),
    mobile: '97250 41188', email: 'suresh.patel1161@mailbox.in', address: 'Odhav Estate, Sanand, Ahmedabad 382110',
    company: 'Cobalt Facilities Services', role: 'Admin Assistant', hr: 'Kavita Menon', doj: ago(24),
    city: 'Ahmedabad', hub: 'Delhi NCR · Manesar Hub', owner: 'vikram-desai',
    docs: { aadhaar: doc('aadhaar_suresh.jpg', 344120), resume: doc('suresh_patel_resume.pdf', 588010) },
  },
  {
    code: 'RCT-1154', name: 'Anjali Verma', gender: 'Female', dob: ago(7880),
    mobile: '98110 66245', email: 'anjali.verma1154@mailbox.in', address: 'Sector 18A, Noida 201301',
    company: 'DigiNova Tech Solutions', role: 'Data Entry Operator', hr: 'Rohit Bansal', doj: ago(33),
    city: 'Delhi NCR', hub: 'Delhi NCR · Manesar Hub', owner: 'neha-kulkarni',
    status: 'not_active', reason: 'Resigned', remarks: 'Joined a direct client role in NCR', closedDays: 21,
  },
  {
    code: 'RCT-1147', name: 'Vikram Singh Rathore', gender: 'Male', dob: ago(9470),
    mobile: '99975 20431', email: 'vikram.rathore1147@mailbox.in', address: 'Manesar Udyog Vihar Phase 3, Gurugram 122013',
    company: 'Aster Logistics LLP', role: 'Warehouse Associate', hr: 'Sneha Pillai', doj: ago(45),
    city: 'Delhi NCR', hub: 'Delhi NCR · Manesar Hub', owner: 'neha-kulkarni',
    docs: {
      aadhaar: doc('aadhaar_vikram.pdf', 415220), pan: doc('pan_vikram.pdf', 231090),
      resume: doc('vikram_cv.pdf', 712300), passbook: doc('vikram_passbook.jpg', 298110),
    },
  },
  {
    code: 'RCT-1139', name: 'Lakshmi Devi R', gender: 'Female', dob: ago(11020),
    mobile: '98860 70912', email: 'lakshmi.devi1139@mailbox.in', address: 'Kormangala 5th Block, Bengaluru 560095',
    company: 'BrightEdge Retail Pvt Ltd', role: 'Customer Support Executive', hr: 'Arjun Mathew', doj: ago(58),
    city: 'Bengaluru', hub: 'Bengaluru · Hoskote Hub', owner: 'ananya-rao',
  },
  {
    code: 'RCT-1131', name: 'Imran Sheikh', gender: 'Male', dob: ago(8740),
    mobile: '96650 31277', email: 'imran.sheikh1131@mailbox.in', address: 'Phasa Village, Talwade, Pune 411062',
    company: 'Everest Manufacturing Co.', role: 'Facility Executive', hr: 'Kavita Menon', doj: ago(71),
    city: 'Pune', hub: 'Pune · Chakan Hub', owner: 'vikram-desai',
    status: 'not_active', reason: 'Contract Ended', remarks: '', closedDays: 52,
  },
  {
    code: 'RCT-1124', name: 'Tejas Kulkarni', gender: 'Male', dob: ago(6980),
    mobile: '90110 24588', email: 'tejas.kulkarni1124@mailbox.in', address: 'Kondhwa Budruk, Pune 411014',
    company: 'Cobalt Facilities Services', role: 'Delivery Executive', hr: 'Rohit Bansal', doj: ago(84),
    city: 'Pune', hub: 'Pune · Chakan Hub', owner: 'neha-kulkarni',
    docs: { resume: doc('tejas_kulkarni_resume.pdf', 641230) },
  },
  {
    code: 'RCT-1116', name: 'Farhan Qureshi', gender: 'Male', dob: ago(9220),
    mobile: '97012 55640', email: 'farhan.qureshi1116@mailbox.in', address: 'Kompally Gate, Medchal, Hyderabad 501401',
    company: 'DigiNova Tech Solutions', role: 'Warehouse Associate', hr: 'Sneha Pillai', doj: ago(96),
    city: 'Hyderabad', hub: 'Hyderabad · Medchal Hub', owner: 'ananya-rao',
    status: 'not_active', reason: 'Absconded', remarks: 'Unreachable since 12 days after joining', closedDays: 70,
  },
  {
    code: 'RCT-1108', name: 'Divya Bharathi S', gender: 'Female', dob: ago(7640),
    mobile: '94440 18206', email: 'divya.bharathi1108@mailbox.in', address: 'Ambattur Industrial Estate, Chennai 600058',
    company: 'Aster Logistics LLP', role: 'Admin Assistant', hr: 'Arjun Mathew', doj: ago(110),
    city: 'Chennai', hub: 'Chennai · Oragadam Hub', owner: 'vikram-desai',
    docs: { aadhaar: doc('aadhaar_divya.pdf', 398110), passbook: doc('divya_passbook.pdf', 442180) },
  },
  {
    code: 'RCT-1097', name: 'Nikhil Joshi', gender: 'Male', dob: ago(8410),
    mobile: '98201 33476', email: 'nikhil.joshi1097@mailbox.in', address: 'Talegaon Dabhade Road, Pune 410506',
    company: 'Everest Manufacturing Co.', role: 'Forklift Operator', hr: 'Kavita Menon', doj: ago(125),
    city: 'Pune', hub: 'Pune · Chakan Hub', owner: 'vikram-desai',
  },
  {
    code: 'RCT-1085', name: 'Ritika Sen', gender: 'Female', dob: ago(6890),
    mobile: '98305 77421', email: 'ritika.sen1085@mailbox.in', address: 'Salt Lake Sector V, Kolkata 700091',
    company: 'BrightEdge Retail Pvt Ltd', role: 'Retail Sales Associate', hr: 'Rohit Bansal', doj: ago(141),
    city: 'Mumbai', hub: 'Mumbai · Bhiwandi Hub', owner: 'ananya-rao',
    status: 'not_active', reason: 'Client Requirement Ended', remarks: 'Client closed the Bhiwandi counter', closedDays: 96,
  },
];

/* Attendance rows for the last three working weeks, newest day left unmarked. */
const attendancePlans = {
  'ananya-rao': ['Present', 'Present', 'Leave', 'Present', 'Absent', 'Present', 'Present', 'Present', 'Leave', 'Present', 'Absent', 'Present', 'Present', 'Present', 'Present'],
  'vikram-desai': ['Present', 'Present', 'Present', 'Absent', 'Present', 'Leave', 'Present', 'Present', 'Present', 'Present', 'Absent', 'Present', 'Leave', 'Present', 'Present'],
  'neha-kulkarni': ['Present', 'Leave', 'Present', 'Present', 'Present', 'Absent', 'Present', 'Leave', 'Present', 'Present', 'Present', 'Present', 'Absent', 'Present', 'Present'],
  'sanjay-iyer': ['Present', 'Present', 'Present', 'Present', 'Leave', 'Present', 'Absent', 'Present', 'Present', 'Present', 'Present', 'Leave', 'Present', 'Present', 'Present'],
};

const STATUS_TO_KEY = { Present: 'present', Absent: 'absent', Leave: 'leave' };

/* Working back from yesterday, skipping Sundays, so the newest mark is three days old. */
export function attendanceRows() {
  const rows = [];
  for (const [key, plan] of Object.entries(attendancePlans)) {
    let back = 1;
    let index = 0;
    while (index < plan.length) {
      const date = new Date(Date.now() - back * DAY);
      back += 1;
      if (date.getDay() === 0) continue;
      const status = plan[index];
      const mins = (7 + (index + 1) * 13) % 55;
      const hour = status === 'Present' && (index + 1) % 6 === 4 ? 10 : 9;
      rows.push({
        owner: key,
        date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`,
        status: STATUS_TO_KEY[status],
        loginTime: status === 'Present' ? `${String(hour).padStart(2, '0')}:${String(mins).padStart(2, '0')}` : null,
        // The three newest marks sit in the manager's queue.
        pending: index > plan.length - 4,
      });
      index += 1;
    }
  }
  return rows;
}

export const leaveRequests = [
  { owner: 'ananya-rao', date: ago(54), reason: 'Family function', status: 'accepted', appliedDays: 60, decidedDays: 57 },
  { owner: 'ananya-rao', date: ago(47), reason: 'Sick leave', status: 'accepted', appliedDays: 48, decidedDays: 47 },
  { owner: 'ananya-rao', date: ago(39), reason: 'Personal work', status: 'rejected', appliedDays: 43, decidedDays: 41 },
  { owner: 'ananya-rao', date: ago(28), reason: 'Casual leave', status: 'accepted', appliedDays: 31, decidedDays: 29 },
  { owner: 'ananya-rao', date: ago(16), reason: 'Bank or documentation work', status: 'rejected', appliedDays: 19, decidedDays: 18 },
  { owner: 'ananya-rao', date: ago(6), reason: 'Sick leave', status: 'accepted', appliedDays: 6, decidedDays: 5 },
  { owner: 'ananya-rao', date: ago(1), reason: 'Casual leave', status: 'applied', appliedDays: 2 },
  { owner: 'ananya-rao', date: ago(-3), reason: 'Personal work', status: 'applied', appliedDays: 0 },
  { owner: 'vikram-desai', date: ago(33), reason: 'Family function', status: 'accepted', appliedDays: 37, decidedDays: 35 },
  { owner: 'vikram-desai', date: ago(2), reason: 'Sick leave', status: 'applied', appliedDays: 3 },
  { owner: 'vikram-desai', date: ago(-5), reason: 'Casual leave', status: 'applied', appliedDays: 1 },
  { owner: 'neha-kulkarni', date: ago(21), reason: 'Personal work', status: 'rejected', appliedDays: 25, decidedDays: 23 },
  { owner: 'neha-kulkarni', date: ago(4), reason: 'Sick leave', status: 'accepted', appliedDays: 5, decidedDays: 4 },
  { owner: 'neha-kulkarni', date: ago(-1), reason: 'Bank or documentation work', status: 'applied', appliedDays: 0 },
];

export const resignationFilings = [
  {
    owner: 'vikram-desai',
    noticeDate: ago(4),
    requestedLastDay: ago(-3),
    reason: 'Joined another organisation',
    remarks: 'Two open mandates to hand over',
    status: 'notice_accepted',
    filedDays: 4,
  },
];

export const targets = {
  [monthOf(0)]: { 'ananya-rao': 20, 'vikram-desai': 24, 'neha-kulkarni': 18 },
  [monthOf(-1)]: { 'ananya-rao': 18, 'vikram-desai': 22, 'neha-kulkarni': 20 },
};

export const internal = { company: internalCompany };
export { ago, monthOf };
