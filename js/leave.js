window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  const FILTERS = ['All', 'Applied', 'Accepted', 'Rejected'];
  let filter = 'All';

  /* Managers and admins keep their own leave apart from the team queue. */
  let tab = 'my';

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function statCard(opts) {
    return `<article class="stat" style="--accent:${opts.color}">
      <div class="stat__top">
        <span class="stat__label">${opts.label}</span>
        <span class="stat__icon">${icon(opts.icon)}</span>
      </div>
      <p class="stat__value">${opts.value}</p>
      <p class="stat__meta">${opts.meta}</p>
    </article>`;
  }

  function statusBadge(status) {
    if (status === 'Accepted') return '<span class="badge badge--active"><i></i>Accepted</span>';
    if (status === 'Rejected') return '<span class="badge badge--inactive"><i></i>Rejected</span>';
    return '<span class="badge badge--brand"><i></i>Applied</span>';
  }

  /* The manager sees whose leave it is and decides; the recruiter only reads. */
  function decisionCell(leave) {
    if (leave.status !== 'Applied') {
      return `<span class="cell-muted">${U.esc(leave.decidedBy || S.approverName(leave.ownerId))} · ${U.fmtDate(leave.decidedOn)}</span>`;
    }
    if (!S.canDecide(leave.ownerId)) {
      return `<span class="cell-muted">With ${U.esc(S.approverName(leave.ownerId))}</span>`;
    }
    return `<div class="btn-row">
      <button class="btn btn--sm" type="button" data-accept-leave="${U.esc(leave.id)}">${icon('check')} Accept</button>
      <button class="btn btn--sm btn--danger" type="button" data-reject-leave="${U.esc(leave.id)}">${icon('x')} Reject</button>
    </div>`;
  }

  function rowHTML(leave, withOwner) {
    const reason = `${U.esc(leave.reason)}${leave.remarks ? `<span class="cell-sub">${U.esc(leave.remarks)}</span>` : ''}`;
    return `<tr>
      <td>${U.fmtDate(leave.date)}<span class="cell-sub">${U.esc(leave.id)}</span></td>
      ${withOwner ? `<td>${U.esc(S.ownerName(leave.ownerId))}<span class="cell-sub">${U.esc(leave.ownerId === S.session.userId ? 'your leave' : 'reports to you')}</span></td>` : ''}
      <td>${reason}</td>
      <td>${statusBadge(leave.status)}</td>
      <td>${U.fmtDate(leave.appliedOn)}</td>
      <td>${decisionCell(leave)}</td>
    </tr>`;
  }

  function head(withOwner) {
    return `<tr>
      <th scope="col">Date</th>
      ${withOwner ? '<th scope="col">Recruiter</th>' : ''}
      <th scope="col">Reason</th>
      <th scope="col">Status</th>
      <th scope="col">Applied on</th>
      <th scope="col">Decision</th>
    </tr>`;
  }

  function tableBody(list, withOwner) {
    const cols = withOwner ? 6 : 5;
    if (!list.length) {
      const heading = filter === 'All' ? 'No leave requests' : `No ${filter.toLowerCase()} requests`;
      return `<tr><td colspan="${cols}"><div class="empty">
        <span class="empty__icon">${icon('calendar')}</span>
        <h3>${heading}</h3>
        <p>${filter === 'All' ? 'Apply for leave to add the first request.' : 'Switch to another status or show all requests.'}</p>
        ${filter === 'All' ? '' : '<button class="btn" type="button" data-filter="All">Show all</button>'}
      </div></td></tr>`;
    }
    return list.map((l) => rowHTML(l, withOwner)).join('');
  }

  function tabsBar() {
    const items = [
      { key: 'my', label: 'My leave', count: S.myLeaves().length },
      { key: 'team', label: 'Team requests', count: S.leaveList().length },
    ];
    return `<div class="tabs" role="tablist" aria-label="Leave views">
      ${items.map((t) => `<button class="tab${tab === t.key ? ' is-on' : ''}" type="button" role="tab"
        aria-selected="${tab === t.key}" data-leave-tab="${t.key}">${t.label}<span class="tab__count">${t.count}</span></button>`).join('')}
    </div>`;
  }

  function content() {
    const manager = S.hasTeam();
    const onTeam = manager && tab === 'team';
    const approver = S.approverName();

    const all = onTeam ? S.leaveList() : S.myLeaves();
    const list = all.filter((l) => filter === 'All' || l.status === filter);
    const count = (status) => all.filter((l) => l.status === status).length;
    const s = {
      total: all.length,
      accepted: count('Accepted'),
      pending: count('Applied'),
      rejected: count('Rejected'),
    };
    const queue = S.pendingLeaves().length;
    const withOwner = onTeam;

    const intro = onTeam
      ? `${s.total} request${s.total === 1 ? '' : 's'} across your team · ${queue} waiting on your decision.`
      : manager
        ? `${s.total} personal request${s.total === 1 ? '' : 's'} on record · ${s.pending} with ${U.esc(approver)} for a decision.`
        : `${s.total} request${s.total === 1 ? '' : 's'} on record · ${s.pending} with ${U.esc(approver)} for a decision.`;
    const listSub = onTeam
      ? 'Leave dates, newest first · accept or reject the requests below.'
      : `Your leave dates, newest first · decisions are made by ${U.esc(approver)}, not here.`;
    const pendingMeta = onTeam ? 'Waiting on you' : `With ${U.esc(approver)}`;

    return `<div class="page-head">
      <div class="page-head__text">
        <h2>Leave</h2>
        <p>${intro}</p>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--primary" type="button" id="applyLeaveBtn">${icon('plus')} Apply Leave</button>
      </div>
    </div>
    ${manager ? tabsBar() : ''}

    <div class="stat-grid">
      ${statCard({ label: 'Total Applied', value: s.total, icon: 'calendar', color: 'var(--brand)', meta: onTeam ? 'Team requests on record' : 'All requests on record' })}
      ${statCard({ label: 'Accepted', value: s.accepted, icon: 'check', color: 'var(--success)', meta: 'Leave approved' })}
      ${statCard({ label: 'Pending', value: s.pending, icon: 'clock', color: 'var(--warning)', meta: pendingMeta })}
      ${statCard({ label: 'Rejected', value: s.rejected, icon: 'x', color: 'var(--danger)', meta: 'Leave declined' })}
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">${onTeam ? 'Team leave requests' : 'My leave requests'}<span class="count-pill">${list.length}</span></h3>
          <p class="card__sub">${listSub}</p>
        </div>
        <div class="presets" role="group" aria-label="Filter leave requests by status">
          <span class="presets__label">Status</span>
          ${FILTERS.map((name) => `<button class="preset${name === filter ? ' is-on' : ''}" type="button" data-filter="${name}">${name}</button>`).join('')}
        </div>
      </div>
      <div class="card__body card__body--flush">
        <div class="table-wrap">
          <table class="data-table data-table--compact">
            <thead>${head(withOwner)}</thead>
            <tbody id="leaveRows">${tableBody(list, withOwner)}</tbody>
          </table>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Apply ---------- */
  function openApplyModal(onSaved) {
    const r = S.user();
    const body = `<p>Applying for leave for ${U.esc(r.name)} (${U.esc(r.employeeId)}). Routed to ${U.esc(S.reportingLine())} for a decision.</p>
      <div class="field" style="margin:14px 0">
        <label class="field__label" for="leaveDate">Date <span class="req">*</span></label>
        <div id="leaveDate-host"></div>
        <span class="field__error"></span>
      </div>
      <div class="field" style="margin-bottom:14px">
        <label class="field__label" for="leaveReason">Reason <span class="req">*</span></label>
        <select class="control" id="leaveReason">
          <option value="">Select reason…</option>
          ${S.masterActive('leaveReasons').map((value) => `<option value="${U.esc(value)}">${U.esc(value)}</option>`).join('')}
        </select>
        <span class="field__error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="leaveRemarks">Remarks</label>
        <input class="control" id="leaveRemarks" type="text" maxlength="120" placeholder="Optional" />
        <span class="field__hint">Shown under the reason in the request list.</span>
      </div>`;

    A.ui.modal({
      title: 'Apply Leave',
      body,
      compact: true,
      actions: [
        { label: 'Cancel', onClick: (m) => m.close() },
        {
          label: 'Apply',
          variant: 'primary',
          onClick: (m) => {
            const dateField = U.by('leaveDate').closest('.field');
            const reasonField = U.by('leaveReason').closest('.field');
            const date = A.DateField.valueOf('leaveDate');
            const reason = U.by('leaveReason').value;
            dateField.classList.remove('has-error');
            reasonField.classList.remove('has-error');

            if (!date) {
              A.ui.error(dateField, 'Select a date');
              A.ui.toast('error', 'Date required', 'Pick the leave date before applying.');
              return;
            }
            
            // Prevent selecting past dates for leave
            const today = U.todayKey();
            if (date < today) {
              A.ui.error(dateField, 'Cannot select past date');
              A.ui.toast('error', 'Invalid date', 'Leave can only be applied for future dates or today.');
              return;
            }
            
            if (!reason) {
              A.ui.error(reasonField, 'Select a reason');
              A.ui.toast('error', 'Reason required', 'Choose a leave reason.');
              return;
            }
            m.close();
            S.applyLeave({
              date,
              reason,
              remarks: U.by('leaveRemarks').value.trim(),
            }).then((request) => {
              filter = 'All';
              A.ui.toast('success', 'Leave applied', `${request.id} for ${U.fmtDate(request.date)} is with ${S.approverName()} for a decision.`);
              onSaved();
            }).catch((error) => {
              A.ui.toast('error', 'Leave not applied', error.message);
            });
          },
        },
      ],
      onMount: () => {
        A.DateField({ mount: 'leaveDate-host', id: 'leaveDate', label: 'Leave date', value: U.todayKey(), min: U.todayKey() });
        ['leaveDate', 'leaveReason'].forEach((id) => {
          U.by(id).addEventListener('change', () => U.by(id).closest('.field').classList.remove('has-error'));
        });
      },
    });
  }

  /* ---------- Decision ---------- */
  // Only the member's own reporting manager gets Accept / Reject on a row.
  function acceptLeave(id, host) {
    S.decideLeave(id, 'Accepted').then((request) => {
      if (!request) return;
      A.ui.toast('success', 'Leave accepted', `${request.id} for ${U.fmtDate(request.date)} accepted.`);
      paint(host);
    }).catch((error) => {
      A.ui.toast('error', 'Decision not saved', error.message);
    });
  }

  function rejectLeave(id, host) {
    const request = S.store.leaves.filter((l) => l.id === id)[0];
    if (!request) return;
    A.ui.confirm({
      title: 'Reject leave',
      tone: 'danger',
      confirmLabel: 'Reject leave',
      cancelLabel: 'Keep as applied',
      message: `Rejects leave <strong>${U.esc(request.id)}</strong> for ${U.esc(S.ownerName(request.ownerId))} on ${U.fmtDate(request.date)}. The day stays a working day.`,
    }).then((accepted) => {
      if (!accepted) return;
      S.decideLeave(id, 'Rejected').then((decided) => {
        if (!decided) return;
        A.ui.toast('info', 'Leave rejected', `${decided.id} for ${U.fmtDate(decided.date)} rejected.`);
        paint(host);
      }).catch((error) => {
        A.ui.toast('error', 'Decision not saved', error.message);
      });
    });
  }

  function paint(host) {
    host.innerHTML = content();
    U.by('applyLeaveBtn').addEventListener('click', () => openApplyModal(() => paint(host)));
  }

  // The click target changes on every repaint, so the delegation lives on the host once.
  function bindRows(host) {
    host.addEventListener('click', (ev) => {
      const tabBtn = ev.target.closest('[data-leave-tab]');
      if (tabBtn) {
        tab = tabBtn.dataset.leaveTab;
        filter = 'All';
        paint(host);
        return;
      }
      const filterBtn = ev.target.closest('[data-filter]');
      if (filterBtn) {
        filter = filterBtn.dataset.filter;
        paint(host);
        return;
      }
      const accept = ev.target.closest('[data-accept-leave]');
      if (accept) {
        acceptLeave(accept.dataset.acceptLeave, host);
        return;
      }
      const reject = ev.target.closest('[data-reject-leave]');
      if (reject) rejectLeave(reject.dataset.rejectLeave, host);
    });
  }

  pages.leave = function (container) {
    filter = 'All';
    tab = 'my';
    container.innerHTML = '<div id="leaveHost"></div>';
    const host = U.by('leaveHost');
    bindRows(host);
    host.innerHTML = `<div class="page-head">
      <div class="page-head__text"><h2>Leave</h2><p>Loading requests…</p></div>
    </div>
    <div class="stat-grid">${[0, 1, 2, 3].map(() => '<article class="stat"><div class="stat__top"><span class="stat__label"><span class="skeleton" style="display:inline-block;width:72px;height:11px"></span></span></div><p class="stat__value"><span class="skeleton" style="display:inline-block;width:38px;height:20px"></span></p></article>').join('')}</div>
    <section class="card"><div class="card__body">${[0, 1, 2, 3, 4, 5].map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:10px"></span>').join('')}</div></section>`;

    return S.reload(['leave', 'staff', 'master']).then(() => paint(host));
  };
})(window.App);
