window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const pages = (A.pages = A.pages || {});
  const S = A.state;

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  const combos = { company: null, role: null };
  const dojFields = { from: null, to: null };

  /* ---------- Deactivation flow (shared with the detail page) ---------- */
  function reasonOptions(selected) {
    return ['<option value="">Select a reason…</option>']
      .concat(S.masterActive('deactivationReasons').map((r) => `<option value="${U.esc(r)}"${r === selected ? ' selected' : ''}>${U.esc(r)}</option>`))
      .join('');
  }

  function openDeactivationPrompt(recruit, afterSave) {
    const body = `<p>${U.esc(recruit.name)} (${U.esc(recruit.id)}) is currently Active. Changing it to Not Active requires a reason.</p>
      <div class="field" style="margin:14px 0">
        <label class="field__label" for="deactReason">Reason for Deactivation <span class="req">*</span></label>
        <select class="control" id="deactReason" data-autofocus>${reasonOptions('')}</select>
        <span class="field__hint">Saved on the record and shown on the details page.</span>
        <span class="field__error"></span>
      </div>
      <div class="field" id="otherReasonField" hidden style="margin-bottom:14px">
        <label class="field__label" for="deactOther">Enter Reason <span class="req">*</span></label>
        <input class="control" id="deactOther" type="text" placeholder="Enter the reason" maxlength="120" />
        <span class="field__error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="deactRemarks">Remarks <span class="field__hint">(optional)</span></label>
        <textarea class="control" id="deactRemarks" rows="2" placeholder="Notes for HR"></textarea>
      </div>`;

    A.ui.modal({
      title: 'Deactivate recruit',
      body,
      persistent: true,
      actions: [
        { label: 'Cancel', onClick: (m) => { m.close(); if (afterSave) afterSave(null, 'cancelled'); } },
        {
          label: 'Save',
          variant: 'danger',
          onClick: (m) => {
            const reasonField = U.by('deactReason').closest('.field');
            const otherField = U.by('deactOther').closest('.field');
            const reason = U.by('deactReason').value;
            const other = U.by('deactOther').value.trim();
            let bad = false;
            reasonField.classList.remove('has-error');
            otherField.classList.remove('has-error');
            if (!reason) { A.ui.error(reasonField, 'Select a reason'); bad = true; }
            if (reason === 'Other' && !other) { A.ui.error(otherField, 'Enter the deactivation reason'); bad = true; }
            if (bad) {
              A.ui.toast('error', 'Reason required', 'Select a reason before saving.');
              return;
            }
            const finalReason = reason === 'Other' ? other : reason;
            const remarks = U.by('deactRemarks').value.trim();
            m.close();
            A.ui.confirm({
              title: 'Confirm deactivation',
              tone: 'danger',
              confirmLabel: 'Yes, deactivate',
              cancelLabel: 'Keep as Active',
              message: `Set <strong>${U.esc(recruit.name)}</strong> to <strong>Not Active</strong>.<br>Reason: ${U.esc(finalReason)}. The record can be reactivated later.`,
            }).then((accepted) => {
              if (!accepted) {
                if (afterSave) afterSave(null, 'rejected');
                return;
              }
              S.deactivate(recruit.id, finalReason, remarks).then(() => {
                A.ui.toast('success', 'Record updated', `${recruit.name} set to Not Active. Reason: ${finalReason}.`);
                if (afterSave) afterSave(recruit.id, 'saved');
              }).catch((error) => {
                A.ui.toast('error', 'Change not saved', error.message);
                if (afterSave) afterSave(null, 'failed');
              });
            });
          },
        },
      ],
      onMount: () => {
        U.by('deactReason').addEventListener('change', (ev) => {
          U.by('otherReasonField').hidden = ev.target.value !== 'Other';
          U.by('deactReason').closest('.field').classList.remove('has-error');
        });
      },
    });
  }

  // Handles any status change coming from a control: returns the value to display.
  function statusFlow(recruit, next, done) {
    if (next === recruit.status) return;

    if (next === S.INACTIVE) {
      openDeactivationPrompt(recruit, (id, outcome) => {
        if (outcome === 'cancelled' || outcome === 'rejected') {
          A.ui.toast(outcome === 'cancelled' ? 'info' : 'warning', 'No change saved', `${recruit.name} remains Active.`);
        }
        done(outcome);
      });
      return;
    }

    A.ui.confirm({
      title: 'Reactivate recruit',
      tone: 'brand',
      confirmLabel: 'Yes, reactivate',
      cancelLabel: 'Keep as Not Active',
      message: `Set <strong>${U.esc(recruit.name)}</strong> to <strong>Active</strong>. The stored deactivation reason will be removed.`,
    }).then((accepted) => {
      if (!accepted) {
        A.ui.toast('info', 'No change saved', `${recruit.name} stays Not Active.`);
        done('rejected');
        return;
      }
      S.reactivate(recruit.id).then(() => {
        A.ui.toast('success', 'Record updated', `${recruit.name} set to Active.`);
        done('saved');
      }).catch((error) => {
        A.ui.toast('error', 'Change not saved', error.message);
        done('failed');
      });
    });
  }

  A.statusFlow = statusFlow;
  A.reasonOptions = reasonOptions;

  /* ---------- Layout ---------- */
  const PRESETS = [
    { kind: '7', label: 'Last 7 days' },
    { kind: '30', label: 'Last 30 days' },
    { kind: 'month', label: 'This month' },
    { kind: 'all', label: 'All time' },
  ];

  function presetRange(kind) {
    const now = new Date();
    if (kind === 'all') return { from: '', to: '' };
    if (kind === 'month') return { from: U.isoOf(new Date(now.getFullYear(), now.getMonth(), 1)), to: U.todayKey() };
    const from = new Date(now);
    from.setDate(from.getDate() - (parseInt(kind, 10) - 1));
    return { from: U.isoOf(from), to: U.todayKey() };
  }

  function activePreset(filters) {
    const found = PRESETS.find((p) => {
      const r = presetRange(p.kind);
      return r.from === filters.dojFrom && r.to === filters.dojTo;
    });
    return found ? found.kind : '';
  }

  /* Managers see every placement in their line, so the owner needs a column and a filter. */
  function ownerFilterRow() {
    if (!S.hasTeam()) return '';
    const options = [{ id: 'All', name: 'All recruiters' }].concat(S.ownerOptions().map((id) => ({ id, name: S.ownerName(id) })));
    return `<div class="filters__row">
      <label class="filters__label" for="ownerFilter">Recruiter</label>
      <select class="control" id="ownerFilter">
        ${options.map((o) => `<option value="${U.esc(o.id)}">${U.esc(o.name)}</option>`).join('')}
      </select>
    </div>`;
  }

  function filterCard() {
    return `<section class="card" id="filterCard" style="margin-bottom:14px">
      <div class="card__head">
        <h3 class="section-title" style="margin:0">${icon('filter')}Filter recruits</h3>
        <div class="presets" role="group" aria-label="Date of joining ranges">
          <span class="presets__label">DOJ</span>
          ${PRESETS.map((p) => `<button class="preset" type="button" data-preset="${p.kind}">${p.label}</button>`).join('')}
        </div>
        <button class="link-btn" type="button" id="toggleFilters">Hide</button>
      </div>
      <div class="card__body" id="filterBody">
        <div class="filters">
          <div class="filters__row filters--doj">
            <span class="filters__label">Date of joining</span>
            <div class="date-pair">
              <label><span>From</span><div id="dojFrom-host"></div></label>
              <label><span>To</span><div id="dojTo-host"></div></label>
            </div>
            <span class="field__error" id="dojError"></span>
          </div>
          <div class="filters__row">
            <label class="filters__label" for="comboCompany">Company</label>
            <div id="comboCompany"></div>
          </div>
          <div class="filters__row">
            <label class="filters__label" for="comboRole">Role</label>
            <div id="comboRole"></div>
          </div>
          ${ownerFilterRow()}
          <div class="filters__row">
            <label class="filters__label" for="statusFilter">Active status</label>
            <select class="control" id="statusFilter">
              <option value="All">All</option>
              <option value="Active">Active only</option>
              <option value="Not Active">Not Active only</option>
            </select>
          </div>
          <div class="filters__row filters__actions">
            <button class="btn btn--primary" type="button" id="applyFilters">Apply Filters</button>
            <button class="btn" type="button" id="resetFilters">Reset Filters</button>
          </div>
        </div>
        <p class="filters__hint">Blank fields are ignored.</p>
      </div>
    </section>`;
  }

  function tableCard() {
    return `<section class="card">
      <div class="card__head">
        <div style="min-width:0">
          <h3 class="card__title">My recruits<span class="count-pill" id="resultCount">—</span></h3>
          <p class="card__sub">${S.hasTeam() ? 'Placements by you and every recruiter below you · click a row to open the record' : 'Click a row to open the record'}</p>
        </div>
        <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;flex:1;justify-content:flex-end">
          <label class="search">
            <svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons.search}</svg>
            <input class="control" type="search" id="searchInput" placeholder="Search name, ID or email" />
          </label>
          <button class="btn" type="button" id="exportBtn">Download Excel</button>
          <a class="btn btn--primary" href="#/recruits/new">${icon('plus')} Add Recruits</a>
        </div>
      </div>
      <div class="filter-summary" id="filterSummary" hidden></div>
      <div class="card__body card__body--flush">
        <div class="table-wrap">
          <table class="data-table">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Name</th>
                ${S.hasTeam() ? '<th scope="col">Recruiter</th>' : ''}
                <th scope="col">Email</th>
                <th scope="col">Phone</th>
                <th scope="col">Company</th>
                <th scope="col">Role</th>
                <th scope="col">DOJ</th>
                <th scope="col">City</th>
                <th scope="col">Hub</th>
                <th scope="col">Active</th>
              </tr>
            </thead>
            <tbody id="recruitRows"></tbody>
          </table>
        </div>
        <div id="tableEmpty"></div>
      </div>
      <div class="card__foot" id="pagerHost"></div>
    </section>`;
  }

  /* ---------- Team tab (manager only) ---------- */
  let tab = 'recruits';

  function tabsBar() {
    const items = [
      { key: 'recruits', label: 'Placements', count: S.scopedRecruits().length },
      { key: 'team', label: 'Team (internal staff)', count: S.teamSummary().length },
    ];
    return `<div class="tabs" role="tablist" aria-label="Recruits views">
      ${items.map((t) => `<button class="tab${tab === t.key ? ' is-on' : ''}" type="button" role="tab"
        aria-selected="${tab === t.key}" data-tab="${t.key}">${t.label}<span class="tab__count">${t.count}</span></button>`).join('')}
    </div>`;
  }

  /* The tabs are painted before the data lands, so their counts are refreshed with the body. */
  function tabCounts() {
    if (!S.hasTeam()) return;
    const items = { recruits: S.scopedRecruits().length, team: S.teamSummary().length };
    document.querySelectorAll('[data-tab]').forEach((btn) => {
      const pill = btn.querySelector('.tab__count');
      if (pill) pill.textContent = items[btn.dataset.tab];
    });
  }

  function teamContent() {
    const rows = S.teamSummary();
    return `<section class="card">
      <div class="card__head">
        <div style="min-width:0">
          <h3 class="card__title">Recruiters under ${U.esc(S.user().name)}<span class="count-pill">${rows.length}</span></h3>
          <p class="card__sub">Internal staff. Their placements are already counted in the Placements tab.</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        <div class="table-wrap">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th scope="col">Recruiter</th>
                <th scope="col">ID</th>
                <th scope="col">Base</th>
                <th scope="col" class="cell-num">Target</th>
                <th scope="col" class="cell-num">Placements</th>
                <th scope="col" class="cell-num">Active</th>
                <th scope="col" class="cell-num">Joined this month</th>
                <th scope="col" class="cell-num">Awaiting decision</th>
                <th scope="col">View</th>
              </tr>
            </thead>
            <tbody>${rows.map((m) => `<tr>
              <td><span class="cell-name"><strong>${U.esc(m.name)}</strong></span><span class="cell-sub">${U.esc(m.role)}</span></td>
              <td class="cell-id">${U.esc(m.employeeId)}</td>
              <td class="cell-muted">${U.esc(m.location)}</td>
              <td class="cell-num">${m.target}</td>
              <td class="cell-num">${m.recruits}</td>
              <td class="cell-num">${m.active}</td>
              <td class="cell-num">${m.thisMonth}</td>
              <td class="cell-num">${m.pending ? `<span class="att-flag">${m.pending}</span>` : '—'}</td>
              <td><div class="btn-row">
                <button class="btn btn--sm" type="button" data-team-owner="${U.esc(m.id)}">Placements</button>
                <a class="btn btn--sm" href="#/profile/${U.esc(m.id)}">Profile</a>
              </div></td>
            </tr>`).join('')}</tbody>
          </table>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Export ---------- */
  // The server writes the CSV from the applied filter set, so the export matches every page.
  function runExport() {
    if (!S.store.total) {
      A.ui.toast('warning', 'Nothing to export', 'No records match the current filters.');
      return;
    }
    const btn = U.by('exportBtn');
    btn.disabled = true;
    btn.textContent = 'Preparing…';
    S.exportCsv().then(() => {
      A.ui.toast('success', 'Export ready', `${S.store.total} records written to recruits-${U.todayKey()}.csv.`);
    }).catch((error) => {
      A.ui.toast('error', 'Export failed', error.message);
    }).finally(() => {
      btn.disabled = false;
      btn.textContent = 'Download Excel';
    });
  }

  /* ---------- Rows ---------- */
  function statusCell(r) {
    const isActive = r.status === S.ACTIVE;
    return `<select class="status-select ${isActive ? 'status-select--active' : 'status-select--inactive'}"
        data-status-for="${U.esc(r.id)}" title="Change status" aria-label="Status for ${U.esc(r.name)}">
        <option value="Active"${isActive ? ' selected' : ''}>Active</option>
        <option value="Not Active"${!isActive ? ' selected' : ''}>Not Active</option>
      </select>`;
  }

  function hubShort(hub) {
    const parts = String(hub).split('·');
    return (parts.length > 1 ? parts[parts.length - 1] : hub).trim();
  }

  function dojCell(r) {
    return U.fmtDate(r.doj);
  }

  function rowHTML(r) {
    return `<tr class="is-clickable" data-open="${U.esc(r.id)}" tabindex="0" role="link" aria-label="Open ${U.esc(r.name)}">
      <td class="cell-id">${U.esc(r.id)}</td>
      <td><span class="cell-name"><strong>${U.esc(r.name)}</strong></span></td>
      ${S.hasTeam() ? `<td class="cell-muted cell-meta" data-label="Recruiter">${U.esc(S.ownerName(r.ownerId))}</td>` : ''}
      <td class="cell-muted cell-ellip cell-meta" data-label="Email" title="${U.esc(r.email)}">${U.esc(r.email)}</td>
      <td class="cell-num cell-meta" data-label="Mobile">${U.esc(r.mobile)}</td>
      <td class="cell-ellip cell-meta" data-label="Company">${U.esc(r.company)}</td>
      <td class="cell-ellip cell-meta" data-label="Role">${U.esc(r.role)}</td>
      <td class="cell-num cell-meta" data-label="Joining">${dojCell(r)}</td>
      <td class="cell-meta" data-label="City">${U.esc(r.city)}</td>
      <td class="cell-muted cell-meta" data-label="Hub" title="${U.esc(r.hub)}">${U.esc(hubShort(r.hub))}</td>
      <td class="cell-status" data-label="Status">${statusCell(r)}</td>
    </tr>`;
  }

  function skeletonRows(cols) {
    return Array.from({ length: 6 }).map(() => `<tr>${Array.from({ length: cols }).map(() => `<td><span class="skeleton" style="display:block;height:12px;width:${60 + Math.round(Math.random() * 30)}%"></span></td>`).join('')}</tr>`).join('');
  }

  function emptyState(kind) {
    if (kind === 'none') {
      return `<div class="empty">
        <span class="empty__icon">${icon('users')}</span>
        <h3>No recruits</h3>
        <p>No recruits have been added to your account yet.</p>
        <a class="btn btn--primary" href="#/recruits/new">${icon('plus')} Add Recruits</a>
      </div>`;
    }
    return `<div class="empty">
      <span class="empty__icon">${icon('search')}</span>
      <h3>No matching records</h3>
      <p>Adjust the filters and try again.</p>
      <button class="btn" type="button" data-clear-filters>Reset Filters</button>
    </div>`;
  }

  function renderSummary() {
    const f = S.store.applied;
    const tags = [];
    if (f.dojFrom || f.dojTo) {
      const label = f.dojFrom && f.dojTo ? `${U.fmtDate(f.dojFrom)} – ${U.fmtDate(f.dojTo)}` : f.dojFrom ? `From ${U.fmtDate(f.dojFrom)}` : `Up to ${U.fmtDate(f.dojTo)}`;
      tags.push({ key: 'doj', text: `DOJ: ${label}` });
    }
    if (f.company) tags.push({ key: 'company', text: `Company: ${f.company}` });
    if (f.role) tags.push({ key: 'role', text: `Role: ${f.role}` });
    if (f.owner && f.owner !== 'All') tags.push({ key: 'owner', text: `Recruiter: ${S.ownerName(f.owner)}` });
    if (f.status && f.status !== 'All') tags.push({ key: 'status', text: `Status: ${f.status}` });
    if (f.search) tags.push({ key: 'search', text: `Search: ${f.search}` });

    const host = U.by('filterSummary');
    if (!tags.length) {
      host.hidden = true;
      host.innerHTML = '';
      return;
    }
    host.hidden = false;
    host.innerHTML = `<span class="filter-summary__label">Filters</span>
      ${tags.map((t) => `<span class="filter-tag">${U.esc(t.text)}<button type="button" data-drop-filter="${t.key}" aria-label="Remove ${U.esc(t.text)}">${icon('x')}</button></span>`).join('')}
      <button class="link-btn" type="button" data-drop-filter="all" style="margin-left:auto">Clear all</button>`;
  }

  function renderPager() {
    const host = U.by('pagerHost');
    const total = S.store.total;
    const size = S.store.pageSize;
    const pageCount = Math.max(1, Math.ceil(total / size));
    if (S.store.page > pageCount) S.store.page = pageCount;
    const page = S.store.page;
    const from = total ? (page - 1) * size + 1 : 0;
    const to = Math.min(page * size, total);

    const numbers = [];
    for (let i = 1; i <= pageCount; i++) {
      if (i === 1 || i === pageCount || Math.abs(i - page) <= 1) numbers.push(i);
      else if (numbers[numbers.length - 1] !== '…') numbers.push('…');
    }

    host.innerHTML = `<div class="pager">
      <p class="pager__info">Showing <strong>${from}–${to}</strong> of <strong>${total}</strong> records</p>
      <div class="pager__btns">
        <button class="page-btn" type="button" data-page="${page - 1}" ${page === 1 ? 'disabled' : ''} aria-label="Previous page">${icon('back')}</button>
        ${numbers.map((n) => n === '…' ? '<span class="page-ellipsis">…</span>' : `<button class="page-btn${n === page ? ' is-current' : ''}" type="button" data-page="${n}"${n === page ? ' aria-current="page"' : ''}>${n}</button>`).join('')}
        <button class="page-btn" type="button" data-page="${page + 1}" ${page === pageCount ? 'disabled' : ''} aria-label="Next page">${icon('chev')}</button>
      </div>
      <label class="pager__size">Rows per page
        <select class="control" id="pageSize">
          ${[8, 12, 25].map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n}</option>`).join('')}
        </select>
      </label>
    </div>`;
  }

  /* The table shows exactly the page the server returned; counts come from the full scope. */
  function renderRows() {
    const rows = S.visibleRecruits();
    const body = U.by('recruitRows');

    if (!rows.length) {
      body.innerHTML = '';
      U.by('tableEmpty').innerHTML = emptyState(S.scopedRecruits().length ? 'filtered' : 'none');
    } else {
      U.by('tableEmpty').innerHTML = '';
      body.innerHTML = rows.map(rowHTML).join('');
    }

    U.by('resultCount').textContent = S.store.total;
    const on = activePreset(S.store.applied);
    document.querySelectorAll('[data-preset]').forEach((btn) => {
      btn.classList.toggle('is-on', btn.dataset.preset === on);
    });
    U.by('navRecruitCount').textContent = S.scopedRecruits().length;
    tabCounts();
    renderSummary();
    renderPager();
  }

  // Any filter, page or row-size change re-reads the current page from the server.
  // A slow response must not paint over a newer one, so only the last request lands.
  let rowsToken = 0;

  function guarded(work) {
    const token = ++rowsToken;
    return Promise.resolve(work()).then(() => {
      const current = token === rowsToken;
      if (current) renderRows();
      return current;
    }, (error) => {
      if (token === rowsToken) A.ui.toast('error', 'List not loaded', error.message);
      return false;
    });
  }

  function loadRows() {
    return guarded(() => S.loadRecruitPage());
  }

  /* ---------- Filter bindings ---------- */
  function syncFilterInputsFromState() {
    const f = S.store.filters;
    if (dojFields.from) dojFields.from.setValue(f.dojFrom);
    if (dojFields.to) dojFields.to.setValue(f.dojTo);
    U.by('statusFilter').value = f.status;
    U.by('searchInput').value = f.search;
    const owner = U.by('ownerFilter');
    if (owner) owner.value = f.owner;
    combos.company.setValue(f.company, true);
    combos.role.setValue(f.role, true);
  }

  function readFilterInputs() {
    S.store.filters.dojFrom = dojFields.from ? dojFields.from.value : '';
    S.store.filters.dojTo = dojFields.to ? dojFields.to.value : '';
    S.store.filters.company = combos.company.value;
    S.store.filters.role = combos.role.value;
    S.store.filters.status = U.by('statusFilter').value;
    S.store.filters.search = U.by('searchInput').value.trim();
    const owner = U.by('ownerFilter');
    if (owner) S.store.filters.owner = owner.value;
  }

  function bind(listHost) {
    function clearRangeError() {
      const box = U.by('dojError');
      box.parentElement.classList.remove('has-error');
      box.textContent = '';
    }

    function showRangeError(message) {
      const box = U.by('dojError');
      box.parentElement.classList.add('has-error');
      box.textContent = message;
    }

    function runApply(silent) {
      readFilterInputs();
      const err = S.filterErrors();
      if (err) {
        showRangeError(err.dojFrom);
        A.ui.toast('error', 'Check the DOJ range', err.dojFrom);
        return Promise.resolve();
      }
      clearRangeError();
      return guarded(() => S.applyFilters()).then(() => {
        if (!silent) A.ui.toast('success', 'Filters applied', `${S.store.total} matching record${S.store.total === 1 ? '' : 's'}.`);
      });
    }

    U.on(U.by('exportBtn'), 'click', runExport);

    U.on(U.by('applyFilters'), 'click', () => runApply(false));

    U.delegate(U.by('filterCard'), 'click', '[data-preset]', (ev, btn) => {
      const range = presetRange(btn.dataset.preset);
      if (dojFields.from) dojFields.from.setValue(range.from);
      if (dojFields.to) dojFields.to.setValue(range.to);
      runApply(true);
    });

    U.on(U.by('resetFilters'), 'click', () => {
      S.resetFilters();
      syncFilterInputsFromState();
      clearRangeError();
      loadRows().then(() => A.ui.toast('info', 'Filters reset', 'All filters cleared.'));
    });

    U.on(U.by('toggleFilters'), 'click', (ev) => {
      const bodyEl = U.by('filterBody');
      const collapsed = bodyEl.hidden;
      bodyEl.hidden = !collapsed;
      ev.target.textContent = collapsed ? 'Hide' : 'Show';
    });

    U.on(U.by('searchInput'), 'input', U.debounce(() => {
      readFilterInputs();
      guarded(() => S.applyFilters());
    }, 300));

    U.on(U.by('statusFilter'), 'change', () => {
      readFilterInputs();
      guarded(() => S.applyFilters());
    });

    const ownerSelect = U.by('ownerFilter');
    if (ownerSelect) {
      U.on(ownerSelect, 'change', () => {
        readFilterInputs();
        const name = ownerSelect.options[ownerSelect.selectedIndex].textContent;
        guarded(() => S.applyFilters()).then((current) => {
          if (current) A.ui.toast('success', 'Filtered by recruiter', `${S.store.total} placement${S.store.total === 1 ? '' : 's'} owned by ${name}.`);
        });
      });
    }

    const pagerHost = U.by('pagerHost');
    U.delegate(pagerHost, 'change', '#pageSize', (ev, sel) => {
      S.store.pageSize = parseInt(sel.value, 10);
      S.store.page = 1;
      loadRows();
    });
    U.delegate(pagerHost, 'click', '[data-page]', (ev, btn) => {
      if (btn.disabled) return;
      S.store.page = parseInt(btn.dataset.page, 10);
      loadRows().then(() => listHost.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    });

    U.delegate(listHost, 'click', '[data-drop-filter]', (ev, btn) => {
      ev.stopPropagation();
      const key = btn.dataset.dropFilter;
      if (key === 'all') {
        S.resetFilters();
        syncFilterInputsFromState();
        loadRows();
        return;
      }
      if (key === 'doj') { S.store.filters.dojFrom = ''; S.store.filters.dojTo = ''; }
      if (key === 'company') S.store.filters.company = '';
      if (key === 'role') S.store.filters.role = '';
      if (key === 'owner') S.store.filters.owner = 'All';
      if (key === 'status') S.store.filters.status = 'All';
      if (key === 'search') S.store.filters.search = '';
      syncFilterInputsFromState();
      loadRows();
    });

    const body = U.by('recruitRows');
    U.delegate(body, 'click', 'tr', (ev, tr) => {
      if (ev.target.closest('.status-select')) return;
      A.router(`#/recruits/${tr.dataset.open}`);
    });
    U.delegate(body, 'keydown', 'tr', (ev, tr) => {
      if ((ev.key === 'Enter' || ev.key === ' ') && !ev.target.closest('.status-select')) {
        ev.preventDefault();
        A.router(`#/recruits/${tr.dataset.open}`);
      }
    });
    U.delegate(body, 'change', '.status-select', (ev, sel) => {
      const recruit = S.getRecruit(sel.dataset.statusFor);
      if (!recruit) return;
      // Repainted either way: a cancelled or failed change has to put the select back.
      A.statusFlow(recruit, sel.value, (outcome) => {
        if (outcome === 'saved') {
          S.reload(['recruits', 'targets']).then(loadRows);
        } else {
          loadRows();
        }
      });
    });

    U.delegate(listHost, 'click', '[data-clear-filters]', () => {
      S.resetFilters();
      syncFilterInputsFromState();
      loadRows().then(() => A.ui.toast('info', 'Filters reset', 'All filters cleared.'));
    });
  }

  pages.recruits = function (container) {
    tab = 'recruits';

    function mountRecruits(host) {
      host.innerHTML = `${filterCard()}
        <div id="listHost">${tableCard()}</div>`;

      dojFields.from = A.DateField({ mount: U.by('dojFrom-host'), id: 'dojFrom', label: 'DOJ from', value: S.store.filters.dojFrom });
      dojFields.to = A.DateField({ mount: U.by('dojTo-host'), id: 'dojTo', label: 'DOJ to', value: S.store.filters.dojTo });

      combos.company = A.ui.Combobox({
        mount: U.by('comboCompany'),
        data: S.companies(),
        value: S.store.filters.company,
        placeholder: 'All companies',
        searchable: true,
        label: 'Company',
        onChange: () => { readFilterInputs(); },
      });
      combos.role = A.ui.Combobox({
        mount: U.by('comboRole'),
        data: S.roles(),
        value: S.store.filters.role,
        placeholder: 'All roles',
        searchable: false,
        label: 'Role',
        onChange: () => { readFilterInputs(); },
      });

      bind(U.by('listHost'));

      U.by('recruitRows').innerHTML = skeletonRows(S.hasTeam() ? 11 : 10);
      U.by('resultCount').textContent = '—';

      // Reset filters when navigating to the recruits list so newly added recruits are visible
      S.resetFilters();
      
      return S.reload(['staff', 'master', 'recruits', 'page']).then(() => {
        syncFilterInputsFromState();
        renderRows();
      });
    }

    function mountTeam(host) {
      U.delegate(host, 'click', '[data-team-owner]', (ev, btn) => {
        S.resetFilters();
        S.store.filters.owner = btn.dataset.teamOwner;
        tab = 'recruits';
        S.applyFilters().then(() => {
          show();
          A.ui.toast('success', 'Filtered by recruiter', `${S.store.total} placement${S.store.total === 1 ? '' : 's'} owned by ${S.ownerName(btn.dataset.teamOwner)}.`);
        }).catch((error) => {
          A.ui.toast('error', 'Filter failed', error.message);
        });
      });

      return S.reload(['staff', 'recruits', 'targets']).then(() => {
        host.innerHTML = teamContent();
        tabCounts();
      });
    }

    function show() {
      if (!S.hasTeam()) return mountRecruits(container);
      container.innerHTML = `${tabsBar()}<div id="tabBody"></div>`;
      const body = U.by('tabBody');
      return tab === 'team' ? mountTeam(body) : mountRecruits(body);
    }

    if (S.hasTeam()) {
      U.delegate(container, 'click', '[data-tab]', (ev, btn) => {
        tab = btn.dataset.tab;
        show();
      });
    }

    return show();
  };
})(window.App);
