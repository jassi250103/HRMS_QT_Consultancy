window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  const STATUS_META = {
    new: { label: 'New', tone: 'badge--neutral' },
    no_answer: { label: 'No answer', tone: 'badge--info' },
    interested: { label: 'Interested', tone: 'badge--brand' },
    interviewed: { label: 'Interviewed', tone: 'badge--brand' },
    joined: { label: 'Joined', tone: 'badge--active' },
    not_interested: { label: 'Not interested', tone: 'badge--inactive' },
    wrong_number: { label: 'Wrong number', tone: 'badge--inactive' },
  };
  const STATUS_ORDER = ['new', 'no_answer', 'interested', 'interviewed', 'joined', 'not_interested', 'wrong_number'];
  const DROPPED = ['no_answer', 'not_interested', 'wrong_number'];

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function statusBadge(status) {
    const meta = STATUS_META[status] || STATUS_META.new;
    return `<span class="badge ${meta.tone}"><i></i>${meta.label}</span>`;
  }

  function sheetBadge(status) {
    return status === 'open'
      ? '<span class="badge badge--active"><i></i>Open</span>'
      : '<span class="badge badge--neutral"><i></i>Closed</span>';
  }

  /* Same normalisation the server applies, so the preview never surprises the manager. */
  function normalizeMobile(raw) {
    let digits = String(raw || '').replace(/\D/g, '');
    if (!digits) return null;
    if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
    return digits.length === 10 && /^[6-9]/.test(digits) ? digits : null;
  }

  function parseContacts(text) {
    const rows = [];
    let invalid = 0;
    String(text || '').split(/\r?\n/).forEach((line, index) => {
      const clean = line.trim();
      if (!clean) return;
      const cells = (clean.indexOf('\t') !== -1 ? clean.split('\t') : clean.split(',')).map((c) => c.trim().replace(/^"|"$/g, ''));
      if (index === 0 && /name/i.test(cells[0]) && !normalizeMobile(cells[1] || '')) return;
      if (cells.length < 2) { invalid += 1; return; }
      const mobile = normalizeMobile(cells[1]);
      if (!mobile) invalid += 1;
      rows.push({ name: cells[0], mobile: cells[1], detail: cells.slice(2).join(', '), ok: !!mobile });
    });
    return { rows, invalid };
  }

  A.sheetsMeta = { STATUS_META, STATUS_ORDER, DROPPED, icon, statusBadge, sheetBadge, normalizeMobile, parseContacts };

  function pageHead(title, sub, actions) {
    return `<div class="page-head">
      <div class="page-head__text"><h2>${U.esc(title)}</h2><p>${U.esc(sub)}</p></div>
      <div class="page-head__actions">${actions || ''}</div>
    </div>`;
  }

  function loading(host, lines) {
    host.innerHTML = `<section class="card"><div class="card__body">${Array.from({ length: lines || 5 })
      .map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:10px"></span>').join('')}</div></section>`;
  }

  /* ---------- Sheets list ---------- */
  pages.sheets = function (container) {
    container.innerHTML = pageHead('Calling Sheets', 'Sheets that replace the WhatsApp list and the diary',
      '<a class="btn btn--primary" href="#/sheets/new">' + icon('plus') + ' New Sheet</a>') + '<div id="sheetHost"></div>';
    const host = U.by('sheetHost');
    loading(host);
    return A.api.get('/sheets').then((payload) => {
      const items = payload.items || [];
      if (!items.length) {
        host.innerHTML = `<section class="card"><div class="card__body"><div class="empty">
          <span class="empty__icon">${icon('users')}</span>
          <h3>No sheets yet</h3>
          <p>Create a sheet of contacts, assign it to your recruiters, and track every call without the diary.</p>
          <a class="btn btn--primary" href="#/sheets/new">${icon('plus')} New Sheet</a>
        </div></div></section>`;
        return;
      }
      host.innerHTML = `<section class="card"><div class="card__body card__body--flush"><div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>Sheet</th><th>Status</th><th>Recruiters</th><th>Contacts</th><th>Joined</th><th>Where calls stand</th><th>Created</th></tr></thead>
          <tbody>${items.map((s) => {
            const f = s.funnel;
            const worked = STATUS_ORDER.reduce((n, k) => n + (k === 'new' ? 0 : f[k]), 0);
            return `<tr class="is-clickable" data-open="${U.esc(s.id)}" tabindex="0">
              <td class="cell-name"><strong>${U.esc(s.name)}</strong>${s.note ? `<span class="cell-sub">${U.esc(s.note)}</span>` : ''}</td>
              <td>${sheetBadge(s.status)}</td>
              <td>${s.recruiterCount}</td>
              <td class="cell-num">${s.rowCount}</td>
              <td class="cell-num">${s.joinedCount}</td>
              <td><div class="funnel">
                <span title="Interested">${f.interested} int</span>
                <span title="Interviewed">${f.interviewed} ivd</span>
                <span title="No answer">${f.no_answer} nr</span>
                <span title="Dropped">${f.not_interested + f.wrong_number} drop</span>
                <span class="funnel__bar"><i style="width:${s.rowCount ? Math.round((s.joinedCount / s.rowCount) * 100) : 0}%"></i></span>
              </div>${worked === 0 ? '<span class="cell-sub">No outcome logged yet</span>' : ''}</td>
              <td><span class="cell-sub">${U.esc(s.createdByName)} · ${U.fmtDate(s.createdAt)}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table></div></div></section>`;
      U.delegate(host, 'click', '[data-open]', (ev, el) => A.router(`#/sheets/${el.dataset.open}`));
      U.delegate(host, 'keydown', '[data-open]', (ev, el) => { if (ev.key === 'Enter') A.router(`#/sheets/${el.dataset.open}`); });
    }).catch((error) => A.loadFailed(container, error));
  };

  /* ---------- New sheet ---------- */
  pages.sheetNew = function (container) {
    container.innerHTML = pageHead('New Sheet', 'Paste or upload the contact list and assign it to recruiters')
      + `<div id="sheetFormHost"></div>`;
    const host = U.by('sheetFormHost');
    loading(host);
    return Promise.all([
      A.api.get('/sheets/assignable'),
      S.reload(['master']).then(() => S),
    ]).then(([assignable]) => {
      const people = assignable.items || [];
      const picked = new Set(people.length === 1 ? [people[0].id] : []);
      let contacts = { rows: [], invalid: 0 };

      host.innerHTML = `<form id="sheetForm" class="card" autocomplete="off"><div class="card__body">
        <div class="form-grid form-grid--2">
          <div class="field">
            <label class="field__label" for="sheetName">Sheet name <span class="req">*</span></label>
            <input class="control" id="sheetName" type="text" maxlength="120" placeholder="e.g. Delivery hires — Noida week 2" data-autofocus />
            <span class="field__error"></span>
          </div>
          <div class="field">
            <label class="field__label" for="sheetNote">Note <span class="field__hint">(optional)</span></label>
            <input class="control" id="sheetNote" type="text" maxlength="400" placeholder="What this sheet is about" />
          </div>
        </div>
        <div class="field" style="margin-top:14px">
          <span class="field__label">Recruiters who will call <span class="req">*</span></span>
          <div class="presets" id="recruiterPick">${people.map((p) =>
            `<button type="button" class="preset" data-pick="${U.esc(p.id)}">${U.esc(p.name)}<small>${U.esc(p.employee_code || '')}</small></button>`).join('')}</div>
          <span class="field__hint">Everyone picked gets the full sheet; each recruiter logs their own outcome per contact.</span>
          <span class="field__error" id="recruiterError"></span>
        </div>
        <div class="field" style="margin-top:14px">
          <label class="field__label" for="contactPaste">Contacts <span class="req">*</span></label>
          <textarea class="control" id="contactPaste" rows="6" placeholder="One per line:&#10;Name, Mobile, Detail&#10;Asha Verma, 9876500001, delivery exec Noida"></textarea>
          <div class="btn-row" style="margin-top:8px">
            <label class="btn btn--ghost btn--sm" for="contactFile">${icon('upload')} Upload Excel/CSV</label>
            <input id="contactFile" type="file" accept=".csv,.txt,.xlsx,.xls,text/csv" hidden />
          </div>
          <span class="field__hint">Paste from Excel/WhatsApp or upload an Excel/CSV file (columns: Name, Mobile, Detail). Duplicate mobiles inside the sheet are skipped; numbers already in the recruit list are linked when someone marks a contact as joined.</span>
          <span class="field__error" id="contactError"></span>
        </div>
        <div id="contactPreview"></div>
      </div>
      <div class="card__foot btn-row--end">
        <a class="btn btn--ghost" href="#/sheets">Cancel</a>
        <button class="btn btn--primary" type="submit">Create sheet</button>
      </div></form>`;

      const form = U.by('sheetForm');
      const preview = U.by('contactPreview');

      function renderPick() {
        host.querySelectorAll('[data-pick]').forEach((btn) => {
          btn.classList.toggle('is-on', picked.has(btn.dataset.pick));
        });
      }
      U.delegate(host, 'click', '[data-pick]', (ev, btn) => {
        if (picked.has(btn.dataset.pick)) picked.delete(btn.dataset.pick);
        else picked.add(btn.dataset.pick);
        renderPick();
      });

      function renderPreview() {
        const err = U.by('contactError');
        if (!contacts.rows.length) { preview.innerHTML = ''; err.textContent = ''; return; }
        const okRows = contacts.rows.filter((r) => r.ok);
        const bad = contacts.rows.length - okRows.length;
        err.textContent = bad ? `${bad} line${bad === 1 ? ' has a' : 's have a'} mobile that will be rejected (10-digit Indian number).` : '';
        preview.innerHTML = `<div class="section-title">Preview <span class="section-title__badge">${okRows.length} usable · ${bad} bad</span></div>
          <div class="table-wrap"><table class="data-table data-table--compact">
            <thead><tr><th>Name</th><th>Mobile</th><th>Detail</th></tr></thead>
            <tbody>${contacts.rows.slice(0, 200).map((r) => `<tr class="${r.ok ? '' : 'row-bad'}">
              <td class="cell-name">${U.esc(r.name)}</td>
              <td>${r.ok ? U.esc(r.mobile) : `<span class="cell-muted">${U.esc(r.mobile)} ✗</span>`}</td>
              <td class="cell-muted">${U.esc(r.detail)}</td></tr>`).join('')}</tbody>
          </table></div>${contacts.rows.length > 200 ? `<p class="field__hint">Showing the first 200 of ${contacts.rows.length} lines.</p>` : ''}`;
      }

      const onPaste = U.debounce(() => {
        contacts = parseContacts(U.by('contactPaste').value);
        renderPreview();
      }, 250);
      U.by('contactPaste').addEventListener('input', onPaste);
      U.by('contactFile').addEventListener('change', (ev) => {
        const file = ev.target.files && ev.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        if (/\.(xlsx|xls|xlsm|ods)$/i.test(file.name)) {
          if (!window.XLSX) { A.ui.toast('error', 'Excel support not loaded', 'Refresh the page and try again.'); return; }
          reader.onload = () => {
            try {
              const book = XLSX.read(new Uint8Array(reader.result), { type: 'array' });
              let text = '';
              for (let i = 0; i < book.SheetNames.length; i += 1) {
                const grid = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[i]], { header: 1, raw: false, defval: '' });
                const body = grid.filter((r) => r.some((c) => String(c).trim()));
                if (body.length) {
                  text = body.map((r) => r.map((c) => String(c).trim()).join('\t')).join('\n');
                  break;
                }
              }
              if (!text) { A.ui.toast('error', 'Empty workbook', 'No rows with data were found in that Excel file.'); return; }
              U.by('contactPaste').value = text;
              onPaste();
            } catch (e) {
              A.ui.toast('error', 'Could not read file', String((e && e.message) || e));
            }
          };
          reader.readAsArrayBuffer(file);
          return;
        }
        reader.onload = () => {
          U.by('contactPaste').value = String(reader.result || '');
          onPaste();
        };
        reader.readAsText(file);
      });

      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        A.ui.clearErrors(form);
        const missing = [];
        const nameField = U.by('sheetName').closest('.field');
        if (!U.by('sheetName').value.trim()) { A.ui.error(nameField, 'Give the sheet a name'); missing.push('sheet name'); }
        const recErr = U.by('recruiterError');
        if (!picked.size) { recErr.textContent = 'Pick at least one recruiter'; missing.push('a recruiter'); } else recErr.textContent = '';
        const usable = contacts.rows.filter((r) => r.ok);
        const cErr = U.by('contactError');
        if (!usable.length) { cErr.textContent = 'Add at least one contact with a valid mobile'; missing.push('at least one contact'); }
        if (missing.length) { A.ui.toast('error', 'Cannot create sheet', `Still needed: ${missing.join(', ')}.`); return; }

        const submitBtn = form.querySelector('[type=submit]');
        submitBtn.disabled = true;
        A.api.post('/sheets', {
          name: U.by('sheetName').value.trim(),
          note: U.by('sheetNote').value.trim(),
          recruiterIds: Array.from(picked),
          rows: usable.map((r) => ({ name: r.name, mobile: r.mobile, detail: r.detail })),
        }).then((result) => {
          const imp = result.import || {};
          const bits = [`${imp.accepted || 0} contacts`];
          if (imp.duplicates) bits.push(`${imp.duplicates} duplicate skipped`);
          if (imp.invalid && imp.invalid.length) bits.push(`${imp.invalid.length} invalid rejected`);
          A.ui.toast('success', 'Sheet created', bits.join(' · '));
          A.router(`#/sheets/${result.item.id}`);
        }).catch((error) => {
          submitBtn.disabled = false;
          A.ui.toast('error', 'Sheet not created', error.message);
        });
      });

      renderPick();
    }).catch((error) => A.loadFailed(container, error));
  };

  /* ---------- Sheet detail ---------- */
  pages.sheetDetail = function (container, params) {
    const id = params && params.id;
    let recruiterIdsOnSheet = [];
    const view = { tab: 'all', q: '', page: 1, more: false };
    let lastPayload = null;
    container.innerHTML = `<div class="btn-row"><a class="btn btn--ghost btn--sm" href="#/sheets">${icon('back')} All sheets</a></div>
      <div id="detailHost"></div>`;
    const host = U.by('detailHost');
    loading(host, 7);

    function fetchJson() { return A.api.get(`/sheets/${id}`); }

    /* Listeners bind to `host` once — paint() replaces its innerHTML, so delegating here (not inside paint) avoids duplicate handlers. */
    U.delegate(host, 'click', '[data-row]', (ev, el) => openRowHistory(el.dataset.row));
    U.delegate(host, 'keydown', '[data-row]', (ev, el) => { if (ev.key === 'Enter') openRowHistory(el.dataset.row); });
    U.delegate(host, 'click', '[data-act]', (ev, btn) => {
      const act = actions2[btn.dataset.act];
      if (!act) return;
      btn.disabled = true;
      Promise.resolve(act(btn)).catch((error) => A.ui.toast('error', 'Not saved', error.message)).then(() => { if (btn.isConnected) btn.disabled = false; });
    });
    U.delegate(host, 'click', '[data-tab]', (ev, btn) => { view.tab = btn.dataset.tab; view.page = 1; renderContacts(); });
    U.delegate(host, 'click', '[data-diary-more]', () => { view.more = !view.more; paint(lastPayload); });
    const onSearch = U.debounce(() => { view.page = 1; renderContacts(); }, 200);
    U.delegate(host, 'input', '#contactSearch', (ev, el) => { view.q = el.value; onSearch(); });

    function paint(payload) {
      const sheet = payload.item;
      lastPayload = payload;
      recruiterIdsOnSheet = payload.recruiters.map((r) => r.id);
      const f = sheet.funnel;
      const dropped = DROPPED.reduce((n, k) => n + f[k], 0);
      const actions = [];
      if (sheet.canManage) {
        actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-act="rows">${icon('plus')} Add contacts</button>`);
        actions.push(`<button class="btn btn--sm btn--ghost" type="button" data-act="assign">${icon('users')} Assign</button>`);
        actions.push(sheet.status === 'open'
          ? `<button class="btn btn--sm btn--ghost" type="button" data-act="close">Close sheet</button>`
          : `<button class="btn btn--sm btn--ghost" type="button" data-act="reopen">Reopen sheet</button>`);
        if (S.isAdmin()) actions.push(`<button class="btn btn--sm btn--danger" type="button" data-act="delete">Delete</button>`);
      }
      actions.push(`<button class="btn btn--sm btn--primary" type="button" data-act="export">${icon('download')} CSV</button>`);

      host.innerHTML = `${pageHead(sheet.name, `By ${sheet.createdByName} · ${U.fmtDate(sheet.createdAt)} ${sheet.note ? '· ' + U.esc(sheet.note) : ''}`, actions.join(''))}
        ${sheet.status === 'closed' ? '<div class="alert alert--info"><p>This sheet is closed. Contacts stay visible; recruiters can still finish pending calls.</p></div>' : ''}
        <div class="stat-grid">
          <article class="stat"><div class="stat__top"><span class="stat__label">Contacts</span></div><p class="stat__value">${sheet.rowCount}</p></article>
          <article class="stat"><div class="stat__top"><span class="stat__label">Pending calls</span></div><p class="stat__value">${f.new}</p></article>
          <article class="stat"><div class="stat__top"><span class="stat__label">Interested</span></div><p class="stat__value">${f.interested}</p></article>
          <article class="stat"><div class="stat__top"><span class="stat__label">Interviewed</span></div><p class="stat__value">${f.interviewed}</p></article>
          <article class="stat"><div class="stat__top"><span class="stat__label">Joined</span></div><p class="stat__value">${sheet.joinedCount}</p><div class="progress progress--thin"><i style="width:${sheet.rowCount ? Math.round((sheet.joinedCount / sheet.rowCount) * 100) : 0}%"></i></div></article>
          <article class="stat"><div class="stat__top"><span class="stat__label">Dropped</span></div><p class="stat__value">${dropped}</p></article>
        </div>

        <section class="card"><div class="card__head"><h3 class="card__title">Recruiter progress</h3></div>
          <div class="card__body card__body--flush"><div class="table-wrap"><table class="data-table data-table--compact">
            <thead><tr><th>Recruiter</th><th>Total</th><th>Pending</th><th>Interested</th><th>Interviewed</th><th>Joined</th><th>Dropped</th></tr></thead>
            <tbody>${payload.recruiters.length ? payload.recruiters.map((r) => `<tr>
              <td class="cell-name">${U.esc(r.name)}<span class="cell-sub">${U.esc(r.employee_code || '')}</span></td>
              <td class="cell-num">${r.total}</td><td class="cell-num">${r.pending}</td><td class="cell-num">${r.interested}</td>
              <td class="cell-num">${r.interviewed}</td><td class="cell-num"><strong>${r.joined}</strong></td><td class="cell-num">${r.dropped}</td></tr>`).join('')
              : '<tr><td colspan="7" class="cell-muted">No recruiter has been assigned yet.</td></tr>'}
            </tbody></table></div></div></section>

        <section class="card"><div class="card__head"><h3 class="card__title">Contacts</h3><p class="card__sub">Tap a contact to see every call log and the full history</p></div>
          <div class="card__body">
            <div class="tabs tabs--scroll" id="contactTabs" role="tablist" aria-label="Filter contacts"></div>
            <input class="control" id="contactSearch" type="search" placeholder="Search name, mobile or detail" value="${U.esc(view.q)}" style="margin-top:10px;max-width:320px" aria-label="Search contacts" />
          </div>
          <div class="card__body card__body--flush"><div class="table-wrap"><table class="data-table">
            <thead><tr><th>Contact</th><th>Mobile</th><th>Detail</th><th>Outcome per recruiter</th><th>Joined</th></tr></thead>
            <tbody id="contactRows"></tbody>
          </table></div><div id="contactPager"></div></div></section>

        <section class="card"><div class="card__head"><h3 class="card__title">Sheet diary</h3><p class="card__sub">Every create, assign, call outcome and joining — the paper diary, digitised</p></div>
          <div class="card__body"><ul class="diary">${(view.more ? payload.activity : payload.activity.slice(0, 15)).map(diaryLi).join('') || '<li class="cell-muted">Nothing logged yet.</li>'}</ul>
          ${payload.activity.length > 15 ? `<button class="btn btn--ghost btn--sm" type="button" data-diary-more style="margin-top:8px">${view.more ? 'Show less' : `Show older ${payload.activity.length - 15} entries`}</button>` : ''}</div></section>`;

      renderContacts();
      A.pagination.bind(U.by('contactPager'), (p) => { view.page = p; renderContacts(); });
    }

    function diaryLi(a) {
      return `<li>
        <span class="diary__dot diary__dot--${a.action === 'joined' ? 'ok' : a.action === 'status' ? 'note' : 'info'}"></span>
        <div><strong>${U.esc(a.actorName)}</strong> · ${U.esc(labelForAction(a.action))}${a.detail ? ` — ${U.esc(a.detail)}` : ''}${a.rowName ? ` (${U.esc(a.rowName)})` : ''}
        <p class="cell-sub">${U.fmtDateTime(a.at)}</p></div></li>`;
    }

    function contactRow(r) {
      return `<tr class="is-clickable" data-row="${U.esc(r.id)}" tabindex="0">
        <td class="cell-name">${U.esc(r.name)}</td>
        <td><a class="link-btn" href="tel:${U.esc(r.mobile)}">${U.esc(r.mobile)}</a></td>
        <td class="cell-muted cell-ellip">${U.esc(r.detail)}</td>
        <td>${r.entries.length ? `<div class="entry-chips">${r.entries.map((e) =>
          `<span class="entry-chip ${e.status}"><i></i>${U.esc(e.recruiterName.split(' ')[0])}: ${STATUS_META[e.status].label}</span>`).join('')}</div>` : '<span class="cell-muted">Unassigned</span>'}</td>
        <td>${r.recruitId ? `<a class="link-btn" href="#/recruits/${U.esc(r.recruitId)}">${U.esc(r.recruitCode)}</a><span class="cell-sub">by ${U.esc(r.joinedBy || '—')}</span>` : '<span class="cell-muted">—</span>'}</td>
      </tr>`;
    }

    function renderContacts() {
      const rows = lastPayload.rows;
      const q = view.q.trim().toLowerCase();
      const filtered = rows.filter((r) => {
        if (view.tab === 'joined') { if (!r.recruitId) return false; }
        else if (view.tab !== 'all' && !r.entries.some((e) => e.status === view.tab)) return false;
        return !q || `${r.name} ${r.mobile} ${r.detail}`.toLowerCase().indexOf(q) !== -1;
      });
      const per = 25;
      const pageCount = Math.max(1, Math.ceil(filtered.length / per));
      if (view.page > pageCount) view.page = pageCount;
      U.by('contactRows').innerHTML = filtered.slice((view.page - 1) * per, view.page * per).map(contactRow).join('')
        || '<tr><td colspan="5" class="cell-muted">No contacts match this filter.</td></tr>';
      U.by('contactTabs').innerHTML = [['all', 'All']].concat(STATUS_ORDER.map((s) => [s, STATUS_META[s].label])).map(([key, label]) => {
        const n = key === 'all' ? rows.length : key === 'joined' ? rows.filter((r) => r.recruitId).length : rows.filter((r) => r.entries.some((e) => e.status === key)).length;
        return `<button class="tab${view.tab === key ? ' is-on' : ''}" type="button" role="tab" aria-selected="${view.tab === key}" data-tab="${key}">${label}<span class="tab__count">${n}</span></button>`;
      }).join('');
      U.by('contactPager').innerHTML = A.pagination.render({ page: view.page, totalPages: pageCount, total: filtered.length, limit: per, hasNext: view.page < pageCount, hasPrev: view.page > 1 });
    }

    function labelForAction(action) {
      return { sheet_created: 'created the sheet', rows_imported: 'imported contacts', assigned: 'assigned a recruiter', status: 'logged a call outcome', remarks: 'updated remarks', joined: 'marked a contact as joined', closed: 'closed the sheet', reopened: 'reopened the sheet' }[action] || action;
    }

    const actions2 = {
      export() { return A.api.download(`/sheets/${id}/export.csv`, 'sheet.csv'); },
      rows() {
        const m = A.ui.modal({
          title: 'Add contacts',
          body: `<div class="field"><label class="field__label" for="appendPaste">Contacts <span class="req">*</span></label>
            <textarea class="control" id="appendPaste" rows="6" data-autofocus placeholder="Name, Mobile, Detail — one per line"></textarea>
            <span class="field__hint">Same paste rules as sheet creation. Recruiters already on this sheet get the new contacts automatically.</span></div>`,
          actions: [
            { label: 'Cancel', onClick: (x) => x.close() },
            { label: 'Add', variant: 'primary', onClick: (x) => {
              const contacts = parseContacts(U.by('appendPaste').value).rows.filter((r) => r.ok);
              if (!contacts.length) { A.ui.toast('error', 'Nothing to add', 'Paste at least one line with a valid mobile.'); return; }
              const btn = x.foot.querySelector('.btn--primary');
              btn.disabled = true;
              A.api.post(`/sheets/${id}/rows`, { rows: contacts.map((r) => ({ name: r.name, mobile: r.mobile, detail: r.detail })) })
                .then((result) => { x.close(); A.ui.toast('success', 'Contacts added', `${result.accepted} added${result.duplicates ? `, ${result.duplicates} duplicate skipped` : ''}`); return refresh(); })
                .catch((error) => { btn.disabled = false; A.ui.toast('error', 'Not added', error.message); });
            } },
          ],
        });
        return m;
      },
      assign() {
        return A.api.get('/sheets/assignable').then((assignable) => {
          const current = new Set(recruiterIdsOnSheet);
          const people = assignable.items || [];
          const m = A.ui.modal({
            title: 'Assign recruiters',
            body: `<p class="card__sub">Every contact on this sheet is added to the picked recruiters' call list.</p>
              <div class="presets" style="margin-top:10px">${people.map((p) =>
                `<button type="button" class="preset${current.has(p.id) ? ' is-on' : ''}" data-pick2="${U.esc(p.id)}">${U.esc(p.name)}</button>`).join('')}</div>`,
            actions: [
              { label: 'Cancel', onClick: (x) => x.close() },
              { label: 'Assign', variant: 'primary', onClick: (x) => {
                const ids = Array.from(x.body.querySelectorAll('[data-pick2].is-on')).map((b) => b.dataset.pick2);
                if (!ids.length) { A.ui.toast('error', 'Pick someone', 'Select at least one recruiter.'); return; }
                const btn = x.foot.querySelector('.btn--primary');
                btn.disabled = true;
                A.api.post(`/sheets/${id}/assign`, { recruiterIds: ids })
                  .then((result) => { x.close(); A.ui.toast('success', 'Assigned', result.message); return refresh(); })
                  .catch((error) => { btn.disabled = false; A.ui.toast('error', 'Not assigned', error.message); });
              } },
            ],
          });
          U.delegate(m.body, 'click', '[data-pick2]', (ev, btn) => btn.classList.toggle('is-on'));
          return m;
        });
      },
      close() {
        return A.ui.confirm({
          title: 'Close sheet', tone: 'warning', confirmLabel: 'Close sheet', cancelLabel: 'Keep open',
          message: 'Recruiters finish pending calls, but no new contacts can be added.',
        }).then((yes) => { if (!yes) return A.ui.toast('info', 'No change', 'Sheet stays open.'); return A.api.patch(`/sheets/${id}/status`, { status: 'closed' }).then(() => { A.ui.toast('success', 'Sheet closed', 'The sheet is now read-only for managers.'); return refresh(); }); });
      },
      reopen() {
        return A.api.patch(`/sheets/${id}/status`, { status: 'open' }).then(() => { A.ui.toast('success', 'Sheet reopened', 'Contacts can be added and assigned again.'); return refresh(); });
      },
      delete() {
        return A.ui.confirm({
          title: 'Delete sheet', tone: 'danger', confirmLabel: 'Delete sheet', cancelLabel: 'Keep it',
          message: `<strong>Remove the whole sheet</strong>, its contacts, call outcomes and diary. Recruits that already joined are NOT deleted. This cannot be undone.`,
        }).then((yes) => {
          if (!yes) return;
          return A.api.del(`/sheets/${id}`).then(() => { A.ui.toast('success', 'Sheet deleted', ''); A.router('#/sheets'); });
        });
      },
    };

    function refresh() {
      loading(host, 7);
      return A.api.get(`/sheets/${id}`).then((payload) => {
        paint(payload);
      });
    }

    return fetchJson().then((payload) => {
      paint(payload);
      return payload;
    }).catch((error) => A.loadFailed(container, error));
  };

  /* ---------- Contact history modal ---------- */
  function openRowHistory(rowId) {
    A.api.get(`/sheets/rows/${rowId}/history`).then((payload) => {
      const body = `<div class="detail-grid">${[['Contact', payload.item.name], ['Mobile', payload.item.mobile], ['Detail', payload.item.detail || '—'], ['Sheet', payload.item.sheetName]]
        .map(([k, v]) => `<div class="detail-item"><p class="detail-item__label">${k}</p><p class="detail-item__value">${U.esc(v)}</p></div>`).join('')}</div>
        <div class="section-title">Call log</div>
        ${payload.entries.length ? payload.entries.map((e) => `<div class="entry-row">
          ${A.sheetsMeta.statusBadge(e.status)}<strong>${U.esc(e.recruiterName)}</strong>
          <span class="cell-sub">${U.fmtDateTime(e.statusAt)}</span>
          ${e.remarks ? `<p class="cell-muted">${U.esc(e.remarks)}</p>` : ''}</div>`).join('') : '<p class="cell-muted">No recruiter has worked this contact.</p>'}
        <div class="section-title">History</div>
        <ul class="diary">${payload.activity.map((a) => `<li><span class="diary__dot diary__dot--note"></span><div><strong>${U.esc(a.actorName)}</strong> — ${U.esc(a.detail || a.action)}<p class="cell-sub">${U.fmtDateTime(a.at)}</p></div></li>`).join('') || '<li class="cell-muted">No history.</li>'}</ul>`;
      A.ui.notice(`${payload.item.name}`, body, 'Close');
    }).catch((error) => A.ui.toast('error', 'History not loaded', error.message));
  }
  A.sheetsMeta.openRowHistory = openRowHistory;
})(window.App);
