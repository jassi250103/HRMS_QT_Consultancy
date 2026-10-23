window.App = window.App || {};

/* data.js — static configuration plus the live workforce containers.
   Everything here is filled by state.js from the API; no demo records live in the browser any more. */
(function (A) {
  const U = A.utils;
  const internalCompany = 'QT Consultancy';

  const attendanceStatuses = ['Present', 'Absent', 'Leave'];
  const approvalStates = ['Pending', 'Accepted', 'Rejected'];
  const leaveStatuses = ['Applied', 'Accepted', 'Rejected'];

  const monthOf = (offset) => {
    const now = new Date();
    const date = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
  };

  /* ---------- Live containers ---------- */
  const orgMembers = [];
  const membersById = {};
  const people = {};

  const KIND = { hr_admin: 'admin', manager: 'manager', recruiter: 'recruiter' };
  const DEPT = { admin: 'People & Compliance', manager: 'Delivery', recruiter: 'Talent Acquisition' };

  const org = {
    selfId: null,
    members: orgMembers,
    byId: membersById,
    get(id) { return membersById[id] || null; },
    add(node) {
      if (membersById[node.id]) return org.replace(node);
      orgMembers.push(node);
      membersById[node.id] = node;
      return node;
    },
    replace(node) {
      const at = orgMembers.findIndex((m) => m.id === node.id);
      if (at === -1) return org.add(node);
      orgMembers[at] = node;
      membersById[node.id] = node;
      return node;
    },
    /* The member and every manager above them, nearest first. */
    chainOf(id) {
      const up = [];
      const seen = {};
      let node = membersById[id];
      while (node && !seen[node.id]) {
        seen[node.id] = true;
        up.push(node);
        node = node.reportsTo ? membersById[node.reportsTo] : null;
      }
      return up;
    },
    directReports(id) {
      return orgMembers.filter((node) => node.reportsTo === id);
    },
    /* Every member below this one, at any depth. */
    descendantsOf(id) {
      return orgMembers.filter((node) => {
        if (node.id === id) return false;
        let parent = node.reportsTo ? membersById[node.reportsTo] : null;
        while (parent) {
          if (parent.id === id) return true;
          parent = parent.reportsTo ? membersById[parent.reportsTo] : null;
        }
        return false;
      });
    },
    reportingLine(id) {
      const above = org.chainOf(id || org.selfId)[1];
      if (!above) return 'Not applicable';
      return `${above.name} — ${above.role.split(' — ')[0]}, ${above.dept}`;
    },
    /* One API response rebuilds the whole graph: directory rows in, hierarchy and people records out. */
    ingest(items) {
      orgMembers.length = 0;
      Object.keys(membersById).forEach((key) => { delete membersById[key]; });
      items.forEach((item) => {
        const kind = KIND[item.role] || 'recruiter';
        const node = {
          id: item.id,
          name: item.name,
          role: item.designation || item.name,
          dept: DEPT[kind],
          kind,
          reportsTo: item.managerId || null,
          employeeId: item.employeeCode,
          location: item.location || item.city || '—',
          teamNote: item.teamNote || '',
          mandate: item.mandate || '',
          metrics: null,
          active: item.active,
        };
        orgMembers.push(node);
        membersById[node.id] = node;
        people[node.id] = {
          id: node.id,
          kind,
          name: node.name,
          employeeId: node.employeeId,
          idLabel: kind === 'recruiter' ? 'Recruiter ID' : 'Employee ID',
          gender: item.gender || '—',
          dob: item.dob || '',
          mobile: item.mobile || '',
          email: item.email || '',
          address: item.address || '',
          doj: item.doj || '',
          role: node.role,
          hr: item.hr || '',
          company: internalCompany,
          city: item.city || '',
          hub: item.hub || '',
          cluster: item.cluster || '',
          personalVisible: !!item.personalVisible,
          activeRecruits: item.activeRecruits,
          totalRecruits: item.totalRecruits,
          loginId: item.loginId || '',
          hasAccount: !!item.hasAccount,
          locked: !!item.locked,
          mustChange: !!item.mustChange,
          lastLogin: U.dateKey(item.lastLoginAt),
          createdOn: U.dateKey(item.accountCreatedAt),
          createdBy: item.accountCreatedBy || '',
        };
      });
      return orgMembers;
    },
  };

  A.data = {
    internalCompany,
    attendanceStatuses,
    approvalStates,
    leaveStatuses,
    monthOf,
    people,
    org,
    approverFor(id) {
      const manager = org.chainOf(id)[1];
      return manager ? manager.name : 'HR';
    },
    docFields: [
      { key: 'aadhaar', label: 'Aadhaar' },
      { key: 'pan', label: 'PAN' },
      { key: 'resume', label: 'Resume' },
      { key: 'passbook', label: 'Passbook' },
    ],
    docAccept: '.pdf,.jpg,.jpeg,.png,.doc,.docx',
    docMaxBytes: 5 * 1024 * 1024,
    /* A file the browser holds back from the server until the record exists. */
    emptyDocs() {
      return { aadhaar: null, pan: null, resume: null, passbook: null };
    },
  };
})(window.App);
