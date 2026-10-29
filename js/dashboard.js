window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const pages = (A.pages = A.pages || {});

  function statCard(opts) {
    return `<article class="stat" style="--accent:${opts.color}">
      <div class="stat__top">
        <span class="stat__label">${opts.label}</span>
        <span class="stat__icon">${uiIcon(opts.icon)}</span>
      </div>
      <p class="stat__value">${opts.value}</p>
      <p class="stat__meta">${opts.meta}</p>
    </article>`;
  }

  function uiIcon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function breakdown(rows, caption) {
    const max = Math.max.apply(null, rows.map((r) => r.value).concat([1]));
    return `<div class="bd-list">${rows.map((row) => `
      <div class="bd-row">
        <span class="bd-row__label" title="${U.esc(row.label)}">${U.esc(row.label)}</span>
        <div class="progress progress--thin"><i style="width:${Math.round((row.value / max) * 100)}%;background:${row.color || 'var(--brand)'}"></i></div>
        <span class="bd-row__num">${row.value}<small class="cell-muted"> ${caption || ''}</small></span>
      </div>`).join('')}</div>`;
  }

  function recentRows() {
    const withOwner = A.state.hasTeam();
    return A.state.recent(6).map((r) => `
      <li class="mini-item">
        <span class="mini-item__text">
          <strong>${U.esc(r.name)}</strong>
          <p>${U.esc(r.role)}, ${U.esc(r.company)}${withOwner ? ` · ${U.esc(A.state.ownerName(r.ownerId))}` : ''}</p>
        </span>
        <span class="badge ${r.status === A.state.ACTIVE ? 'badge--active' : 'badge--inactive'}"><i></i>${r.status}</span>
        <span class="cell-muted cell-num">${U.fmtDate(r.doj)}</span>
      </li>`).join('');
  }

  function skeleton() {
    const card = (n) => Array.from({ length: n }).map(() => '<div class="skeleton" style="height:16px;margin-bottom:10px"></div>').join('');
    return `<div class="stack">
      <div class="stat-grid">
        ${Array.from({ length: 4 }).map(() => `<article class="stat"><div class="skeleton" style="height:56px"></div></article>`).join('')}
      </div>
      <div class="dash-split">
        <div class="card"><div class="card__body">${card(5)}</div></div>
        <div class="card"><div class="card__body">${card(6)}</div></div>
      </div>
    </div>`;
  }

  function faceEnrollmentCard() {
    const enrollmentStatus = window._dashEnrollmentStatus || { enrolled: false };
    const hasFace = enrollmentStatus.enrolled;
    const enrolledDate = enrollmentStatus.enrolledAt ? U.fmtDate(enrollmentStatus.enrolledAt) : null;
    
    if (hasFace) {
      return `<section class="card">
        <div class="card__head">
          <div><h3 class="card__title">${uiIcon('user-check')} Face Enrollment Status</h3><p class="card__sub">Biometric attendance enabled</p></div>
          <span class="badge badge--active">${uiIcon('check')} Enrolled${enrolledDate ? ` on ${enrolledDate}` : ''}</span>
        </div>
        <div class="card__body">
          <p>Your face template is enrolled and active. You can mark attendance using face verification.</p>
          <p class="card__sub" style="margin-top:8px"><strong>Note:</strong> Face enrollment cannot be changed without HR admin approval for security reasons.</p>
        </div>
      </section>`;
    } else {
      return `<section class="card" style="border-left:4px solid var(--warning)">
        <div class="card__head">
          <div><h3 class="card__title">${uiIcon('user-x')} Face Enrollment Required</h3><p class="card__sub">Mandatory for attendance marking</p></div>
          <a class="btn btn--primary" href="#/face-enrollment">${uiIcon('camera')} Enroll Now</a>
        </div>
        <div class="card__body">
          <p>You need to enroll your face to mark attendance. This is a one-time setup that enables secure biometric attendance marking.</p>
          <p class="card__sub" style="margin-top:8px">⚠️ Without face enrollment, you cannot mark attendance (present, absent, or leave).</p>
        </div>
      </section>`;
    }
  }

  function content() {
    try {
      const s = A.state.stats();
      const perDay = s.daysLeft > 0
        ? `${(s.left / s.daysLeft).toFixed(1)} per day for the remaining ${s.daysLeft} days`
        : 'Month ended, target carried forward';
      const companyRows = A.state.byCompany().slice(0, 5);

    return `<div class="stack">
      <div class="page-head">
        <div class="page-head__text">
          <h2>Recruitment summary</h2>
          <p>${U.esc(s.month)} &times; ${s.achieved} of ${s.total} target achieved. ${s.left} open, ${s.today} joined today.</p>
        </div>
        <div class="page-head__actions">
          <a class="btn" href="#/recruits">My Recruits</a>
          <a class="btn btn--primary" href="#/recruits/new">${uiIcon('plus')} Add Recruits</a>
        </div>
      </div>

      <div class="stat-grid">
        ${statCard({ label: 'Total Target', value: s.total, icon: 'target', color: 'var(--brand)', meta: `Assigned for ${U.esc(s.month)}` })}
        ${statCard({ label: 'Target Achieved', value: s.achieved, icon: 'check', color: 'var(--success)', meta: `${s.percent}% of monthly target` })}
        ${statCard({ label: 'Target Left', value: s.left, icon: 'calendar', color: 'var(--warning)', meta: perDay })}
        ${statCard({ label: "Today's Achieved", value: s.today, icon: 'chart', color: 'var(--info)', meta: `${s.achieved} joins this month` })}
      </div>

      ${faceEnrollmentCard()}

      <div class="dash-split">
        <section class="card">
          <div class="card__head"><div><h3 class="card__title">Recruits by client company</h3><p class="card__sub">Top 5 mandates</p></div></div>
          <div class="card__body">${breakdown(companyRows, 'recruits')}</div>
        </section>

        <section class="card">
          <div class="card__head">
            <div><h3 class="card__title">Recent recruits</h3><p class="card__sub">${A.state.hasTeam() ? 'Latest six joins across the team' : 'Latest six joins'}</p></div>
            <a class="link-btn" href="#/recruits">View all ${s.count}</a>
          </div>
          <div class="card__body">
            <ul class="mini-list">${recentRows()}</ul>
          </div>
        </section>
      </div>
    </div>`;
    } catch (error) {
      console.error('Error generating dashboard content:', error);
      return '<div class="card"><div class="card__body"><p>Error loading dashboard content. Please refresh the page.</p><pre style="font-size:11px;color:var(--danger)">' + error.message + '</pre></div></div>';
    }
  }

  pages.dashboard = function (container) {
    container.innerHTML = skeleton();
    
    // Load basic data first, then try to load face enrollment
    A.state.reload(['recruits', 'targets', 'staff'])
      .then(() => {
        // Try to load face enrollment status, but don't block rendering
        return A.api.get('/face-enrollment/me')
          .then((enrollmentStatus) => {
            window._dashEnrollmentStatus = enrollmentStatus;
          })
          .catch((err) => {
            console.warn('Face enrollment status not available:', err.message);
            window._dashEnrollmentStatus = { enrolled: false };
          });
      })
      .then(() => {
        // Always render content, even if face enrollment failed
        try {
          container.innerHTML = content();
        } catch (error) {
          console.error('Dashboard render error:', error);
          container.innerHTML = '<div class="card"><div class="card__body"><h3>Dashboard Error</h3><p>There was a problem loading the dashboard.</p><pre style="font-size:11px;color:var(--danger);margin-top:12px">' + error.message + '\n\n' + (error.stack || '').split('\n').slice(0, 3).join('\n') + '</pre></div></div>';
        }
      })
      .catch((error) => {
        console.error('Dashboard initialization error:', error);
        container.innerHTML = '<div class="card"><div class="card__body"><h3>Failed to Load Dashboard</h3><p>Could not load required data. Please refresh the page.</p><pre style="font-size:11px;color:var(--danger);margin-top:12px">' + error.message + '</pre></div></div>';
      });
  };
})(window.App);
