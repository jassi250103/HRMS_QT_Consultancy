window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});
  const M = A.sheetsMeta;

  let tab = 'all';
  let sheetFilter = '';
  let sheetNames = [];
  const PER_PAGE = 25;
  let page = 1;

  function icon(name) { return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`; }

  function telLink(mobile) {
    return `<a class="call-card__tel" href="tel:${U.esc(mobile)}" aria-label="Call ${U.esc(mobile)}">${icon('phone')} ${U.esc(mobile)}</a>`;
  }

  function quickStatuses(item) {
    if (item.row.recruitId) return '';
    const options = ['no_answer', 'interested', 'interviewed', 'not_interested', 'wrong_number'];
    return `<div class="quick-status">${options.map((s) =>
      `<button type="button" class="qs qs--${s}${item.status === s ? ' is-on' : ''}" data-status="${s}" data-entry="${U.esc(item.entryId)}">${M.STATUS_META[s].label}</button>`).join('')}
      <button type="button" class="qs qs--joined" data-join="${U.esc(item.entryId)}">${icon('check')} Joined</button></div>`;
  }

  function card(item) {
    const locked = !!item.row.recruitId;
    return `<article class="call-card${locked ? ' call-card--locked' : ''}${item.sheet.status === 'closed' ? ' call-card--closed' : ''}" data-card="${U.esc(item.entryId)}">
      <div class="call-card__head">
        <div><strong>${U.esc(item.row.name)}</strong>${item.sheet.name ? `<p class="cell-sub">${U.esc(item.sheet.name)}${item.sheet.status === 'closed' ? ' · closed' : ''}</p>` : ''}</div>
        ${M.statusBadge(item.status)}
      </div>
      ${locked ? `<p class="call-card__joined">${icon('check')} Joined as <a class="link-btn" href="#/recruits/${U.esc(item.row.recruitId)}">${U.esc(item.row.recruitCode)}</a> by ${U.esc(item.row.joinedBy || '—')}</p>` : ''}
      <div class="call-card__meta">
        ${telLink(item.row.mobile)}
        ${item.row.detail ? `<span class="cell-muted">${U.esc(item.row.detail)}</span>` : ''}
      </div>
      <div class="field" style="margin:8px 0">
        <textarea class="control call-remarks" data-entry="${U.esc(item.entryId)}" rows="2" placeholder="Remarks from the call…" ${locked ? 'disabled' : ''}>${U.esc(item.remarks || '')}</textarea>
      </div>
      ${locked ? '' : `<div class="btn-row btn-row--end"><button type="button" class="btn btn--ghost btn--sm" data-save="${U.esc(item.entryId)}">Save remarks</button></div>`}
      ${quickStatuses(item)}
      <div class="call-card__foot"><button type="button" class="link-btn" data-history="${U.esc(item.row.id)}">History and other recruiters ${icon('chev')}</button></div>
    </article>`;
  }

  pages.myCalls = function (container) {
    container.innerHTML = `<div class="page-head"><div class="page-head__text"><h2>My Calls</h2><p>Sheet contacts assigned to you — log what happened on each call</p></div></div>
      <div class="filters"><div class="filters__row" id="sheetFilterMount"></div></div>
      <div id="callTabs"></div>
      <div id="callList"></div>
      <div id="callPager"></div>`;
    const list = U.by('callList');
    list.innerHTML = '<section class="card"><div class="card__body">' + '<span class="skeleton" style="display:block;height:70px;margin-bottom:12px"></span>'.repeat(4) + '</div></section>';
    let firstLoad = true;

    function refresh() {
      return A.api.get('/sheets/my/entries').then((payload) => {
        pages.myCalls._items = payload.items || [];
        paintTabs(payload.counts || {});
        paintList();
        if (firstLoad) {
          firstLoad = false;
          const seen = {};
          pages.myCalls._items.forEach((i) => { seen[i.sheet.id] = i.sheet.name; });
          sheetNames = Object.keys(seen).map((id) => ({ id, name: seen[id] }));
          if (sheetNames.length > 1) {
            const current = sheetNames.filter((s) => s.id === sheetFilter)[0];
            A.ui.Combobox({
              mount: U.by('sheetFilterMount'),
              data: ['All sheets'].concat(sheetNames.map((s) => s.name)),
              value: current ? current.name : '',
              placeholder: 'All sheets',
              label: 'Sheet',
              searchable: false,
              onChange(value) {
                const hit = sheetNames.filter((s) => s.name === value)[0];
                sheetFilter = hit ? hit.id : '';
                page = 1;
                paintList();
                paintTabs(cacheCounts);
              },
            });
          }
        }
      });
    }

    function paintList() {
      const items = (pages.myCalls._items || [])
        .filter((i) => tab === 'all' || i.status === tab)
        .filter((i) => !sheetFilter || i.sheet.id === sheetFilter);
      if (!items.length) {
        list.innerHTML = `<section class="card"><div class="card__body"><div class="empty">
          <span class="empty__icon">${icon('phone')}</span>
          <h3>No calls here</h3>
          <p>${tab === 'all' && !sheetFilter ? 'Your manager has not assigned any sheet to you yet. Sheets arrive here automatically when they are assigned.' : 'Nothing matches this filter.'}</p>
        </div></div></section>`;
        U.by('callPager').innerHTML = '';
        return;
      }
      const totalPages = Math.max(1, Math.ceil(items.length / PER_PAGE));
      if (page > totalPages) page = totalPages;
      if (page < 1) page = 1;
      const from = (page - 1) * PER_PAGE;
      const shown = items.slice(from, from + PER_PAGE);
      list.innerHTML = `<div class="call-list">${shown.map(card).join('')}</div>`;
      U.by('callPager').innerHTML = A.pagination.render({
        page, totalPages, total: items.length, limit: PER_PAGE,
        hasPrev: page > 1, hasNext: page < totalPages,
      });
    }

    let cacheCounts = {};
    function paintTabs(counts) {
      cacheCounts = counts;
      const tabs = [['all', 'All']].concat(M.STATUS_ORDER.map((s) => [s, M.STATUS_META[s].label]));
      const total = Object.keys(counts).reduce((n, k) => n + counts[k], 0);
      U.by('callTabs').innerHTML = `<div class="tabs tabs--scroll" role="tablist" aria-label="Call outcomes">${tabs.map(([key, label]) => {
        const scoped = sheetFilter ? (pages.myCalls._items || []).filter((i) => i.sheet.id === sheetFilter) : null;
        let n = key === 'all' ? total : counts[key];
        if (scoped) {
          n = key === 'all' ? scoped.length : scoped.filter((i) => i.status === key).length;
        }
        return `<button class="tab${tab === key ? ' is-on' : ''}" type="button" role="tab" aria-selected="${tab === key}" data-tab="${key}">${label}<span class="tab__count">${n}</span></button>`;
      }).join('')}</div>`;
    }

    U.delegate(container, 'click', '[data-tab]', (ev, btn) => {
      tab = btn.dataset.tab;
      page = 1;
      paintList();
      paintTabs(cacheCounts);
    });

    U.delegate(container, 'click', '[data-page]', (ev, btn) => {
      const next = parseInt(btn.dataset.page, 10);
      if (!next || btn.disabled) return;
      page = next;
      paintList();
      const top = U.by('callList');
      if (top) window.scrollTo({ top: top.getBoundingClientRect().top + window.scrollY - 12, behavior: 'smooth' });
    });

    U.delegate(container, 'click', '[data-status]', (ev, btn) => {
      const entryId = btn.dataset.entry;
      const status = btn.dataset.status;
      btn.disabled = true;
      A.api.patch(`/sheets/entries/${entryId}`, { status }).then(() => {
        A.ui.toast('success', 'Logged', M.STATUS_META[status].label);
        return refresh();
      }).catch((error) => {
        A.ui.toast('error', 'Not saved', error.message);
        if (btn.isConnected) btn.disabled = false;
      });
    });

    U.delegate(container, 'click', '[data-save]', (ev, btn) => {
      const entryId = btn.dataset.save;
      const box = container.querySelector(`.call-remarks[data-entry="${entryId}"]`);
      btn.disabled = true;
      A.api.patch(`/sheets/entries/${entryId}`, { remarks: box ? box.value.trim() : '' }).then(() => {
        A.ui.toast('success', 'Remarks saved', 'Notes stored on this call.');
      }).catch((error) => A.ui.toast('error', 'Not saved', error.message))
        .then(() => { if (btn.isConnected) btn.disabled = false; });
    });

    U.delegate(container, 'click', '[data-history]', (ev, btn) => M.openRowHistory(btn.dataset.history));

    U.delegate(container, 'click', '[data-join]', (ev, btn) => {
      const cardEl = btn.closest('[data-card]');
      const remarksBox = cardEl.querySelector('.call-remarks');
      const entry = (pages.myCalls._items || []).filter((i) => i.entryId === btn.dataset.join)[0];
      btn.disabled = true;
      startJoin(entry, remarksBox ? remarksBox.value.trim() : '', btn);
    });

    return refresh().catch((error) => A.loadFailed(container, error));
  };

  /* ---------- Joined: link an existing recruit, or open the pre-filled add form ---------- */
  function startJoin(entry, callRemarks, btn) {
    if (!entry) { if (btn) btn.disabled = false; return; }
    A.api.get('/recruits/exists?mobile=' + encodeURIComponent(entry.row.mobile)).then((res) => {
      if (res.found) { linkExisting(entry, res); return; }
      A.pendingJoin = { rowId: entry.row.id, name: entry.row.name, mobile: entry.row.mobile, remarks: callRemarks || '' };
      A.router('#/recruits/new');
    }).catch((error) => {
      if (btn) btn.disabled = false;
      A.ui.toast('error', 'Could not start', error.message);
    });
  }

  function linkExisting(entry, res) {
    A.api.post(`/sheets/rows/${entry.row.id}/convert`, {}).then((result) => {
      A.ui.toast('success', 'Linked to existing recruit', result.message);
      S.reload(['recruits', 'staff']).then(() => {
        const fresh = pages.myCalls._items.filter((i) => i.entryId === entry.entryId)[0];
        if (fresh) { fresh.row.recruitId = result.item.id; fresh.row.recruitCode = result.item.code || res.code; }
        A.router('#/my-calls');
      });
    }).catch((error) => {
      if (error.status === 409) {
        A.ui.notice('Already joined', `<p>${U.esc(error.message)}</p>`, 'Understood');
        A.router('#/my-calls');
        return;
      }
      A.ui.toast('error', 'Not saved', error.message);
    });
  }
})(window.App);
