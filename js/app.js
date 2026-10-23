window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;

  const routes = [
    { match: /^#\/?$/, name: 'dashboard', page: 'dashboard', title: 'Dashboard', sub: 'Recruitment overview', teamSub: 'Team recruitment overview' },
    { match: /^#\/dashboard$/, name: 'dashboard', page: 'dashboard', title: 'Dashboard', sub: 'Recruitment overview', teamSub: 'Team recruitment overview' },
    { match: /^#\/recruits$/, name: 'recruits', page: 'recruits', title: 'My Recruits', sub: 'Records added by this recruiter', teamSub: 'Records across you and your recruiters' },
    { match: /^#\/recruits\/new$/, name: 'recruits-new', page: 'recruitNew', title: 'Add Recruits', sub: 'Create a new recruit record' },
    { match: /^#\/recruits\/(.+)$/, name: 'recruit-detail', page: 'recruitDetail', title: 'Recruit details', sub: 'Full record, documents and status' },
    { match: /^#\/sheets$/, name: 'sheets', page: 'sheets', title: 'Calling Sheets', sub: 'Contact lists assigned to recruiters', teamSub: 'Sheets you and your recruiters are working', managerOnly: true },
    { match: /^#\/sheets\/new$/, name: 'sheets', page: 'sheetNew', title: 'New Sheet', sub: 'Paste a contact list and assign it', managerOnly: true },
    { match: /^#\/sheets\/(.+)$/, name: 'sheets', page: 'sheetDetail', title: 'Sheet', sub: 'Funnel, recruiter progress and diary', managerOnly: true },
    { match: /^#\/my-calls$/, name: 'my-calls', page: 'myCalls', title: 'My Calls', sub: 'Assigned contacts and call outcomes' },
    { match: /^#\/attendance$/, name: 'attendance', page: 'attendance', title: 'Attendance', sub: 'Daily login record for this recruiter', teamSub: 'Team marks waiting on your decision' },
    { match: /^#\/resignation$/, name: 'resignation', page: 'resignation', title: 'Resignation', sub: 'Exit request and release decision', teamSub: 'Team exit filings and release decisions' },
    { match: /^#\/leave$/, name: 'leave', page: 'leave', title: 'Leave', sub: 'Leave requests and decisions', teamSub: 'Team leave requests and decisions' },
    { match: /^#\/face-enrollment$/, name: 'face-enrollment', page: 'faceEnrollment', title: 'Face Enrollment', sub: 'Register your face for biometric attendance' },
    { match: /^#\/profile$/, name: 'profile', page: 'profile', title: 'Profile', sub: 'Recruiter record and reporting hierarchy', teamSub: 'Manager record and reporting hierarchy' },
    { match: /^#\/profile\/(.+)$/, name: 'profile', page: 'profile', title: 'Profile', sub: 'Reporting hierarchy' },
    { match: /^#\/account$/, name: 'account', page: 'account', title: 'Account', sub: 'Your login and password' },
    { match: /^#\/master-data$/, name: 'master-data', page: 'masterData', title: 'Master Data', sub: 'Picklists behind every recruit record', adminOnly: true },
    { match: /^#\/staff$/, name: 'staff', page: 'staff', title: 'Internal Staff', sub: 'Payroll employees and their portal accounts', adminOnly: true },
    { match: /^#\/staff\/(.+)$/, name: 'staff', page: 'staffDetail', title: 'Staff Profile', sub: 'Record, portal account and documents', adminOnly: true },
    { match: /^#\/targets$/, name: 'targets', page: 'targets', title: 'Targets', sub: 'Monthly placement targets', adminOnly: true },
    { match: /^#\/policy$/, name: 'policy', page: 'policy', title: 'Policy', sub: 'Working rules applied across the portal', adminOnly: true },
  ];

  const GATE_ROUTES = { login: 'login', forceChange: 'force-change' };

  let renderToken = 0;
  // The refresh cookie decides before the first paint, so the sign-in form never flashes.
  let booted = false;

  function setActiveNav(name) {
    const highlight = name === 'recruit-detail' ? 'recruits' : name;
    document.querySelectorAll('.nav__item').forEach((item) => {
      const isActive = item.dataset.route === highlight;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page');
      else item.removeAttribute('aria-current');
    });
  }

  function setChrome(title, sub) {
    U.by('pageTitle').textContent = title;
    U.by('pageSubtitle').textContent = sub;
    document.title = `${title} · QT Consultancy HRMS`;
  }

  function notFound(hash) {
    return `<div class="card"><div class="card__body"><div class="empty">
      <span class="empty__icon"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><path d="M12 8v4"/><path d="M12 16h.01"/></svg></span>
      <h3>Page not found</h3>
      <p>“${U.esc(hash)}” is not a page in this workspace.</p>
      <a class="btn btn--primary" href="#/dashboard">Go to dashboard</a>
    </div></div></div>`;
  }

  function focusFirst(root) {
    const el = root.querySelector('[data-autofocus]');
    if (el) el.focus({ preventScroll: true });
  }

  function restricted() {
    return `<div class="card"><div class="card__body"><div class="empty">
      <span class="empty__icon"><svg viewBox="0 0 24 24"><rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/></svg></span>
      <h3>HR Admin only</h3>
      <p>This screen belongs to the HR Admin workspace. Ask Meera Krishnan if you need a change made here.</p>
      <a class="btn btn--primary" href="#/dashboard">Go to dashboard</a>
    </div></div></div>`;
  }

  function restrictedManager() {
    return `<div class="card"><div class="card__body"><div class="empty">
      <span class="empty__icon">${uiIcon('lock')}</span>
      <h3>Managers only</h3>
      <p>Sheets are created and assigned by your manager. Your assigned contacts appear under My Calls.</p>
      <a class="btn btn--primary" href="#/my-calls">Go to My Calls</a>
    </div></div></div>`;
  }

  /* ---------- Sign-in gate ---------- */
  // The workspace never renders until an account has signed in, and never until a
  // temporary password has been replaced.
  function gatePage() {
    if (!S.session.signedIn) return 'login';
    return S.needsPasswordChange() ? 'forceChange' : null;
  }

  function paintGate(page) {
    const gate = U.by('gate');
    document.body.classList.add('is-gated');
    gate.hidden = false;
    // Drop the previous session's workspace markup — its input ids would otherwise
    // shadow the gate's own fields, and its data would linger in the DOM.
    U.by('view').innerHTML = '';
    const want = `#/${GATE_ROUTES[page]}`;
    if (location.hash !== want) location.hash = want;
    if (gate.dataset.page === page) return Promise.resolve();
    gate.dataset.page = page;
    gate.innerHTML = '';
    const container = document.createElement('div');
    gate.appendChild(container);
    return A.pages[page](container);
  }

  function raiseGate() {
    const gate = U.by('gate');
    document.body.classList.remove('is-gated');
    gate.hidden = true;
    // Drop the sign-in markup so its ids can never shadow a workspace element.
    gate.innerHTML = '';
    gate.dataset.page = '';
  }

  function paintBoot() {
    const gate = U.by('gate');
    document.body.classList.add('is-gated');
    U.by('view').innerHTML = '';
    gate.hidden = false;
    if (gate.dataset.page === 'boot') return;
    gate.dataset.page = 'boot';
    gate.innerHTML = `<div class="gate"><div class="gate__brand">
      <img class="brand-logo brand-logo--gate" src="img/qt-consultancy.jpeg" alt="" width="40" height="40" />
      <span class="brand-text"><strong>QT Consultancy</strong><small>HRMS · Recruitment portal</small></span>
    </div><section class="card gate__card"><div class="card__body">
      <p class="card__sub">Restoring your session…</p>
      <span class="skeleton" style="display:block;height:14px;margin-bottom:10px"></span>
      <span class="skeleton" style="display:block;height:14px;width:70%"></span>
    </div></section></div>`;
  }

  function render() {
    const hash = location.hash || '#/dashboard';
    const token = ++renderToken;
    closePopovers();

    if (!booted) {
      paintBoot();
      return Promise.resolve();
    }

    const page = gatePage();
    if (page) {
      return paintGate(page).then(() => {
        if (token !== renderToken) return;
        focusFirst(U.by('gate'));
      });
    }
    raiseGate();

    paintHeader();
    U.by('sidebar').classList.remove('is-open');
    U.by('scrim').hidden = true;

    for (let i = 0; i < routes.length; i++) {
      const route = routes[i];
      const hit = hash.match(route.match);
      if (!hit) continue;
      const params = hit[1] ? { id: hit[1] } : {};
      setActiveNav(route.name);
      setChrome(route.title, S.hasTeam() && route.teamSub ? route.teamSub : route.sub);
      const shell = U.by('view');
      shell.scrollTop = 0;
      window.scrollTo({ top: 0 });
      if (route.adminOnly && !S.isAdmin()) {
        setChrome('Not available', 'HR Admin workspace');
        shell.innerHTML = restricted();
        return Promise.resolve();
      }
      if (route.managerOnly && !(S.isManager() || S.isAdmin())) {
        setChrome('Not available', 'Manager workspace');
        shell.innerHTML = restrictedManager();
        return Promise.resolve();
      }
      // Each route mounts in a fresh node so page-level listeners cannot outlive the page.
      shell.innerHTML = '';
      const container = document.createElement('div');
      shell.appendChild(container);
      return Promise.resolve(A.pages[route.page](container, params)).then(() => {
        if (token !== renderToken) return;
        shell.focus({ preventScroll: true });
      }, (error) => {
        if (token !== renderToken) return;
        loadFailed(container, error);
      });
    }

    setActiveNav('');
    setChrome('Not found', 'Unknown route');
    U.by('view').innerHTML = notFound(hash);
    return Promise.resolve();
  }

  /* A page that could not be filled says so instead of leaving a blank workspace. */
  function loadFailed(container, error) {
    const message = error && error.status === 403
      ? 'This record is outside the data your account can open.'
      : (error && error.message) || 'The server did not respond.';
    container.innerHTML = `<div class="card"><div class="card__body"><div class="empty">
      <span class="empty__icon">${uiIcon('warning')}</span>
      <h3>Could not load this page</h3>
      <p>${U.esc(message)}</p>
      <button class="btn btn--primary" type="button" id="retryLoad">Try again</button>
    </div></div></div>`;
    U.by('retryLoad').addEventListener('click', render);
  }

  function uiIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  A.router = function (hash) {
    if (location.hash === hash) {
      render();
      return;
    }
    location.hash = hash;
  };

  // Pages that derive their heading from data (member profiles) override the route title.
  A.setChrome = setChrome;
  A.loadFailed = loadFailed;
  // Writers call this after saving so the header target bar and nav counts stay true.
  A.refreshChrome = function () {
    if (booted && !gatePage()) {
      paintHeader();
      syncTarget();
    }
  };

  /* ---------- Popovers ---------- */
  function closePopovers() {
    U.by('avatarPanel').hidden = true;
    U.by('avatarBtn').setAttribute('aria-expanded', 'false');
  }

  function togglePopover(panelId, btnId) {
    const panel = U.by(panelId);
    const willOpen = panel.hidden;
    closePopovers();
    panel.hidden = !willOpen;
    U.by(btnId).setAttribute('aria-expanded', String(willOpen));
  }

  function syncTarget() {
    const s = S.stats();
    U.by('sideProgress').style.width = `${s.percent}%`;
    U.by('sideProgressLabel').textContent = `${s.achieved} / ${s.total}`;
    U.by('sideProgressMonth').textContent = s.month;
  }

  /* ---------- Theme ---------- */
  function readStoredTheme() {
    try { return localStorage.getItem('hrms.theme'); } catch (e) { return null; }
  }

  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    const btn = U.by('themeToggle');
    btn.setAttribute('aria-pressed', String(dark));
    btn.setAttribute('aria-label', dark ? 'Switch to day mode' : 'Switch to night mode');
  }

  function initTheme() {
    const btn = U.by('themeToggle');
    applyTheme(document.documentElement.getAttribute('data-theme') === 'dark');
    btn.addEventListener('click', () => {
      const dark = document.documentElement.getAttribute('data-theme') !== 'dark';
      applyTheme(dark);
      try { localStorage.setItem('hrms.theme', dark ? 'dark' : 'light'); } catch (e) {}
    });
    const query = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (ev) => { if (!readStoredTheme()) applyTheme(ev.matches); };
    if (query.addEventListener) query.addEventListener('change', onChange);
    else if (query.addListener) query.addListener(onChange);
  }

  /* ---------- Header ---------- */
  function syncNav() {
    const admin = S.isAdmin();
    const manager = S.isManager() || admin;
    document.querySelectorAll('[data-admin-only]').forEach((el) => { el.hidden = !admin; });
    document.querySelectorAll('[data-manager-only]').forEach((el) => { el.hidden = !manager; });
    U.by('navRecruitCount').textContent = S.scopedRecruits().length;
  }

  function paintHeader() {
    const r = S.user();
    if (!r) return;
    U.by('userName').textContent = r.name;
    U.by('userId').textContent = `${r.employeeId} · ${r.role}`;
    U.by('userAvatar').textContent = U.initials(r.name);
    U.by('avatarCircle').textContent = U.initials(r.name);
    U.by('menuName').textContent = r.name;
    U.by('menuRole').textContent = `${r.employeeId} · ${r.email || S.loginIdOf(r.id)}`;
    syncNav();
    syncTarget();
  }

  function initHeader() {
    U.by('avatarBtn').addEventListener('click', (ev) => {
      ev.stopPropagation();
      togglePopover('avatarPanel', 'avatarBtn');
    });
    U.by('userChip').addEventListener('click', () => A.router('#/profile'));

    document.addEventListener('click', (ev) => {
      if (!ev.target.closest('.popover-anchor')) closePopovers();
    });
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') closePopovers();
    });

    U.by('logoutBtn').addEventListener('click', () => {
      closePopovers();
      const r = S.user();
      if (!r) return;
      A.ui.confirm({
        title: 'Logout',
        tone: 'danger',
        confirmLabel: 'Logout',
        cancelLabel: 'Stay signed in',
        message: `End the session for <strong>${U.esc(r.name)}</strong> (${U.esc(r.employeeId)}). Unsaved form entries will be lost.`,
      }).then((accepted) => {
        if (!accepted) return;
        signedOut();
      });
    });
  }

  function signedOut() {
    const r = S.user();
    return S.logout().then(() => {
      setActiveNav('');
      render();
      if (r) A.ui.toast('info', 'Signed out', `${r.name} · ${r.employeeId}.`);
    });
  }

  /* ---------- Mobile nav ---------- */
  function initNav() {
    U.by('menuToggle').addEventListener('click', () => {
      const sidebar = U.by('sidebar');
      const open = !sidebar.classList.contains('is-open');
      sidebar.classList.toggle('is-open', open);
      U.by('scrim').hidden = !open;
      U.by('menuToggle').setAttribute('aria-expanded', String(open));
    });
    U.by('scrim').addEventListener('click', () => {
      U.by('sidebar').classList.remove('is-open');
      U.by('scrim').hidden = true;
      U.by('menuToggle').setAttribute('aria-expanded', 'false');
    });
    document.addEventListener('click', (ev) => {
      const link = ev.target.closest('.nav__item');
      if (link && window.innerWidth <= 980) {
        U.by('sidebar').classList.remove('is-open');
        U.by('scrim').hidden = true;
      }
    });
  }

  function init() {
    initTheme();
    initHeader();
    initNav();
    if (!location.hash || location.hash === '#') location.hash = '#/dashboard';
    window.addEventListener('hashchange', render);

    A.api.onExpired = function () {
      if (!S.session.signedIn) return;
      S.expire();
      render();
      A.ui.toast('warning', 'Session ended', 'The sign-in expired. Sign in again to continue.');
    };

    paintBoot();
    S.restore().then((actor) => {
      booted = true;
      if (!actor && gatePage() === 'login') {
        // A stale hash would otherwise be restored after the sign-in form.
        location.hash = '#/login';
      }
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})(window.App);
