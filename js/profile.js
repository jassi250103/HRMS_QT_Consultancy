window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const pages = (A.pages = A.pages || {});

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function row(label, value, opts) {
    const cls = opts && opts.muted ? ' detail-item__value--muted' : '';
    return `<div class="detail-item">
      <p class="detail-item__label">${label}</p>
      <p class="detail-item__value${cls}">${value || '—'}</p>
    </div>`;
  }

  function card(title, iconName, bodyHTML, badge) {
    return `<section class="card">
      <div class="card__head">
        <h3 class="section-title" style="margin:0">${icon(iconName)}${title}</h3>
        ${badge ? `<span class="section-title__badge">${badge}</span>` : ''}
      </div>
      <div class="card__body"><div class="detail-grid">${bodyHTML}</div></div>
    </section>`;
  }

  /* ============ Reporting chain ============ */

  const ORG = () => A.data.org;

  /* The tag names the card's place in the chain being viewed, never a fourth role. */
  const TAG = { manager: 'Manager', report: 'Report' };

  function chainCard(node, currentId, relation) {
    const self = node.id === currentId;
    const tag = self
      ? '<span class="org-card__tag org-card__tag--peer">Viewing</span>'
      : `<span class="org-card__tag${relation === 'report' ? ' org-card__tag--peer' : ''}">${TAG[relation]}</span>`;
    const body = `<span class="org-card__top"><span class="avatar avatar--sm">${U.esc(U.initials(node.name))}</span></span>
      <span class="org-card__name">${U.esc(node.name)}</span>
      <span class="org-card__role">${U.esc(node.role)}</span>
      <span class="org-card__dept">${U.esc(node.dept)}</span>
      ${tag}`;
    const cls = `org-card${self ? ' org-card--current' : ''}${node.id === A.state.session.userId ? ' org-card--you' : ''}`;
    const label = `Open the profile of ${U.esc(node.name)}, ${U.esc(node.role)}`;
    if (self) {
      return `<div class="${cls}">${body}</div>`;
    }
    return `<button class="${cls}" type="button" data-member="${U.esc(node.id)}"
      title="${U.esc(`${node.name} · ${node.employeeId}`)}" aria-label="${label}">${body}</button>`;
  }

  function connector() {
    return `<div class="org-stem" aria-hidden="true">
      <span class="org-stem__line"></span>
      <span class="org-stem__arrow">${icon('up')}</span>
      <span class="org-stem__line"></span>
    </div>`;
  }

  function chainHTML(currentId) {
    // One level per view, stacked the way the hierarchy reads: manager on top, you at the bottom.
    const up = ORG().chainOf(currentId).slice(0, 2).reverse();
    return `<div class="org-chain">
      ${up.map((node, index) => `${index ? connector() : ''}${chainCard(node, currentId, 'manager')}`).join('')}
    </div>`;
  }

  function asideHTML(title, nodes, currentId) {
    if (!nodes.length) return '';
    return `<div class="chain-aside">
      <p class="chain-aside__label">${title}</p>
      <div class="org-chain org-chain--row">${nodes.map((node) => chainCard(node, currentId, 'report')).join('')}</div>
    </div>`;
  }

  function chainSection(currentId) {
    const org = ORG();
    const chain = org.chainOf(currentId);
    const remaining = chain.length - 2;
    // Only real reports go below the card: above = more senior, below = reports to this profile.
    const team = org.directReports(currentId).filter((node) => node.id !== currentId);
    return `<section class="card">
      <div class="card__head">
        <div style="min-width:0">
          <h3 class="card__title">Reporting chain</h3>
          <p class="card__sub">One level at a time. The card above is the manager you report to.</p>
        </div>
        <span class="chip">${remaining > 0 ? `${remaining} more above` : 'Top of the chain'}</span>
      </div>
      <div class="card__body">
        ${chainHTML(currentId)}
        ${team.length ? asideHTML('Reporting to this profile', team, currentId) : ''}
      </div>
    </section>`;
  }

  function breadcrumb(node) {
    const self = A.state.session.userId;
    if (node.id === self) return '';
    const up = ORG().chainOf(node.id).slice().reverse();
    const from = up.findIndex((item) => item.id === self);
    const steps = from === -1
      ? [{ id: 'self', name: 'My profile', link: '#/profile' }, node]
      : up.slice(from);
    return `<nav class="breadcrumb" aria-label="Profile path">${steps.map((item, index) => {
      const sep = index ? '<span class="breadcrumb__sep" aria-hidden="true">›</span>' : '';
      const last = index === steps.length - 1;
      return `${sep}${last
        ? `<span class="breadcrumb__current">${U.esc(item.name)}</span>`
        : `<a class="breadcrumb__link" href="${U.esc(item.link || `#/profile/${item.id}`)}">${U.esc(item.name)}</a>`}`;
    }).join('')}</nav>`;
  }

  function maskedRow(label) {
    return `<div class="detail-item">
      <p class="detail-item__label">${label}</p>
      <p class="detail-item__value detail-item__value--locked">${icon('lock')}Restricted to HR</p>
    </div>`;
  }

  /* ============ Own profile ============ */

  function selfContent() {
    const r = A.state.user();
    const s = A.state.stats();

    return `<div class="stack">
      <section class="profile-hero">
        <span class="avatar avatar--lg">${U.esc(U.initials(r.name))}</span>
        <div class="profile-hero__meta">
          <h2>${U.esc(r.name)}</h2>
          <p>${U.esc(r.role)} · ${U.esc(r.company)}</p>
          <div class="profile-hero__tags">
            <span class="chip">${U.esc(r.idLabel)} <strong>${U.esc(r.employeeId)}</strong></span>
            <span class="chip">Hub <strong>${U.esc(r.hub)}</strong></span>
            <span class="chip">HR partner <strong>${U.esc(r.hr)}</strong></span>
          </div>
          <p class="field__hint" style="margin-top:8px">Record maintained by HR. Read-only in the recruiter module.</p>
        </div>
        <div class="profile-hero__side">
          <div class="hero-stat"><strong>${s.total}</strong><span>Target</span></div>
          <div class="hero-stat"><strong>${s.achieved}</strong><span>Achieved</span></div>
          <div class="hero-stat"><strong>${s.count}</strong><span>Recruits</span></div>
        </div>
        <div class="btn-row">
          <a class="btn" href="#/recruits">My recruits</a>
        </div>
      </section>

      <div class="profile-cols">
        ${card('Personal Information', 'user', [
          row('Name', U.esc(r.name)),
          row(r.idLabel, `<strong>${U.esc(r.employeeId)}</strong>`),
          row('Gender', U.esc(r.gender)),
          row('Date of Birth', `${U.fmtDate(r.dob)}`),
        ].join(''))}

        ${card('Contact Information', 'mail', [
          row('Mobile Number', U.esc(r.mobile)),
          row('Email', U.esc(r.email)),
          row('Address', U.esc(r.address), { muted: false }),
        ].join(''))}

        ${card('Employment Status', 'briefcase', [
          row('Date of Joining (DOJ)', U.fmtDate(r.doj)),
          row('Role', U.esc(r.role)),
          row('HR', U.esc(r.hr)),
          row('Tenure', `${Math.floor(U.daysBetween(r.doj, U.todayKey()) / 365)} years ${Math.floor((U.daysBetween(r.doj, U.todayKey()) % 365) / 30)} months`),
        ].join(''))}

        ${card('Assignment', 'calendar', [
          row('Client Cluster', U.esc(r.cluster)),
          row('Hub', U.esc(r.hub)),
          row('Reporting Manager', U.esc(A.state.reportingLine())),
          row('On-roll Recruits', `${s.count} (${s.active} active)`),
        ].join(''))}
      </div>

      ${chainSection(r.id)}
    </div>`;
  }

  /* ============ Member profile ============ */

  function memberContent(node) {
    const metrics = A.state.memberMetrics(node.id)
      .map((m) => `<div class="hero-stat"><strong>${U.esc(m.value)}</strong><span>${U.esc(m.label)}</span></div>`)
      .join('');

    return `<div class="stack">
      ${breadcrumb(node)}
      <section class="profile-hero">
        <span class="avatar avatar--lg">${U.esc(U.initials(node.name))}</span>
        <div class="profile-hero__meta">
          <h2>${U.esc(node.name)}</h2>
          <p>${U.esc(node.role)} · ${U.esc(node.dept)}</p>
          <div class="profile-hero__tags">
            <span class="chip">Employee ID <strong>${U.esc(node.employeeId)}</strong></span>
            <span class="chip">${U.esc(node.location)}</span>
            <span class="chip">${U.esc(A.state.roleLabel(A.state.accessOf(node.id)))}</span>
          </div>
          <p class="field__hint" style="margin-top:8px">Hierarchy view only. Personal and contact records stay with HR.</p>
        </div>
        <div class="profile-hero__side">${metrics}</div>
        <div class="btn-row">
          <a class="btn" href="#/profile">My profile</a>
        </div>
      </section>

      ${card('Mandate', 'briefcase', [
        row('Function', U.esc(node.dept)),
        row('Base', U.esc(node.location)),
        row('Team', U.esc(node.teamNote)),
        row('Scope', U.esc(node.mandate)),
      ].join(''), 'Delivery line')}

      ${card('Personal &amp; contact record', 'user', [
        maskedRow('Gender'),
        maskedRow('Date of Birth'),
        maskedRow('Mobile Number'),
        maskedRow('Email'),
        maskedRow('Address'),
        maskedRow('Date of Joining'),
      ].join(''), 'Restricted')}

      ${chainSection(node.id)}
    </div>`;
  }

  function unknownHTML(id) {
    return `<div class="card"><div class="card__body"><div class="empty">
      <span class="empty__icon">${icon('users')}</span>
      <h3>Profile not in this hierarchy</h3>
      <p>No org record matches “${U.esc(id)}”. The recruiter module only exposes the reporting line.</p>
      <a class="btn btn--primary" href="#/profile">Back to my profile</a>
    </div></div></div>`;
  }

  /* ============ Mount ============ */

  function bindChain(container) {
    const open = (node) => A.router(`#/profile/${node.dataset.member}`);
    U.delegate(container, 'click', '.org-card[data-member]', (ev, cardNode) => open(cardNode));
    U.delegate(container, 'keydown', '.org-card[data-member]', (ev, cardNode) => {
      if (ev.key === 'Enter' || ev.key === ' ') {
        // preventDefault keeps the browser from firing a second click for the same key.
        ev.preventDefault();
        open(cardNode);
        return;
      }
      if (ev.key !== 'ArrowDown' && ev.key !== 'ArrowUp') return;
      const cards = Array.prototype.slice.call(container.querySelectorAll('.org-card[data-member]'));
      const at = cards.indexOf(cardNode);
      ev.preventDefault();
      const next = ev.key === 'ArrowDown'
        ? cards[at + 1] || cards[0]
        : (at === 0 ? cards[cards.length - 1] : cards[at - 1]);
      next.focus();
    });
  }

  pages.profile = function (container, params) {
    const id = params && params.id;
    if (id && id !== A.state.session.userId) {
      const node = A.data.org.get(id);
      if (!node) {
        if (A.setChrome) A.setChrome('Profile not found', 'Outside the reporting line');
        container.innerHTML = unknownHTML(id);
        return Promise.resolve();
      }
      if (A.setChrome) A.setChrome(node.name, `${node.role} · ${node.dept}`);
      container.innerHTML = skeleton();
      return A.state.reload(['staff', 'recruits', 'targets']).then(() => {
        const fresh = A.data.org.get(id);
        if (!fresh) {
          container.innerHTML = unknownHTML(id);
          return;
        }
        container.innerHTML = memberContent(fresh);
        bindChain(container);
      });
    }

    const me = A.state.user();
    if (A.setChrome) A.setChrome('Profile', `${A.state.roleLabel(me.kind)} record and reporting hierarchy`);
    container.innerHTML = skeleton();
    return A.state.reload(['staff', 'recruits', 'targets']).then(() => {
      container.innerHTML = selfContent();
      bindChain(container);
    });
  };

  function skeleton() {
    return `<div class="card"><div class="card__body"><div class="skeleton" style="height:110px"></div></div></div>
      <div class="card" style="margin-top:14px"><div class="card__body"><div class="skeleton" style="height:180px"></div></div></div>`;
  }
})(window.App);
