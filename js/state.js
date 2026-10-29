window.App = window.App || {};

/* state.js — the live layer between the pages and the API.
 *
 * Pages read a synchronous snapshot (A.state.store) so the interface stays instant, and call
 * async writers that hit the server and refresh only the slice that changed. Field names are
 * adapted here once, so the pages never learn about the wire format.
 */
(function (A) {
  const U = A.utils;
  const api = A.api;

  const ACTIVE = 'Active';
  const INACTIVE = 'Not Active';
  const RETIRED = 'Retired';

  /* Every picklist the admin can maintain, and where its values are consumed. */
  const MASTER_KINDS = [
    { key: 'companies', column: 'companies', label: 'Client companies', singular: 'Company', field: 'company', source: 'recruits' },
    { key: 'roles', column: 'roles', label: 'Roles', singular: 'Role', field: 'role', source: 'recruits' },
    { key: 'cities', column: 'cities', label: 'Cities', singular: 'City', field: 'city', source: 'recruits' },
    { key: 'hubs', column: 'hubs', label: 'Hubs', singular: 'Hub', field: 'hub', source: 'recruits' },
    { key: 'hrs', column: 'hrs', label: 'HR partners', singular: 'HR partner', field: 'hr', source: 'recruits' },
    { key: 'deactivationReasons', column: 'deactivation_reasons', label: 'Deactivation reasons', singular: 'Reason', field: 'reason', source: 'recruits' },
    { key: 'leaveReasons', column: 'leave_reasons', label: 'Leave reasons', singular: 'Reason', field: 'reason', source: 'leaves' },
    { key: 'resignationReasons', column: 'resignation_reasons', label: 'Resignation reasons', singular: 'Reason', field: 'reason', source: 'resignations' },
  ];

  const BLANK_FILTERS = { dojFrom: '', dojTo: '', company: '', role: '', owner: 'All', status: 'All', search: '' };

  const session = { userId: null, signedIn: false, actor: null };

  const store = {
    recruits: [],
    pageRows: [],
    total: 0,
    attendance: [],
    leaves: [],
    resignations: [],
    master: {},
    policy: { lateAfter: '09:30', noticeDays: 7, targetDefault: 20, passwordMinLength: 10, maxFailedAttempts: 5, lockMinutes: 15, passwordHistory: 3 },
    staff: [],
    accounts: {},
    targets: { month: null, items: [], byStaff: {}, self: {}, rollup: {} },
    targetMonths: {},
    filters: Object.assign({}, BLANK_FILTERS),
    applied: Object.assign({}, BLANK_FILTERS),
    page: 1,
    pageSize: 8,
    loading: false,
  };

  const monthKey = () => U.todayKey().slice(0, 7);

  /* ---------- Adapters: wire format to the shape the pages already speak ---------- */

  const RECRUIT_SORT = { doj: 'doj', 'doj:desc': 'doj', name: 'name', company: 'company', created: 'created' };

  function shapeRecruit(row) {
    return Object.assign({}, row, {
      id: row.code,
      ref: row.uuid,
      reason: row.deactivationReason || row.reason || '',
      hr: row.hrContact || row.hr || '',
      statusKey: row.statusKey || (row.status === ACTIVE ? 'active' : 'not_active'),
      deactivatedOn: U.dateKey(row.deactivatedOn),
      deactivatedBy: row.deactivatedBy || '',
      doj: U.dateKey(row.doj),
      dob: U.dateKey(row.dob),
      createdOn: U.dateKey(row.createdAt),
      docs: Object.assign(A.data.emptyDocs(), row.documents || {}),
    });
  }

  const DAY_STATUS = { present: 'Present', absent: 'Absent', leave: 'Leave' };
  const DECISION_LABEL = { pending: 'Pending', accepted: 'Accepted', rejected: 'Rejected' };

  function shapeAttendance(row) {
    return {
      ref: row.id,
      ownerId: row.staffId,
      date: U.dateKey(row.workDate),
      status: DAY_STATUS[row.status] || 'Not marked',
      login: row.loginTime ? String(row.loginTime).slice(0, 5) : '',
      approval: DECISION_LABEL[row.decision] || '',
      decidedBy: row.decidedBy || row.signature || '',
      decidedOn: U.dateKey(row.decidedAt),
      markedBy: row.markedBy || '',
      remarks: row.remarks || '',
      manualOverride: !!row.manualOverride,
      overrideReason: row.overrideReason || '',
    };
  }

  const LEAVE_LABEL = { applied: 'Applied', accepted: 'Accepted', rejected: 'Rejected' };

  function shapeLeave(row, index) {
    return {
      ref: row.id,
      /* The database key is a uuid; the table shows a short, stable reference instead. */
      id: `LV-${String(row.id).replace(/-/g, '').slice(0, 4).toUpperCase()}`,
      index,
      ownerId: row.staffId,
      staffName: row.staffName,
      date: U.dateKey(row.leaveDate),
      reason: row.reason,
      status: LEAVE_LABEL[row.status] || 'Applied',
      remarks: row.remarks || '',
      appliedOn: U.dateKey(row.appliedAt),
      decidedBy: row.decidedBy || row.signature || '',
      decidedOn: U.dateKey(row.decidedAt),
    };
  }

  const EXIT = {
    filed: { status: 'Notice pending', release: 'Pending' },
    notice_accepted: { status: 'Notice running', release: 'Pending' },
    accepted: { status: 'Release accepted', release: 'Accepted' },
    rejected: { status: 'Release rejected', release: 'Rejected' },
    withdrawn: { status: 'Withdrawn', release: '—' },
  };

  function shapeResignation(row) {
    const stage = EXIT[row.status] || EXIT.filed;
    return {
      ref: row.id,
      ownerId: row.staffId,
      staffName: row.staffName,
      reason: row.reason,
      remarks: row.remarks || '',
      noticeStart: U.dateKey(row.noticeDate),
      lastWorkingDay: U.dateKey((row.status === 'accepted' ? row.lastDay : row.requestedLastDay) || row.noticeDate),
      requestedLastDay: U.dateKey(row.requestedLastDay),
      noticeDays: U.daysBetween(U.dateKey(row.noticeDate), U.dateKey(row.requestedLastDay)),
      status: stage.status,
      release: stage.release,
      key: row.status,
      decidedBy: row.decidedBy || row.signature || '',
      decidedOn: U.dateKey(row.decidedAt),
      filedAt: row.filedAt,
      filedOn: U.dateKey(row.filedAt),
    };
  }

  /* A staff row from the API is both a hierarchy node and, for the owner, a personal record. */
  function shapeStaff(row) {
    return Object.assign({}, row);
  }

  /* ---------- Loads ---------- */

  function loadActiveLists() {
    return api.get('/master/active').then((payload) => {
      if (!payload) {
        console.warn('loadActiveLists: received empty or invalid payload');
        return {};
      }
      MASTER_KINDS.forEach((kind) => {
        store.activeLists = store.activeLists || {};
        store.activeLists[kind.key] = payload[kind.column] || [];
      });
      return payload;
    });
  }

  function loadMaster() {
    return api.get('/master').then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadMaster: received empty or invalid payload');
        return store.master;
      }
      const next = {};
      MASTER_KINDS.forEach((kind) => {
        next[kind.key] = (payload.items[kind.column] || []).map((entry) => ({
          id: entry.id,
          name: entry.value,
          status: entry.active ? ACTIVE : RETIRED,
          useCount: entry.useCount,
          addedOn: U.dateKey(entry.created_at),
          retiredOn: entry.retired_at ? U.dateKey(entry.retired_at) : '',
        }));
      });
      store.master = next;
      return next;
    });
  }

  function loadPolicy() {
    return api.get('/policy').then((payload) => {
      store.policy = Object.assign({}, store.policy, payload);
      paintChrome();
      return store.policy;
    });
  }

  function loadStaff() {
    return api.get('/staff').then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadStaff: received empty or invalid payload');
        store.staff = [];
        return store.staff;
      }
      store.staff = payload.items.map(shapeStaff);
      A.data.org.ingest(store.staff);
      A.data.org.selfId = session.userId;
      store.accounts = {};
      store.staff.forEach((row) => {
        if (!row.loginId) return;
        store.accounts[row.id] = {
          loginId: row.loginId,
          mustChange: !!row.mustChange,
          locked: !!row.locked,
          createdOn: U.dateKey(row.accountCreatedAt),
          createdBy: row.accountCreatedBy || '',
          lastLogin: U.dateKey(row.lastLoginAt),
        };
      });
      return store.staff;
    });
  }

  /* The whole scoped list backs the aggregates; the table pages through the server separately. */
  function loadRecruits() {
    return api.get('/recruits?pageSize=1000&sort=doj').then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadRecruits: received empty or invalid payload');
        store.recruits = [];
        paintChrome();
        return store.recruits;
      }
      store.recruits = payload.items.map(shapeRecruit);
      paintChrome();
      return store.recruits;
    });
  }

  function recruitQuery(extra) {
    const f = Object.assign({}, store.applied, extra || {});
    const params = new URLSearchParams({ pageSize: String(store.pageSize), page: String(store.page), sort: RECRUIT_SORT.doj });
    if (f.search) params.set('q', f.search);
    if (f.status && f.status !== 'All') params.set('status', f.status);
    if (f.company) params.set('company', f.company);
    if (f.role) params.set('role', f.role);
    if (f.city) params.set('city', f.city);
    if (f.hub) params.set('hub', f.hub);
    if (f.owner && f.owner !== 'All') params.set('owner', f.owner);
    if (f.dojFrom) params.set('from', f.dojFrom);
    if (f.dojTo) params.set('to', f.dojTo);
    
    const queryString = params.toString();
    return `/recruits?${queryString}`;
  }

  function loadRecruitPage() {
    const query = recruitQuery();
    return api.get(query).then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadRecruitPage: received empty or invalid payload', payload);
        store.pageRows = [];
        store.total = 0;
        return { items: [], total: 0 };
      }
      store.pageRows = payload.items.map(shapeRecruit);
      store.total = payload.total;
      return payload;
    });
  }

  function exportQuery() {
    const params = new URLSearchParams(recruitQuery().split('?')[1]);
    params.set('page', '1');
    params.set('pageSize', '100000');
    return `/recruits/export.csv?${params.toString()}`;
  }

  function exportCsv() {
    return api.download(exportQuery(), `recruits-${U.todayKey()}.csv`);
  }

  const WINDOW_DAYS = 42;

  function windowStart() {
    return U.daysAgo(WINDOW_DAYS);
  }

  /* The server only stores marked days, so the unmarked ones are drawn here. */
  function fillUnmarked(days, ownerIds) {
    const have = {};
    days.forEach((d) => { have[`${d.ownerId}|${d.date}`] = true; });
    const out = days.slice();
    ownerIds.forEach((ownerId) => {
      for (let back = 0; back <= WINDOW_DAYS; back += 1) {
        const date = U.daysAgo(back);
        if (U.parseISO(date).getDay() === 0) continue;
        if (have[`${ownerId}|${date}`]) continue;
        out.push({ ref: null, ownerId, date, status: 'Not marked', login: '', approval: '', decidedBy: '', decidedOn: '', remarks: '' });
      }
    });
    return out;
  }

  function loadAttendance() {
    const from = windowStart();
    return Promise.all([
      api.get(`/attendance?from=${from}&to=${U.todayKey()}&limit=100`), // Load first 100 for cache
      api.get('/attendance/pending'),
    ]).then(([ranged, pending]) => {
      const rangedItems = (ranged && ranged.items) || [];
      const pendingItems = (pending && pending.items) || [];
      const seen = {};
      const rows = rangedItems.concat(pendingItems).filter((row) => {
        const key = row.id;
        if (seen[key]) return false;
        seen[key] = true;
        return true;
      }).map(shapeAttendance);
      store.attendance = fillUnmarked(rows, scopeIds());
      
      // Store pagination info if available
      if (ranged && ranged.pagination) {
        store.attendancePagination = ranged.pagination;
      }
      
      return store.attendance;
    });
  }
  
  // Load attendance with pagination
  function loadAttendancePage(page, limit = 25, staffId = null) {
    const from = windowStart();
    const staffParam = staffId ? `&staffId=${staffId}` : '';
    return api.get(`/attendance?from=${from}&to=${U.todayKey()}${staffParam}&page=${page}&limit=${limit}`)
      .then((response) => {
        if (!response || !response.items) {
          return { items: [], pagination: null };
        }
        return {
          items: response.items.map(shapeAttendance),
          pagination: response.pagination,
        };
      });
  }

  function loadLeaves() {
    return api.get('/leave').then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadLeaves: received empty or invalid payload');
        store.leaves = [];
        return store.leaves;
      }
      store.leaves = payload.items.map(shapeLeave);
      return store.leaves;
    });
  }

  function loadResignations() {
    return api.get('/resignations').then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadResignations: received empty or invalid payload');
        store.resignations = [];
        return store.resignations;
      }
      store.resignations = payload.items.map(shapeResignation);
      return store.resignations;
    });
  }

  function loadTargets(month) {
    const wanted = month || monthKey();
    return api.get(`/targets?month=${wanted}`).then((payload) => {
      if (!payload || !payload.items) {
        console.warn('loadTargets: received empty or invalid payload');
        store.targets = { month: wanted, items: [], byStaff: {}, self: null, rollup: null };
        paintChrome();
        return store.targets;
      }
      const byStaff = {};
      payload.items.forEach((row) => { byStaff[row.staffId] = row; });
      const snapshot = { month: payload.month, items: payload.items, byStaff, self: payload.self, rollup: payload.rollup };
      store.targets = snapshot;
      store.targetMonths[payload.month] = snapshot;
      paintChrome();
      return snapshot;
    });
  }

  const LOADERS = {
    master: [loadMaster, loadActiveLists],
    policy: [loadPolicy],
    staff: [loadStaff],
    recruits: [loadRecruits],
    page: [loadRecruitPage],
    attendance: [loadAttendance],
    leave: [loadLeaves],
    resignations: [loadResignations],
    targets: [loadTargets],
  };

  /* Reload a named set of slices in parallel; a page asks for exactly what it renders. */
  function reload(names, month) {
    const work = [];
    (names || []).forEach((name) => {
      (LOADERS[name] || []).forEach((fn) => work.push(fn(name === 'targets' ? month : undefined)));
    });
    return Promise.all(work).then(() => {
      paintChrome();
      return store;
    });
  }

  /* The sidebar target bar and nav counts are chrome, not page content, so state repaints them. */
  function paintChrome() {
    if (A.refreshChrome) A.refreshChrome();
  }

  function bootstrap() {
    store.page = 1;
    resetFilters();
    return reload(['policy', 'staff', 'master', 'recruits', 'targets', 'attendance', 'leave', 'resignations']);
  }

  /* ---------- Session ---------- */

  function applySession(payload) {
    session.actor = payload.actor;
    session.userId = payload.actor.id;
    session.signedIn = true;
    A.data.org.selfId = payload.actor.id;
    return payload.actor;
  }

  function login(loginId, password) {
    return api.login(loginId, password)
      .then(applySession)
      .then(() => bootstrap())
      .then(() => ({ user: user(), mustChange: !!session.actor.mustChange }));
  }

  function restore() {
    return api.refresh().then((ok) => {
      if (!ok) {
        console.warn('Session restore failed: refresh returned false (cookie missing or expired)');
        return null;
      }
      return api.me().then(applySession).then(() => bootstrap()).then(() => session.actor);
    }).catch((error) => {
      console.warn('Session restore failed:', error?.message || error);
      return null;
    });
  }

  function logout() {
    return api.logout().then(() => {
      expire();
    });
  }

  /* The refresh cookie died: drop the session without calling the server. */
  function expire() {
    session.signedIn = false;
    session.actor = null;
    session.userId = null;
  }

  function user() {
    return (session.userId && A.data.people[session.userId]) || null;
  }

  function role() {
    return session.actor ? session.actor.role : 'recruiter';
  }

  function isManager() {
    const me = user();
    return !!me && me.kind === 'manager';
  }

  function isAdmin() {
    return role() === 'hr_admin';
  }

  function roleLabel(kind) {
    return kind === 'admin' || kind === 'hr_admin' ? 'HR Admin' : kind === 'manager' ? 'Manager' : 'Recruiter';
  }

  function accessOf(id) {
    const person = A.data.people[id];
    if (person) return person.kind;
    const member = A.data.org.get(id);
    if (!member) return 'recruiter';
    return member.kind === 'admin' || member.kind === 'manager' ? member.kind : 'recruiter';
  }

  function approverName(userId) {
    return A.data.approverFor(userId || session.userId);
  }

  function reportingLine() {
    return A.data.org.reportingLine(session.userId);
  }

  /* Self plus everyone below the current user, at any depth. */
  function teamIds() {
    return [session.userId].concat(A.data.org.descendantsOf(session.userId).map((m) => m.id));
  }

  function allStaffIds() {
    return A.data.org.members.map((m) => m.id);
  }

  function scopeIds() {
    return isAdmin() ? allStaffIds() : teamIds();
  }

  function subordinates() {
    if (isAdmin()) return A.data.org.members.filter((m) => m.id !== session.userId);
    return A.data.org.descendantsOf(session.userId);
  }

  function hasTeam() {
    return subordinates().length > 0;
  }

  function teamMembers() {
    return subordinates();
  }

  function scopedRecruits() {
    const ids = scopeIds();
    return store.recruits.filter((r) => ids.indexOf(r.ownerId) !== -1);
  }

  function ownerName(ownerId) {
    const member = A.data.org.byId[ownerId];
    return member ? member.name : '—';
  }

  /* Only the direct manager decides, and never on their own records — the same rule the server applies. */
  function canDecide(ownerId) {
    if (!ownerId || ownerId === session.userId) return false;
    if (isAdmin()) return true;
    const member = A.data.org.byId[ownerId];
    return !!member && member.reportsTo === session.userId;
  }

  function decisionSignature() {
    const me = user();
    if (!me) return '';
    return isAdmin() ? `${me.name} · override` : me.name;
  }

  function getRecruit(id) {
    return store.recruits.find((r) => r.id === id || r.ref === id)
      || store.pageRows.find((r) => r.id === id || r.ref === id)
      || null;
  }

  function fetchRecruit(id) {
    return api.get(`/recruits/${encodeURIComponent(id)}`).then((payload) => {
      const record = shapeRecruit(payload.item);
      const at = store.recruits.findIndex((r) => r.id === record.id);
      if (at === -1) store.recruits.unshift(record);
      else store.recruits[at] = record;
      return record;
    });
  }

  /* The server owns recruit codes, so the form only warns about a code it already knows. */
  function idExists(id, exceptId) {
    return store.recruits.some((r) => r.id === id && r.id !== exceptId);
  }

  function nextRecruitId() {
    let max = 1000;
    store.recruits.forEach((r) => {
      const n = parseInt(String(r.id).replace(/\D/g, ''), 10);
      if (!isNaN(n) && n > max) max = n;
    });
    return `RCT-${max + 1}`;
  }

  /* ---------- Master data ---------- */
  function masterKind(key) {
    return MASTER_KINDS.filter((k) => k.key === key)[0] || null;
  }

  function masterEntries(key) {
    return store.master[key] || [];
  }

  function masterActive(key) {
    return masterEntries(key).filter((e) => e.status === ACTIVE).map((e) => e.name);
  }

  function masterUseCount(key, name) {
    const entry = masterEntries(key).filter((e) => e.name === name)[0];
    if (entry) return entry.useCount || 0;
    const kind = masterKind(key);
    if (!kind) return 0;
    const source = kind.source === 'leaves' ? store.leaves : kind.source === 'resignations' ? store.resignations : store.recruits;
    return source.filter((row) => row[kind.field] === name).length;
  }

  /* A retired value comes back rather than being inserted twice. */
  function masterAdd(key, name) {
    const kind = masterKind(key);
    const clean = String(name || '').trim();
    if (!kind) return Promise.resolve({ error: 'Unknown list' });
    if (!clean) return Promise.resolve({ error: 'Enter a name' });
    if (clean.length > 60) return Promise.resolve({ error: 'Keep it under 60 characters' });
    const hit = masterEntries(key).filter((e) => e.name.toLowerCase() === clean.toLowerCase())[0];
    if (hit && hit.status === ACTIVE) return Promise.resolve({ error: `${kind.singular} is already in the list` });
    if (hit) return api.post(`/master/${hit.id}/status`, { active: true }).then(() => loadMaster()).then(() => ({ reactivated: hit.name }));
    return api.post('/master', { kind: kind.column, value: clean })
      .then(() => Promise.all([loadMaster(), loadActiveLists()]))
      .then(() => ({ added: clean }));
  }

  function masterRename(key, current, next) {
    const entry = masterEntries(key).filter((e) => e.name === current)[0];
    const clean = String(next || '').trim();
    if (!entry) return Promise.resolve({ error: 'Entry not found' });
    if (!clean) return Promise.resolve({ error: 'Enter a name' });
    if (clean.length > 60) return Promise.resolve({ error: 'Keep it under 60 characters' });
    if (clean.toLowerCase() !== current.toLowerCase()
      && masterEntries(key).some((e) => e.name.toLowerCase() === clean.toLowerCase())) {
      return Promise.resolve({ error: 'Another entry already uses that name' });
    }
    const touched = masterUseCount(key, current);
    return api.patch(`/master/${entry.id}`, { value: clean })
      .then(() => Promise.all([loadMaster(), loadActiveLists(), loadRecruits(), loadLeaves(), loadResignations()]))
      .then(() => ({ renamed: clean, touched }));
  }

  function masterSetStatus(key, name, status) {
    const entry = masterEntries(key).filter((e) => e.name === name)[0];
    if (!entry) return Promise.resolve({ error: 'Entry not found' });
    return api.post(`/master/${entry.id}/status`, { active: status === ACTIVE })
      .then(() => Promise.all([loadMaster(), loadActiveLists()]))
      .then(() => ({ name: entry.name, status }));
  }

  /* Nothing is deleted while records point at it; the server refuses and the list is retired instead. */
  function masterRemove(key, name) {
    const entry = masterEntries(key).filter((e) => e.name === name)[0];
    if (!entry) return Promise.resolve({ error: 'Entry not found' });
    const inUse = masterUseCount(key, name);
    if (inUse) return Promise.resolve({ error: `${inUse} record${inUse === 1 ? '' : 's'} still use${inUse === 1 ? 's' : ''} this value. Retire it instead.` });
    return api.del(`/master/${entry.id}`)
      .then(() => Promise.all([loadMaster(), loadActiveLists()]))
      .then(() => ({ removed: name }));
  }

  function companies() {
    return uniq(masterActive('companies').concat(scopedRecruits().map((r) => r.company)));
  }

  function roles() {
    return uniq(masterActive('roles').concat(scopedRecruits().map((r) => r.role)));
  }

  function uniq(list) {
    const seen = {};
    return list.filter((v) => {
      if (!v || seen[v]) return false;
      seen[v] = true;
      return true;
    });
  }

  // Filter fields are bound live to store.filters; Apply / Reset push them into store.applied
  // and the table is re-read from the server with that filter set.
  function applyFilters(patch) {
    Object.assign(store.applied, store.filters, patch || {});
    store.page = 1;
    return loadRecruitPage();
  }

  function resetFilters() {
    Object.assign(store.filters, BLANK_FILTERS);
    Object.assign(store.applied, BLANK_FILTERS);
    store.page = 1;
  }

  function filterErrors(filters) {
    const f = filters || store.filters;
    if (f.dojFrom && f.dojTo && f.dojFrom > f.dojTo) {
      return { dojFrom: 'From date must be before the To date' };
    }
    return null;
  }

  function visibleRecruits() {
    return store.pageRows;
  }

  function hasActiveFilters() {
    const f = store.applied;
    return !!(f.dojFrom || f.dojTo || f.company || f.role || (f.owner && f.owner !== 'All') || (f.status && f.status !== 'All') || f.search);
  }

  /* ---------- Writers ---------- */

  function uploadDocuments(ref, docs) {
    const jobs = A.data.docFields
      .filter((f) => docs && docs[f.key] && docs[f.key].file)
      .map((f) => api.upload(`/recruits/${ref}/documents/${f.key}`, docs[f.key].file));
    return Promise.all(jobs);
  }

  function addRecruit(payload) {
    const body = recruitBody(payload);
    let createdItem;
    
    return api.post('/recruits', body)
      .then((response) => {
        createdItem = response.item;
        return uploadDocuments(createdItem.uuid, payload.docs);
      })
      .then(() => Promise.all([loadRecruits(), loadRecruitPage(), loadTargets()]))
      .then(() => getRecruit(createdItem.id));
  }

  function updateRecruit(id, patch) {
    const target = getRecruit(id);
    if (!target) return Promise.resolve(null);
    const body = recruitBody(patch, true);
    return api.patch(`/recruits/${target.ref || target.uuid}`, body)
      .then(() => Promise.all([loadRecruits(), loadRecruitPage(), fetchRecruit(target.ref || id)]))
      .then(() => getRecruit(id));
  }

  function saveDocument(id, kind, file) {
    const target = getRecruit(id);
    if (!target) return Promise.resolve({ error: 'Save the record before attaching files' });
    return api.upload(`/recruits/${target.ref || target.uuid}/documents/${kind}`, file)
      .then(() => fetchRecruit(target.ref || target.uuid));
  }

  function removeDocument(id, kind) {
    const target = getRecruit(id);
    if (!target || !target.ref) return Promise.resolve(null);
    return api.del(`/recruits/${target.ref}/documents/${kind}`).then(() => fetchRecruit(target.ref));
  }

  /* Files sit behind the bearer token, so the browser cannot just link to them. */
  function downloadDocument(id, kind) {
    const target = getRecruit(id);
    if (!target || !target.ref) return Promise.reject(new Error('Open the record from the list first'));
    const stored = target.docs[kind];
    const label = (A.data.docFields.filter((f) => f.key === kind)[0] || {}).label || kind;
    return api.download(`/recruits/${target.ref}/documents/${kind}`, (stored && stored.name) || `${label}.dat`);
  }

  const FIELD_MAP = {
    name: 'name', gender: 'gender', dob: 'dob', mobile: 'mobile', email: 'email', address: 'address',
    status: 'status', role: 'role', company: 'company', city: 'city', hub: 'hub', hr: 'hrContact',
    hrContact: 'hrContact', doj: 'doj', ownerId: 'ownerId', remarks: 'remarks', code: 'code',
  };

  const STATUS_KEY = { Active: 'active', 'Not Active': 'not_active', active: 'active', not_active: 'not_active' };

  /* An empty date clears the column; validation only accepts yyyy-mm-dd or null. */
  const DATE_FIELDS = ['dob', 'doj'];

  /* The page speaks in display values; the API wants its own keys. */
  function recruitBody(payload, partial) {
    const body = {};
    Object.keys(FIELD_MAP).forEach((from) => {
      const value = payload[from];
      if (value === undefined) return;
      body[FIELD_MAP[from]] = value;
    });
    if (payload.status !== undefined) body.status = STATUS_KEY[payload.status] || payload.status;
    const reason = payload.reason !== undefined ? payload.reason : payload.deactivationReason;
    if (reason !== undefined) body.deactivationReason = reason;
    if (partial && body.status === 'not_active' && !body.deactivationReason) {
      body.deactivationReason = String(payload.reason || '').trim() || 'Not recorded';
    }
    DATE_FIELDS.forEach((key) => { if (key in body) body[key] = body[key] || null; });
    return body;
  }

  function deactivate(id, reason, remarks) {
    const target = getRecruit(id);
    if (!target) return Promise.resolve(null);
    return api.post(`/recruits/${target.ref || target.uuid}/deactivate`, { reason })
      .then(() => (remarks ? api.patch(`/recruits/${target.ref || target.uuid}`, { remarks }) : null))
      .then(() => Promise.all([fetchRecruit(target.ref || target.uuid), loadRecruits(), loadRecruitPage()]))
      .then(() => getRecruit(id));
  }

  function reactivate(id) {
    const target = getRecruit(id);
    if (!target) return Promise.resolve(null);
    return api.post(`/recruits/${target.ref || target.uuid}/activate`, {})
      .then(() => Promise.all([fetchRecruit(target.ref || target.uuid), loadRecruits(), loadRecruitPage()]))
      .then(() => getRecruit(id));
  }

  function todayAchieved() {
    const today = U.todayKey();
    return scopedRecruits().filter((r) => r.doj === today).length;
  }

  /* ---------- Targets ---------- */
  function targetMonths() {
    return Object.keys(store.targetMonths).sort();
  }

  function snapshot(month) {
    return store.targetMonths[month || store.targets.month] || store.targets;
  }

  function assignedTarget(id, month) {
    const row = snapshot(month).byStaff[id];
    return row && row.assigned ? row.target : null;
  }

  /* A recruiter's number for the month, or the policy default until one is assigned. */
  function recruiterTarget(id, month) {
    const row = snapshot(month).byStaff[id];
    return row ? row.target : store.policy.targetDefault;
  }

  function achievedFor(id, month) {
    const row = snapshot(month).byStaff[id];
    return row ? row.achieved : 0;
  }

  function peopleTargets(month) {
    return A.data.org.members
      .filter((m) => accessOf(m.id) === 'recruiter')
      .reduce((sum, m) => sum + recruiterTarget(m.id, month), 0);
  }

  /* A manager carries the sum of the recruiters below them. */
  function lineTargets(id, month) {
    const reports = A.data.org.descendantsOf(id).filter((m) => accessOf(m.id) === 'recruiter');
    if (!reports.length) return recruiterTarget(id, month);
    return reports.reduce((sum, m) => sum + recruiterTarget(m.id, month), 0);
  }

  function rollupTarget(id, month) {
    return accessOf(id) === 'admin' ? peopleTargets(month) : lineTargets(id, month);
  }

  function monthlyTarget(month) {
    const data = snapshot(month);
    if (data && data.rollup && data.items.length) return data.rollup.target;
    if (isAdmin()) return peopleTargets(month);
    if (isManager()) return lineTargets(session.userId, month);
    return recruiterTarget(session.userId, month);
  }

  function checkTarget(value) {
    const number = parseInt(value, 10);
    if (isNaN(number) || number < 0) return { error: 'Enter a number of placements' };
    if (number > 500) return { error: 'Keep it under 500 for one month' };
    return { target: number };
  }

  function setTarget(id, month, value) {
    const check = checkTarget(value);
    if (check.error) return Promise.resolve(check);
    return api.put('/targets', { staffId: id, month: month || monthKey(), target: check.target })
      .then(() => loadTargets(month))
      .then(() => ({ target: check.target }));
  }

  /* One value applied to a whole set of recruiters, from the bulk box on the Targets page. */
  function applyTargetRange(value, month, ids) {
    const check = checkTarget(value);
    if (check.error) return Promise.resolve(check);
    const wanted = month || monthKey();
    return Promise.all(ids.map((id) => api.put('/targets', { staffId: id, month: wanted, target: check.target })))
      .then(() => loadTargets(wanted))
      .then(() => ({ target: check.target, count: ids.length }));
  }

  function stats() {
    try {
      const total = monthlyTarget();
      const now = new Date();
      const month = monthKey();
      const list = scopedRecruits();
      const achieved = list.filter((r) => String(r.doj).slice(0, 7) === month).length;
      const active = list.filter((r) => r.status === ACTIVE).length;
      const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
      return {
        total: total || 0,
        achieved,
        left: Math.max((total || 0) - achieved, 0),
        percent: total ? Math.round((achieved / total) * 100) : 0,
        today: todayAchieved(),
        month: U.monthLabel(now),
        daysLeft: daysInMonth - now.getDate(),
        count: list.length,
        active,
        inactive: list.length - active,
      };
    } catch (error) {
      console.error('Error calculating stats:', error);
      // Return safe defaults
      return {
        total: 0,
        achieved: 0,
        left: 0,
        percent: 0,
        today: 0,
        month: monthKey(),
        daysLeft: 30,
        count: 0,
        active: 0,
        inactive: 0,
      };
    }
  }

  function groupCount(keyFn) {
    const map = {};
    scopedRecruits().forEach((r) => {
      const k = keyFn(r);
      map[k] = (map[k] || 0) + 1;
    });
    return Object.keys(map)
      .map((label) => ({ label, value: map[label] }))
      .sort((a, b) => b.value - a.value);
  }

  function byCompany() {
    return groupCount((r) => r.company);
  }

  function recent(limit) {
    return visibleAllByDoj().slice(0, limit || 5);
  }

  function visibleAllByDoj() {
    return scopedRecruits().slice().sort((a, b) => (a.doj < b.doj ? 1 : -1));
  }

  /* ---------- Attendance ---------- */
  function reportAttendance() {
    if (isAdmin()) return store.attendance.filter((d) => d.ownerId !== session.userId);
    const ids = A.data.org.descendantsOf(session.userId).map((m) => m.id);
    return store.attendance.filter((d) => ids.indexOf(d.ownerId) !== -1);
  }

  function attendanceDays(ownerId) {
    const id = ownerId || session.userId;
    return store.attendance.filter((d) => d.ownerId === id);
  }

  function dayRecord(ownerId, date) {
    return store.attendance.find((d) => d.ownerId === ownerId && d.date === date) || null;
  }

  function todayRecord(ownerId) {
    return dayRecord(ownerId || session.userId, U.todayKey());
  }

  function sortedDays(list) {
    return list.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.ownerId < b.ownerId ? -1 : 1));
  }

  /* Team marks when the user decides on other people, otherwise their own. */
  function attendanceScope() {
    return hasTeam() ? reportAttendance() : attendanceDays(session.userId);
  }

  function attendanceLog() {
    return sortedDays(attendanceScope());
  }

  function myAttendanceLog() {
    return sortedDays(attendanceDays(session.userId));
  }

  function markAttendance(input, ownerId) {
    // Support both old signature (status, login, ownerId) and new object signature
    let body;
    if (typeof input === 'object' && input.workDate) {
      // New object-based API with geofence and face support
      body = {
        workDate: input.workDate || U.todayKey(),
        status: input.status || 'present',
        loginTime: input.loginTime || null,
        latitude: input.latitude || null,
        longitude: input.longitude || null,
        faceDescriptor: input.faceDescriptor || undefined,
        overrideReason: input.overrideReason || undefined,
        remarks: input.remarks || undefined,
      };
      if (input.staffId && input.staffId !== session.userId) body.staffId = input.staffId;
    } else {
      // Legacy signature for backward compatibility
      const status = input;
      const login = ownerId; // second param is login in old signature
      const actualOwnerId = arguments[2]; // third param
      body = {
        workDate: U.todayKey(),
        status: { Present: 'present', Absent: 'absent', Leave: 'leave' }[status] || 'present',
        loginTime: status === 'Present' && login ? login : null,
      };
      if (actualOwnerId && actualOwnerId !== session.userId) body.staffId = actualOwnerId;
    }

    return api.post('/attendance', body)
      .then((payload) => loadAttendance().then(() => shapeAttendance(payload.item)));
  }

  function attendanceStats(list) {
    const days = list || attendanceScope();
    const lateAfter = store.policy.lateAfter;
    const count = (status) => days.filter((d) => d.status === status).length;
    const present = count('Present');
    const late = days.filter((d) => d.status === 'Present' && d.login > lateAfter).length;
    return {
      present,
      absent: count('Absent'),
      leave: count('Leave'),
      unmarked: count('Not marked'),
      late,
      onTime: present - late,
      total: days.length,
      marked: present + count('Absent') + count('Leave'),
      pending: days.filter((d) => d.approval === 'Pending').length,
      lateAfter,
    };
  }

  /* Days below this user that are waiting on their own decision. */
  function pendingAttendance() {
    return reportAttendance()
      .filter((d) => d.approval === 'Pending' && d.ref && canDecide(d.ownerId))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function decideAttendance(date, ownerId, accept) {
    const record = dayRecord(ownerId, date);
    if (!record || !record.ref || !canDecide(ownerId)) return Promise.resolve(null);
    return api.post(`/attendance/${record.ref}/decision`, { decision: accept ? 'accepted' : 'rejected' })
      .then(() => loadAttendance())
      .then(() => dayRecord(ownerId, date));
  }

  /* ---------- Resignation ---------- */
  function addDays(isoKey, days) {
    const date = U.parseISO(isoKey);
    date.setDate(date.getDate() + days);
    return U.isoOf(date);
  }

  function myResignation() {
    return store.resignations.filter((f) => f.ownerId === session.userId)[0] || null;
  }

  function teamResignations() {
    const ids = scopeIds();
    return store.resignations
      .filter((f) => ids.indexOf(f.ownerId) !== -1)
      .sort((a, b) => (a.filedAt < b.filedAt ? 1 : -1));
  }

  function pendingResignations() {
    return teamResignations().filter((f) => f.release === 'Pending' && canDecide(f.ownerId));
  }

  function noticePeriod() {
    return store.policy.noticeDays;
  }

  function fileResignation(input) {
    const start = U.todayKey();
    const body = {
      reason: input.reason,
      noticeDate: input.noticeDate || start,
      requestedLastDay: input.lastWorkingDay || addDays(start, store.policy.noticeDays),
      remarks: input.remarks || '',
    };
    return api.post('/resignations', body).then(() => loadResignations()).then(() => myResignation());
  }

  function withdrawResignation() {
    const filing = myResignation();
    if (!filing) return Promise.resolve(null);
    return api.post(`/resignations/${filing.ref}/withdraw`, {}).then(() => loadResignations());
  }

  /* A filing moves one stage at a time: the notice first, then the last working day. */
  function decideResignation(ownerId, accept) {
    const filing = store.resignations.filter((f) => f.ownerId === ownerId)[0];
    if (!filing || !canDecide(ownerId)) return Promise.resolve(null);
    const next = filing.key === 'filed'
      ? (accept ? 'notice_accepted' : 'rejected')
      : (accept ? 'accepted' : 'rejected');
    return api.post(`/resignations/${filing.ref}/decision`, { decision: next, lastDay: next === 'accepted' ? filing.lastWorkingDay : undefined })
      .then(() => loadResignations())
      .then(() => store.resignations.filter((f) => f.ownerId === ownerId)[0] || null);
  }

  /* ---------- Leave ---------- */
  function teamLeaves() {
    const ids = scopeIds();
    return store.leaves
      .filter((l) => ids.indexOf(l.ownerId) !== -1)
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  }

  function leaveList() {
    return teamLeaves();
  }

  function myLeaves() {
    return store.leaves
      .filter((l) => l.ownerId === session.userId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  function pendingLeaves() {
    return teamLeaves().filter((l) => l.status === 'Applied' && canDecide(l.ownerId));
  }

  function applyLeave(input) {
    return api.post('/leave', {
      leaveDate: input.date,
      reason: input.reason,
      remarks: input.remarks || '',
    }).then((payload) => loadLeaves().then(() => store.leaves.filter((l) => l.ref === payload.item.id)[0] || null));
  }

  function decideLeave(id, status) {
    const request = store.leaves.filter((l) => l.id === id)[0];
    if (!request || !canDecide(request.ownerId)) return Promise.resolve(null);
    return api.post(`/leave/${request.ref}/decision`, { decision: status === 'Accepted' ? 'accepted' : 'rejected' })
      .then(() => loadLeaves())
      .then(() => store.leaves.filter((l) => l.id === id)[0] || null);
  }

  function leaveStats() {
    const list = teamLeaves();
    const count = (status) => list.filter((l) => l.status === status).length;
    return { total: list.length, accepted: count('Accepted'), pending: count('Applied'), rejected: count('Rejected') };
  }

  /* ---------- Team ---------- */

  function memberMetrics(id) {
    const list = store.recruits.filter((r) => r.ownerId === id);
    const kind = accessOf(id);
    const month = monthKey();
    if (kind === 'recruiter') {
      return [
        { label: 'On-roll recruits', value: String(list.length) },
        { label: 'Active', value: String(list.filter((r) => r.status === ACTIVE).length) },
        { label: 'Not active', value: String(list.filter((r) => r.status === INACTIVE).length) },
        { label: 'Joined this month', value: String(list.filter((r) => String(r.doj).slice(0, 7) === month).length) },
      ];
    }
    const reports = A.data.org.descendantsOf(id).filter((m) => accessOf(m.id) === 'recruiter');
    return [
      { label: 'Team size', value: String(A.data.org.descendantsOf(id).length) },
      { label: 'Recruiters', value: String(reports.length) },
      { label: 'Monthly target', value: String(rollupTarget(id)) },
      { label: 'On-roll recruits', value: String(store.recruits.filter((r) => scopeFor(id).indexOf(r.ownerId) !== -1).length) },
    ];
  }

  function scopeFor(id) {
    if (accessOf(id) === 'admin') return allStaffIds();
    return [id].concat(A.data.org.descendantsOf(id).map((m) => m.id));
  }

  /* One row per direct or indirect report, with that member's own numbers. */
  function teamSummary() {
    return teamMembers().map((member) => {
      const list = store.recruits.filter((r) => r.ownerId === member.id);
      const month = monthKey();
      return {
        id: member.id,
        name: member.name,
        role: member.role,
        employeeId: member.employeeId,
        location: member.location,
        target: accessOf(member.id) === 'recruiter' ? recruiterTarget(member.id) : rollupTarget(member.id),
        recruits: list.length,
        active: list.filter((r) => r.status === ACTIVE).length,
        thisMonth: list.filter((r) => String(r.doj).slice(0, 7) === month).length,
        pending: pendingCount(member.id),
      };
    });
  }

  function pendingCount(ownerId) {
    const marks = store.attendance.filter((d) => d.ownerId === ownerId && d.approval === 'Pending').length;
    const leaves = store.leaves.filter((l) => l.ownerId === ownerId && l.status === 'Applied').length;
    const exits = store.resignations.filter((f) => f.ownerId === ownerId && f.release === 'Pending').length;
    return marks + leaves + exits;
  }

  /* Owners that appear in the current scope, for the Recruiter filter. */
  function ownerOptions() {
    const ids = [];
    scopedRecruits().forEach((r) => {
      if (ids.indexOf(r.ownerId) === -1) ids.push(r.ownerId);
    });
    return ids.sort((a, b) => (ownerName(a) < ownerName(b) ? -1 : 1));
  }

  /* ---------- Policy ---------- */
  function policy() {
    return store.policy;
  }

  function setPolicy(patch) {
    const next = Object.assign({}, store.policy, patch || {});
    if (!/^\d{2}:\d{2}$/.test(String(next.lateAfter))) return Promise.resolve({ error: 'Late check-in cutoff needs a time like 09:30' });
    const notice = parseInt(next.noticeDays, 10);
    if (isNaN(notice) || notice < 1 || notice > 90) return Promise.resolve({ error: 'Notice period must be between 1 and 90 days' });
    const targetDefault = parseInt(next.targetDefault, 10);
    if (isNaN(targetDefault) || targetDefault < 1 || targetDefault > 200) return Promise.resolve({ error: 'Default target must be between 1 and 200 placements' });
    const minLength = parseInt(next.passwordMinLength, 10);
    if (isNaN(minLength) || minLength < 8 || minLength > 32) return Promise.resolve({ error: 'Password length must be between 8 and 32 characters' });
    const attempts = parseInt(next.maxFailedAttempts, 10);
    const lockMinutes = parseInt(next.lockMinutes, 10);
    const history = parseInt(next.passwordHistory, 10);
    
    // Validate geofence coordinates
    let officeLatitude = null;
    let officeLongitude = null;
    let geofenceRadiusMeters = 100;
    
    if (next.officeLatitude !== null && next.officeLatitude !== undefined && next.officeLatitude !== '') {
      officeLatitude = parseFloat(next.officeLatitude);
      if (isNaN(officeLatitude) || officeLatitude < -90 || officeLatitude > 90) {
        return Promise.resolve({ error: 'Office latitude must be between -90 and 90' });
      }
    }
    
    if (next.officeLongitude !== null && next.officeLongitude !== undefined && next.officeLongitude !== '') {
      officeLongitude = parseFloat(next.officeLongitude);
      if (isNaN(officeLongitude) || officeLongitude < -180 || officeLongitude > 180) {
        return Promise.resolve({ error: 'Office longitude must be between -180 and 180' });
      }
    }
    
    // Both coordinates must be provided together
    if ((officeLatitude !== null && officeLongitude === null) || (officeLatitude === null && officeLongitude !== null)) {
      return Promise.resolve({ error: 'Both latitude and longitude are required for geofencing' });
    }
    
    if (next.geofenceRadiusMeters !== null && next.geofenceRadiusMeters !== undefined) {
      geofenceRadiusMeters = parseInt(next.geofenceRadiusMeters, 10);
      if (isNaN(geofenceRadiusMeters) || geofenceRadiusMeters < 10 || geofenceRadiusMeters > 5000) {
        return Promise.resolve({ error: 'Geofence radius must be between 10 and 5000 meters' });
      }
    }
    
    const body = {
      lateAfter: next.lateAfter,
      noticeDays: notice,
      targetDefault,
      passwordMinLength: minLength,
      maxFailedAttempts: isNaN(attempts) ? 5 : Math.min(20, Math.max(3, attempts)),
      lockMinutes: isNaN(lockMinutes) ? 15 : Math.min(1440, Math.max(1, lockMinutes)),
      passwordHistory: isNaN(history) ? 3 : Math.min(24, Math.max(0, history)),
      officeLatitude,
      officeLongitude,
      geofenceRadiusMeters,
    };
    return api.put('/policy', body)
      .then((payload) => {
        store.policy = Object.assign({}, store.policy, payload.item);
        return { policy: store.policy };
      });
  }

  /* ---------- Accounts and sign-in ---------- */
  function accountOf(id) {
    return store.accounts[id] || null;
  }

  function loginIdOf(id) {
    const account = accountOf(id);
    return account ? account.loginId : '';
  }

  function needsPasswordChange() {
    return !!(session.actor && session.actor.mustChange);
  }

  function passwordProblems(value) {
    const min = store.policy.passwordMinLength;
    if (!value || value.length < min) return `Use at least ${min} characters`;
    if (!/[A-Za-z]/.test(value) || !/\d/.test(value)) return 'Include at least one letter and one number';
    return '';
  }

  const PASSWORD_FIELD = { currentPassword: 'current', newPassword: 'next', confirm: 'confirm' };

  /* The server holds the secret; the browser only ever sends a candidate. */
  function changePassword(current, next, confirm) {
    if (!session.actor) return Promise.resolve({ field: 'current', error: 'This profile has no portal login' });
    if (!next || next !== confirm) return Promise.resolve({ field: 'confirm', error: 'The two new passwords do not match' });
    if (next === current) return Promise.resolve({ field: 'next', error: 'Choose a password you have not used before' });
    const problem = passwordProblems(next);
    if (problem) return Promise.resolve({ field: 'next', error: problem });
    return api.post('/auth/change-password', { currentPassword: current, newPassword: next })
      .then((payload) => {
        session.actor = Object.assign({}, session.actor, payload.actor || { mustChange: false });
        session.userId = session.actor.id;
        return { changed: true };
      })
      .catch((error) => ({
        field: PASSWORD_FIELD[error.fields && Object.keys(error.fields)[0]] || 'current',
        error: (error.fields && error.fields[Object.keys(error.fields)[0]]) || error.message,
      }));
  }

  function createLogin(id) {
    return api.post(`/staff/${id}/account`, {}).then((payload) => loadStaff().then(() => ({
      loginId: payload.loginId,
      password: payload.tempPassword,
    })));
  }

  function forceResetPassword(id) {
    return api.post(`/staff/${id}/reset-password`, {}).then((payload) => loadStaff().then(() => ({
      loginId: payload.loginId,
      password: payload.tempPassword,
    })));
  }

  function setLoginLocked(id, locked) {
    return api.post(`/staff/${id}/${locked ? 'lock' : 'unlock'}`, {})
      .then(() => loadStaff())
      .then(() => ({ loginId: loginIdOf(id), locked: !!locked }));
  }

  function deleteStaff(id) {
    return api.del(`/staff/${encodeURIComponent(id)}`).then(() => loadStaff());
  }

  /* ---------- Staff profile page ---------- */
  function fetchStaffDetail(id) {
    return api.get(`/staff/${encodeURIComponent(id)}`).then((payload) => payload.item);
  }

  function loadStaffDocuments(id) {
    return api.get(`/staff/${encodeURIComponent(id)}/documents`)
      .then((payload) => (payload && payload.documents) || {})
      .catch(() => ({}));
  }

  function saveStaffDocument(id, kind, file) {
    return api.upload(`/staff/${id}/documents/${kind}`, file).then(() => loadStaffDocuments(id));
  }

  function removeStaffDocument(id, kind) {
    return api.del(`/staff/${id}/documents/${kind}`).then(() => loadStaffDocuments(id));
  }

  function downloadStaffDocument(id, kind, name) {
    return api.download(`/staff/${id}/documents/${kind}`, name || `${kind}.dat`);
  }

  function updateStaff(id, body) {
    return api.patch(`/staff/${id}`, body).then((payload) => loadStaff().then(() => payload.item));
  }

  /* ---------- Internal staff ---------- */
  function managerOptions() {
    const byId = {};
    store.staff.forEach((s) => { byId[s.id] = s; });
    return A.data.org.members
      .filter((m) => accessOf(m.id) !== 'recruiter')
      .filter((m) => { const r = byId[m.id]; return !!r && r.active && !r.locked; })
      .map((m) => m.name);
  }

  function staffRows() {
    return A.data.org.members.map((member) => {
      const account = accountOf(member.id);
      const above = A.data.org.chainOf(member.id)[1];
      const list = store.recruits.filter((r) => r.ownerId === member.id);
      const access = accessOf(member.id);
      const record = store.staff.filter((r) => r.id === member.id)[0];
      return {
        id: member.id,
        name: member.name,
        employeeId: member.employeeId,
        designation: member.role,
        access,
        reportsTo: above ? above.name : '—',
        location: member.location,
        loginId: account ? account.loginId : '',
        hasAccount: !!account,
        locked: !!(account && account.locked),
        mustChange: !!(account && account.mustChange),
        lastLogin: account ? account.lastLogin : '',
        target: access === 'recruiter' ? recruiterTarget(member.id) : rollupTarget(member.id),
        recruits: list.length,
        active: list.filter((r) => r.status === ACTIVE).length,
        personActive: !!(record && record.active),
        usable: !!(record && record.active) && !(account && account.locked),
        faceEnrolled: !!(record && record.faceEnrolled),
        faceEnrolledAt: record ? record.faceEnrolledAt : null,
      };
    }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  }

  function managerIdByName(name) {
    const hit = A.data.org.members.filter((m) => m.name === name)[0];
    return hit ? hit.id : null;
  }

  /* Adds the person to the hierarchy and, unless told otherwise, provisions a login. */
  function createStaff(input) {
    const name = String(input.name || '').trim();
    if (!name) return Promise.resolve({ field: 'name', error: 'Enter the employee name' });
    if (!input.designation) return Promise.resolve({ field: 'designation', error: 'Enter the designation' });
    if (input.email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(input.email)) return Promise.resolve({ field: 'email', error: 'Enter a valid email' });
    if (!input.reportsTo) return Promise.resolve({ field: 'reportsTo', error: 'Select the reporting manager' });

    const managerId = managerIdByName(input.reportsTo);
    const body = {
      name,
      designation: input.designation,
      role: input.access === 'admin' ? 'hr_admin' : input.access,
      managerId,
      city: input.city || '',
      hub: input.hub || '',
      location: input.hub || input.city || '',
      gender: input.gender || '',
      dob: input.dob || null,
      mobile: input.mobile || '',
      email: input.email || '',
      doj: input.doj || U.todayKey(),
      teamNote: input.teamNote || '',
      mandate: input.mandate || '',
    };
    let createdId = null;
    return api.post('/staff', body).then((created) => {
      createdId = created.item.id;
      const withTarget = input.target ? setTarget(createdId, monthKey(), input.target) : Promise.resolve();
      return withTarget.then(() => (input.createAccount === false
        ? null
        : api.post(`/staff/${createdId}/account`, {})));
    }).then((credentials) => Promise.all([loadStaff(), loadTargets()]).then(() => ({
      staff: A.data.people[createdId] || null,
      employeeId: (A.data.people[createdId] || {}).employeeId || '',
      credentials: credentials ? { loginId: credentials.loginId, password: credentials.tempPassword } : null,
    })));
  }

  A.state = {
    ACTIVE,
    INACTIVE,
    RETIRED,
    MASTER_KINDS,
    store,
    session,
    bootstrap,
    reload,
    restore,
    loadRecruitPage,
    exportCsv,
    login,
    logout,
    expire,
    user,
    role,
    isManager,
    isAdmin,
    roleLabel,
    accessOf,
    canDecide,
    decisionSignature,
    scopeIds,
    allStaffIds,
    subordinates,
    approverName,
    reportingLine,
    teamIds,
    hasTeam,
    teamMembers,
    teamSummary,
    memberMetrics,
    scopedRecruits,
    ownerName,
    ownerOptions,
    monthlyTarget,
    getRecruit,
    fetchRecruit,
    idExists,
    nextRecruitId,
    companies,
    roles,
    masterKind,
    masterEntries,
    masterActive,
    masterUseCount,
    masterAdd,
    masterRename,
    masterSetStatus,
    masterRemove,
    policy,
    noticePeriod,
    setPolicy,
    accountOf,
    loginIdOf,
    needsPasswordChange,
    passwordProblems,
    changePassword,
    createLogin,
    forceResetPassword,
    setLoginLocked,
    deleteStaff,
    fetchStaffDetail,
    loadStaffDocuments,
    saveStaffDocument,
    removeStaffDocument,
    downloadStaffDocument,
    updateStaff,
    managerOptions,
    staffRows,
    createStaff,
    targetMonths,
    assignedTarget,
    recruiterTarget,
    achievedFor,
    lineTargets,
    rollupTarget,
    peopleTargets,
    setTarget,
    applyTargetRange,
    applyFilters,
    resetFilters,
    filterErrors,
    visibleRecruits,
    hasActiveFilters,
    addRecruit,
    updateRecruit,
    saveDocument,
    removeDocument,
    downloadDocument,
    deactivate,
    reactivate,
    stats,
    byCompany,
    recent,
    visibleAllByDoj,
    attendanceDays,
    attendanceScope,
    attendanceLog,
    myAttendanceLog,
    loadAttendancePage,
    reportAttendance,
    dayRecord,
    todayRecord,
    markAttendance,
    attendanceStats,
    pendingAttendance,
    decideAttendance,
    myResignation,
    teamResignations,
    pendingResignations,
    fileResignation,
    withdrawResignation,
    decideResignation,
    leaveList,
    myLeaves,
    teamLeaves,
    pendingLeaves,
    applyLeave,
    decideLeave,
    leaveStats,
  };
})(window.App);
