window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function lastWorkingDay() {
    const date = U.parseISO(U.todayKey());
    date.setDate(date.getDate() + S.policy().noticeDays);
    return U.isoOf(date);
  }

  function ynGroup(name, label, yesLabel, noLabel, value) {
    const options = [{ key: 'yes', label: yesLabel }, { key: 'no', label: noLabel }];
    return `<div class="yn" role="radiogroup" aria-label="${U.esc(label)}">
      ${options.map((o) => {
        const on = (value === true && o.key === 'yes') || (value === false && o.key === 'no');
        return `<label class="yn__opt${on ? ' is-on' : ''}">
          <input class="yn__input" type="radio" name="${name}" value="${o.key}"${on ? ' checked' : ''} />
          <span class="yn__dot" aria-hidden="true"></span><span>${o.label}</span>
        </label>`;
      }).join('')}
    </div>`;
  }

  function question(num, text) {
    return `<p class="res-q"><span class="res-q__num">${num}</span>${text}</p>`;
  }

  /* ---------- Filed state ---------- */
  function filedContent(filing) {
    const r = S.user();
    return `<div class="page-head">
      <div class="page-head__text">
        <h2>Resignation</h2>
        <p>Filed ${U.fmtDate(filing.filedOn)} for ${U.esc(r.name)} (${U.esc(r.employeeId)}).</p>
      </div>
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Notice status</h3>
          <p class="card__sub">Read-only copy of the filed request</p>
        </div>
        <span class="badge badge--active"><i></i>${filing.status}</span>
      </div>
      <div class="card__body">
        <div class="alert alert--success">${icon('check')}<div class="alert__body"><p><strong>Notice running.</strong> Hand over open mandates before ${U.fmtDate(filing.lastWorkingDay)}.</p></div></div>
        <div class="detail-grid" style="margin-top:12px">
          <div class="detail-item"><p class="detail-item__label">Notice start</p><p class="detail-item__value">${U.fmtDate(filing.noticeStart)}</p></div>
          <div class="detail-item"><p class="detail-item__label">Notice period</p><p class="detail-item__value">${filing.noticeDays} days</p></div>
          <div class="detail-item"><p class="detail-item__label">Last working day</p><p class="detail-item__value">${U.fmtDate(filing.lastWorkingDay)}</p></div>
          <div class="detail-item"><p class="detail-item__label">Reason</p><p class="detail-item__value">${U.esc(filing.reason)}</p></div>
          <div class="detail-item"><p class="detail-item__label">Remarks</p><p class="detail-item__value${filing.remarks ? '' : ' detail-item__value--muted'}">${filing.remarks ? U.esc(filing.remarks) : 'Not provided'}</p></div>
          <div class="detail-item"><p class="detail-item__label">Notified manager</p><p class="detail-item__value">${U.esc(S.reportingLine())}</p></div>
        </div>
      </div>
      <div class="card__foot">
        <div class="btn-row btn-row--end">
          <button class="btn btn--danger" type="button" id="withdrawBtn">${icon('x')} Withdraw Resignation</button>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Team queue (manager) ---------- */
  function releaseCell(filing) {
    if (filing.release !== 'Pending') {
      return `<span class="cell-muted">${U.esc(filing.decidedBy)} · ${U.fmtDate(filing.decidedOn)}</span>`;
    }
    if (!S.canDecide(filing.ownerId)) {
      return `<span class="cell-muted">With ${U.esc(S.approverName(filing.ownerId))}</span>`;
    }
    return `<div class="btn-row">
      <button class="btn btn--sm" type="button" data-accept-release="${U.esc(filing.ownerId)}">${icon('check')} Accept</button>
      <button class="btn btn--sm btn--danger" type="button" data-reject-release="${U.esc(filing.ownerId)}">${icon('x')} Reject</button>
    </div>`;
  }

  function releaseBadge(filing) {
    if (filing.release === 'Accepted') return '<span class="badge badge--active"><i></i>Release accepted</span>';
    if (filing.release === 'Rejected') return '<span class="badge badge--inactive"><i></i>Release rejected</span>';
    return `<span class="badge badge--brand"><i></i>${U.esc(filing.status)}</span>`;
  }

  function queueContent(filings) {
    const waiting = filings.filter((f) => f.release === 'Pending' && S.canDecide(f.ownerId)).length;

    return `<div class="page-head">
      <div class="page-head__text">
        <h2>Resignation</h2>
        <p>${filings.length} exit filing${filings.length === 1 ? '' : 's'} across your team · ${waiting} waiting on your release decision.</p>
      </div>
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Team exit filings<span class="count-pill">${filings.length}</span></h3>
          <p class="card__sub">Accept or reject the notice a recruiter has filed.</p>
        </div>
      </div>
      <div class="card__body card__body--flush">
        <div class="table-wrap">
          <table class="data-table data-table--compact">
            <thead>
              <tr>
                <th scope="col">Recruiter</th>
                <th scope="col">Notice start</th>
                <th scope="col">Last working day</th>
                <th scope="col">Reason</th>
                <th scope="col">Status</th>
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>${filings.length ? filings.map((f) => `<tr>
              <td>${U.esc(S.ownerName(f.ownerId))}<span class="cell-sub">Filed ${U.fmtDate(f.filedOn)}</span></td>
              <td>${U.fmtDate(f.noticeStart)}<span class="cell-sub">${f.noticeDays} days</span></td>
              <td>${U.fmtDate(f.lastWorkingDay)}</td>
              <td>${U.esc(f.reason)}${f.remarks ? `<span class="cell-sub">${U.esc(f.remarks)}</span>` : ''}</td>
              <td>${releaseBadge(f)}</td>
              <td>${releaseCell(f)}</td>
            </tr>`).join('') : `<tr><td colspan="6"><div class="empty">
              <span class="empty__icon">${icon('file')}</span>
              <h3>No exit filings</h3>
              <p>Nobody on the team has filed a resignation.</p>
            </div></td></tr>`}</tbody>
          </table>
        </div>
      </div>
    </section>`;
  }

  /* ---------- Request form ---------- */
  function formContent(draft) {
    const r = S.user();
    const canFile = draft.wants === true && draft.servesNotice === true;
    const noticeNote = draft.servesNotice === null ? '' : (draft.servesNotice
      ? `<p class="res-note">Last working day would be ${U.fmtDate(lastWorkingDay())}.</p>`
      : `<div class="alert alert--warning">${icon('warning')}<div class="alert__body"><p><strong>Notice period is mandatory.</strong> Select Yes to serve the ${S.policy().noticeDays} days before the request can be filed.</p></div></div>`);

    return `<div class="page-head">
      <div class="page-head__text">
        <h2>Resignation</h2>
        <p>Exit request for ${U.esc(r.name)} (${U.esc(r.employeeId)}), ${U.esc(r.role)}.</p>
      </div>
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">Resignation request</h3>
          <p class="card__sub">Standard notice period is ${S.policy().noticeDays} days</p>
        </div>
      </div>
      <div class="card__body res-steps">
        <div class="res-step">
          ${question(1, 'Do you want to resign?')}
          ${ynGroup('wants', 'Do you want to resign?', 'Yes', 'No', draft.wants)}
          ${draft.wants === false ? '<p class="res-note">No resignation requested. Nothing will be filed.</p>' : ''}
        </div>

        <div class="res-step"${draft.wants === true ? '' : ' hidden'}>
          ${question(2, `You have to serve a ${S.policy().noticeDays} day notice period.`)}
          ${ynGroup('servesNotice', 'Can you serve the notice period?', 'Yes, I will serve it', 'No, I cannot serve it', draft.servesNotice)}
          ${noticeNote}
        </div>

        <div class="res-step"${canFile ? '' : ' hidden'}>
          ${question(3, 'Reason for resignation')}
          <div class="field" id="reasonField">
            <label class="field__label" for="resReason">Reason <span class="req">*</span></label>
            <select class="control" id="resReason">
              <option value="">Select a reason…</option>
              ${S.masterActive('resignationReasons').map((r) => `<option value="${U.esc(r)}"${r === draft.reason ? ' selected' : ''}>${U.esc(r)}</option>`).join('')}
            </select>
            <span class="field__hint">Shown to HR with the notice dates.</span>
            <span class="field__error"></span>
          </div>
          <div class="field" style="margin-top:12px">
            <label class="field__label" for="resRemarks">Remarks <span class="field__hint">(optional)</span></label>
            <textarea class="control" id="resRemarks" rows="2" placeholder="Anything HR should know">${U.esc(draft.remarks)}</textarea>
          </div>
        </div>
      </div>
      <div class="card__foot">
        <div class="btn-row btn-row--end">
          <button class="btn" type="button" id="cancelRes">Cancel</button>
          <button class="btn btn--primary" type="button" id="okayRes"${canFile ? '' : ' disabled'}>${icon('check')} Okay</button>
        </div>
      </div>
    </section>`;
  }

  function readInputs(host, draft) {
    const reason = host.querySelector('#resReason');
    const remarks = host.querySelector('#resRemarks');
    if (reason) draft.reason = reason.value;
    if (remarks) draft.remarks = remarks.value.trim();
  }

  function drawForm(host, draft, focus) {
    host.innerHTML = formContent(draft);
    bindForm(host, draft);
    if (focus) {
      const input = host.querySelector(`.yn__input[name="${focus.name}"][value="${focus.value}"]`);
      if (input) input.focus();
    }
  }

  function openWarning(draft) {
    const r = S.user();
    const lines = [
      `Filing a resignation for <strong>${U.esc(r.name)}</strong> (${U.esc(r.employeeId)}).`,
      `Notice start ${U.fmtDate(U.todayKey())} · last working day <strong>${U.fmtDate(lastWorkingDay())}</strong> (${S.policy().noticeDays} days).`,
      `Reason: ${U.esc(draft.reason)}.`,
      `You confirmed you will serve the full ${S.policy().noticeDays} days.`,
    ];
    lines.push(`Routed to ${U.esc(S.reportingLine())} on submit.`);

    A.ui.confirm({
      title: 'Warning: filing resignation',
      tone: 'danger',
      confirmLabel: 'Okay, file it',
      cancelLabel: 'Go back',
      message: lines.join('<br>'),
    }).then((accepted) => {
      if (!accepted) {
        A.ui.toast('info', 'Nothing filed', 'The warning was dismissed. No resignation was submitted.');
        return;
      }
      S.fileResignation(draft).then((filing) => {
        render();
        A.ui.toast('success', 'Resignation filed', `Status: ${filing.status}.`);
      }).catch((error) => {
        A.ui.toast('error', 'Resignation not filed', error.message);
      });
    });
  }

  function bindForm(host, draft) {
    U.on(host, 'change', (ev) => {
      const input = ev.target;
      if (!input.classList || !input.classList.contains('yn__input')) return;
      const value = input.value === 'yes';
      readInputs(host, draft);
      draft[input.name] = value;
      if (input.name === 'wants' && value === false) {
        draft.servesNotice = null;
        draft.reason = '';
        draft.remarks = '';
      }
      drawForm(host, draft, { name: input.name, value: input.value });
    });

    U.on(host.querySelector('#resReason'), 'change', (ev) => {
      draft.reason = ev.target.value;
      host.querySelector('#reasonField').classList.remove('has-error');
    });

    U.on(host.querySelector('#cancelRes'), 'click', () => {
      drawForm(host, { wants: null, servesNotice: null, reason: '', remarks: '' });
      A.ui.toast('info', 'Request cleared', 'No resignation was filed.');
    });

    U.on(host.querySelector('#okayRes'), 'click', () => {
      readInputs(host, draft);
      if (!draft.reason) {
        A.ui.error(host.querySelector('#reasonField'), 'Select a reason');
        A.ui.toast('error', 'Reason required', 'Choose a reason before filing the resignation.');
        return;
      }
      openWarning(draft);
    });
  }

  function bindFiled(host) {
    U.on(host.querySelector('#withdrawBtn'), 'click', () => {
      A.ui.confirm({
        title: 'Withdraw resignation',
        tone: 'warning',
        confirmLabel: 'Yes, withdraw',
        cancelLabel: 'Keep filing',
        message: `Removes the filed resignation for <strong>${U.esc(S.user().name)}</strong> and its notice dates. You can file again straight away.`,
      }).then((accepted) => {
        if (!accepted) return;
        S.withdrawResignation().then(() => {
          // Force re-render to show the form instead of filed state
          render();
          A.ui.toast('info', 'Resignation withdrawn', 'The request was removed. Notice dates no longer apply. You can now file a new resignation if needed.');
        }).catch((error) => {
          A.ui.toast('error', 'Withdrawal failed', error.message);
        });
      });
    });
  }

  /* ---------- Release decisions ---------- */
  // A filing is accepted twice: first the notice, then the release on the last working day.
  function acceptRelease(ownerId) {
    S.decideResignation(ownerId, true).then((filing) => {
      if (!filing) return;
      const who = U.esc(S.ownerName(ownerId));
      A.ui.toast('success', 'Decision saved', filing.release === 'Accepted'
        ? `${who} can be released on ${U.fmtDate(filing.lastWorkingDay)}.`
        : `${who}'s notice is accepted and running. Release decision due ${U.fmtDate(filing.lastWorkingDay)}.`);
      render();
    }).catch((error) => {
      A.ui.toast('error', 'Decision not saved', error.message);
    });
  }

  function rejectRelease(ownerId) {
    const filing = S.teamResignations().filter((f) => f.ownerId === ownerId)[0];
    if (!filing) return;
    A.ui.confirm({
      title: 'Reject release',
      tone: 'danger',
      confirmLabel: 'Reject release',
      cancelLabel: 'Keep pending',
      message: `Rejects the notice filed by <strong>${U.esc(S.ownerName(ownerId))}</strong>, last working day ${U.fmtDate(filing.lastWorkingDay)}. The filing stays on record and can be re-submitted by the recruiter.`,
    }).then((accepted) => {
      if (!accepted) return;
      S.decideResignation(ownerId, false).then((decided) => {
        if (!decided) return;
        A.ui.toast('info', 'Release rejected', `${U.esc(S.ownerName(ownerId))} must re-file the exit request.`);
        render();
      }).catch((error) => {
        A.ui.toast('error', 'Decision not saved', error.message);
      });
    });
  }

  function bindQueue(host) {
    host.addEventListener('click', (ev) => {
      const accept = ev.target.closest('[data-accept-release]');
      if (accept) {
        acceptRelease(accept.dataset.acceptRelease);
        return;
      }
      const reject = ev.target.closest('[data-reject-release]');
      if (reject) rejectRelease(reject.dataset.rejectRelease);
    });
  }

  function render() {
    const host = U.by('resHost');
    if (S.hasTeam()) {
      host.innerHTML = queueContent(S.teamResignations());
      return;
    }
    const filing = S.myResignation();
    if (filing) {
      host.innerHTML = filedContent(filing);
      bindFiled(host);
      return;
    }
    drawForm(host, { wants: null, servesNotice: null, reason: '', remarks: '' });
  }

  pages.resignation = function (container) {
    container.innerHTML = '<div id="resHost"></div>';
    U.by('resHost').innerHTML = `<div class="page-head"><div class="page-head__text"><h2>Resignation</h2><p>Loading request…</p></div></div>
      <section class="card"><div class="card__body">${[0, 1, 2, 3].map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:12px"></span>').join('')}</div></section>`;

    bindQueue(U.by('resHost'));
    return S.reload(['resignations', 'staff', 'master', 'policy']).then(() => render());
  };
})(window.App);
