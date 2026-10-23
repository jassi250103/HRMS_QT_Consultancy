window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

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

  function pageHead(title, sub, actions) {
    return `<div class="page-head">
      <div class="page-head__text"><h2>${title}</h2><p>${sub}</p></div>
      <div class="page-head__actions">${actions || ''}</div>
    </div>`;
  }

  function skeletonPage(title, sub) {
    return `${pageHead(title, sub)}
      <div class="stat-grid">${[0, 1, 2, 3].map(() => '<article class="stat"><div class="stat__top"><span class="stat__label"><span class="skeleton" style="display:inline-block;width:72px;height:11px"></span></span></div><p class="stat__value"><span class="skeleton" style="display:inline-block;width:38px;height:20px"></span></p></article>').join('')}</div>
      <section class="card"><div class="card__body">${[0, 1, 2, 3, 4].map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:10px"></span>').join('')}</div></section>`;
  }

  function guard(container, title, sub, build, bind, names) {
    container.innerHTML = '<div id="adminHost"></div>';
    const host = U.by('adminHost');
    host.addEventListener('click', (ev) => {
      const el = ev.target.closest('[data-act]');
      if (!el) return;
      const action = actions[el.dataset.act];
      if (!action) return;
      el.disabled = true;
      Promise.resolve(action(el, host))
        .catch((error) => A.ui.toast('error', 'Not saved', error.message))
        .then(() => { if (el.isConnected) el.disabled = false; });
    });
    host.innerHTML = skeletonPage(title, sub);
    return S.reload(names).then(() => {
      host.innerHTML = build();
      if (bind) bind(host);
    });
  }

  /* Shared action registry: every page marks its buttons with data-act. */
  const actions = {};

  /* A dialog keeps its own footer down until the server answers, then reports the failure. */
  function inDialog(m, work) {
    const buttons = Array.prototype.slice.call(m.foot.querySelectorAll('.btn'));
    buttons.forEach((btn) => { btn.disabled = true; });
    const release = () => buttons.forEach((btn) => { btn.disabled = false; });
    return Promise.resolve().then(work).then((result) => {
      if (!result || !result.error) return result;
      release();
      return result;
    }, (error) => {
      release();
      A.ui.toast('error', 'Not saved', error.message);
      return { error: error.message };
    });
  }

  function failWith(title) {
    return (error) => A.ui.toast('error', title, error.message);
  }

  function oneTimeCredentials(result, label) {
    A.ui.notice(
      label,
      `<div class="alert alert--warning" style="margin-bottom:14px"><div class="alert__body">
        <strong>Shown once</strong><p>Hand these to the employee. Neither value can be displayed again from the portal.</p>
      </div></div>
      <div class="cred-box">
        <div class="cred-row"><span>Login ID</span><strong>${U.esc(result.loginId)}</strong></div>
        <div class="cred-row"><span>Temporary password</span><strong>${U.esc(result.password)}</strong></div>
      </div>
      <p class="card__sub" style="margin-top:12px">The employee must set their own password on the first sign-in.</p>`,
      'Done'
    );
  }

  /* ============ Master data ============ */
  let kindKey = 'companies';

  function kindsBar() {
    return `<div class="presets" role="tablist" aria-label="Master data lists">
      ${S.MASTER_KINDS.map((k) => `<button class="preset${k.key === kindKey ? ' is-on' : ''}" type="button" data-kind="${k.key}" aria-selected="${k.key === kindKey}">${k.label}</button>`).join('')}
    </div>`;
  }

  function masterRow(entry) {
    const inUse = S.masterUseCount(kindKey, entry.name);
    const retired = entry.status === S.RETIRED;
    const meta = retired && entry.retiredOn
      ? `Retired ${U.fmtDate(entry.retiredOn)}`
      : `Added ${U.fmtDate(entry.addedOn)}`;
    const controls = retired
      ? `<button class="btn btn--sm" type="button" data-act="bring-back" data-name="${U.esc(entry.name)}">Bring back</button>
         ${inUse ? '' : `<button class="btn btn--sm btn--danger" type="button" data-act="remove" data-name="${U.esc(entry.name)}">Delete</button>`}`
      : `<button class="btn btn--sm" type="button" data-act="rename" data-name="${U.esc(entry.name)}">${icon('pencil')} Rename</button>
         <button class="btn btn--sm${inUse ? '' : ' btn--danger'}" type="button" data-act="${inUse ? 'retire' : 'remove'}" data-name="${U.esc(entry.name)}">${inUse ? 'Retire' : 'Delete'}</button>`;
    return `<tr>
      <td><strong>${U.esc(entry.name)}</strong><span class="cell-sub">${meta}</span></td>
      <td><span class="badge ${retired ? 'badge--neutral' : 'badge--active'}"><i></i>${retired ? 'Retired' : 'Active'}</span></td>
      <td class="cell-num">${inUse}</td>
      <td><div class="btn-row">${controls}</div></td>
    </tr>`;
  }

  function masterContent() {
    const kind = S.masterKind(kindKey);
    const entries = S.masterEntries(kindKey);
    const retired = entries.filter((e) => e.status === S.RETIRED).length;
    const inUse = entries.filter((e) => S.masterUseCount(kindKey, e.name) > 0).length;

    return `${pageHead('Master Data', 'Picklists behind every recruit record. Values in use can be retired, not deleted.',
      `<a class="btn" href="#/dashboard">Dashboard</a>`)}

      <div class="stat-grid">
        ${statCard({ label: 'Entries', value: entries.length, icon: 'chart', color: 'var(--brand)', meta: kind.label })}
        ${statCard({ label: 'Selectable', value: entries.length - retired, icon: 'check', color: 'var(--success)', meta: 'Shown in forms and filters' })}
        ${statCard({ label: 'Retired', value: retired, icon: 'lock', color: 'var(--text-3)', meta: 'Hidden from new selections' })}
        ${statCard({ label: 'In Use', value: inUse, icon: 'users', color: 'var(--info)', meta: 'Referenced by existing records' })}
      </div>

      <section class="card">
        <div class="card__head">
          <div><h3 class="card__title">${kind.singular} list<span class="count-pill">${entries.length}</span></h3>
          <p class="card__sub">Renaming updates the ${kind.label.toLowerCase()} on records that already use it.</p></div>
          ${kindsBar()}
        </div>
        <div class="card__body">
          <div class="inline-add">
            <div class="field inline-add__field">
              <label class="field__label" for="masterNew">New ${kind.singular.toLowerCase()} <span class="req">*</span></label>
              <input class="control" id="masterNew" type="text" maxlength="60" placeholder="${U.esc(`Add a ${kind.singular.toLowerCase()}`)}" />
              <span class="field__error"></span>
            </div>
            <button class="btn btn--primary" type="button" data-act="add">Add</button>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data-table data-table--compact">
              <thead><tr><th scope="col">${kind.singular}</th><th scope="col">Status</th><th scope="col">In Use</th><th scope="col">Actions</th></tr></thead>
              <tbody>${entries.length ? entries.map(masterRow).join('') : `<tr><td colspan="4"><div class="empty"><span class="empty__icon">${icon('chart')}</span><h3>Nothing in this list</h3><p>Add the first value above.</p></div></td></tr>`}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  actions.add = function () {
    const input = U.by('masterNew');
    return S.masterAdd(kindKey, input.value).then((result) => {
      if (result.error) {
        A.ui.error(input.closest('.field'), result.error);
        return;
      }
      input.value = '';
      A.ui.toast('success', result.added ? 'Value added' : 'Value restored', `${result.added || result.reactivated} is selectable in forms.`);
      paintMaster();
    });
  };

  actions.rename = function (btn) {
    const current = btn.dataset.name;
    const kind = S.masterKind(kindKey);
    const inUse = S.masterUseCount(kindKey, current);
    A.ui.modal({
      title: `Rename ${kind.singular.toLowerCase()}`,
      compact: true,
      body: `<p>Currently <strong>${U.esc(current)}</strong>${inUse ? ` · used by ${inUse} record${inUse === 1 ? '' : 's'}, which will be updated too.` : ' · no records use it yet.'}</p>
        <div class="field" style="margin-top:14px">
          <label class="field__label" for="renameInput">New name <span class="req">*</span></label>
          <input class="control" id="renameInput" type="text" maxlength="60" value="${U.esc(current)}" data-autofocus />
          <span class="field__error"></span>
        </div>`,
      actions: [
        { label: 'Cancel', onClick: (m) => m.close() },
        {
          label: 'Save',
          variant: 'primary',
          onClick: (m) => {
            const input = U.by('renameInput');
            inDialog(m, () => S.masterRename(kindKey, current, input.value)).then((result) => {
              if (result.error) {
                A.ui.error(input.closest('.field'), result.error);
                return;
              }
              m.close();
              A.ui.toast('success', 'Renamed', `${result.renamed}${result.touched ? ` · ${result.touched} record${result.touched === 1 ? '' : 's'} updated` : ''}.`);
              paintMaster();
            });
          },
        },
      ],
    });
  };

  actions.retire = function (btn) {
    const name = btn.dataset.name;
    const kind = S.masterKind(kindKey);
    const inUse = S.masterUseCount(kindKey, name);
    return A.ui.confirm({
      title: `Retire ${kind.singular.toLowerCase()}`,
      tone: 'warning',
      confirmLabel: 'Retire',
      message: `<strong>${U.esc(name)}</strong> stops appearing in forms and filters. ${inUse ? `The ${inUse} record${inUse === 1 ? '' : 's'} using it keep the value.` : ''}`,
    }).then((yes) => {
      if (!yes) return null;
      return S.masterSetStatus(kindKey, name, S.RETIRED)
        .then(() => {
          A.ui.toast('info', 'Retired', `${name} is no longer selectable.`);
          paintMaster();
        })
        .catch(failWith('Not retired'));
    });
  };

  actions['bring-back'] = function (btn) {
    const name = btn.dataset.name;
    return S.masterSetStatus(kindKey, name, S.ACTIVE)
      .then(() => {
        A.ui.toast('success', 'Restored', `${name} is selectable again.`);
        paintMaster();
      })
      .catch(failWith('Not restored'));
  };

  actions.remove = function (btn) {
    const name = btn.dataset.name;
    const kind = S.masterKind(kindKey);
    return A.ui.confirm({
      title: `Delete ${kind.singular.toLowerCase()}`,
      tone: 'danger',
      confirmLabel: 'Delete',
      message: `Removes <strong>${U.esc(name)}</strong> from the list for good. This is only possible while no record uses it.`,
    }).then((yes) => {
      if (!yes) return null;
      return S.masterRemove(kindKey, name)
        .then((result) => {
          if (result.error) {
            A.ui.toast('error', 'Not deleted', result.error);
            return;
          }
          A.ui.toast('success', 'Deleted', `${name} removed from the list.`);
          paintMaster();
        })
        .catch(failWith('Not deleted'));
    });
  };

  function paintMaster() {
    U.by('adminHost').innerHTML = masterContent();
  }

  pages.masterData = function (container) {
    return guard(container, 'Master Data', 'Picklists behind every recruit record.', masterContent, bindMaster, ['master']);
  };

  function bindMaster(host) {
    host.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-kind]');
      if (!btn) return;
      kindKey = btn.dataset.kind;
      paintMaster();
    });
    host.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && ev.target.id === 'masterNew') {
        ev.preventDefault();
        actions.add();
      }
    });
  };

  /* ============ Internal staff ============ */
  const ACCESS = [
    { value: 'recruiter', label: 'Recruiter' },
    { value: 'manager', label: 'Manager' },
    { value: 'admin', label: 'HR Admin' },
  ];

  /* A lead carries the recruiters below them; the HR Admin carries the whole company. */
  function leadTarget(row) {
    if (S.accessOf(row.id) === 'admin') return S.rollupTarget(row.id);
    const reports = A.data.org.descendantsOf(row.id).filter((m) => S.accessOf(m.id) === 'recruiter');
    return reports.length ? S.rollupTarget(row.id) : '—';
  }

  function staffRow(row) {
    const account = row.hasAccount
      ? row.locked
        ? '<span class="badge badge--inactive"><i></i>Locked</span>'
        : row.mustChange
          ? '<span class="badge badge--brand"><i></i>Temp password</span>'
          : '<span class="badge badge--active"><i></i>Active</span>'
      : '<span class="badge badge--neutral"><i></i>No login</span>';
    
    // Face enrollment status
    const faceStatus = row.faceEnrolled
      ? `<span class="badge badge--active" title="Enrolled on ${row.faceEnrolledAt || 'Unknown'}">${icon('check')} Enrolled</span>`
      : '<span class="badge badge--neutral">Not enrolled</span>';

    const controls = row.hasAccount
      ? `<button class="btn btn--sm" type="button" data-act="reset" data-id="${row.id}">${icon('lock')} Reset password</button>
         <button class="btn btn--sm" type="button" data-act="${row.locked ? 'unlock' : 'lock'}" data-id="${row.id}">${row.locked ? 'Unlock' : 'Lock'}</button>`
      : `<button class="btn btn--sm btn--primary" type="button" data-act="provision" data-id="${row.id}">${icon('plus')} Create login</button>`;
    
    // Add face reset button if enrolled
    const faceControls = row.faceEnrolled
      ? `<button class="btn btn--sm btn--danger" type="button" data-act="reset-face" data-id="${row.id}" title="Reset face enrollment">${icon('refresh')} Reset Face</button>`
      : '';

    const deleteControl = row.id === S.session.userId
      ? ''
      : `<button class="btn btn--sm btn--danger" type="button" data-act="delete" data-id="${row.id}" title="Delete this staff record">${icon('trash')} Delete</button>`;

    return `<tr data-open-staff="${U.esc(row.id)}">
      <td><strong>${U.esc(row.name)}</strong><span class="cell-sub cell-id">${U.esc(row.employeeId)}</span></td>
      <td>${U.esc(row.designation)}<span class="cell-sub">${U.esc(S.roleLabel(row.access))}</span></td>
      <td>${U.esc(row.reportsTo)}</td>
      <td class="cell-muted">${U.esc(row.location)}</td>
      <td class="cell-muted">${row.loginId ? U.esc(row.loginId) : '—'}</td>
      <td>${account}</td>
      <td>${faceStatus}</td>
      <td class="cell-num">${row.access === 'recruiter' ? row.target : leadTarget(row)}</td>
      <td><div class="btn-row">${controls}${faceControls}${deleteControl}</div></td>
    </tr>`;
  }

  function staffContent() {
    const rows = S.staffRows();
    const logins = rows.filter((r) => r.hasAccount);
    const temp = logins.filter((r) => r.mustChange).length;
    const locked = logins.filter((r) => r.locked).length;
    
    // Face enrollment stats (will be loaded from API)
    const faceEnrolledCount = rows.filter(r => r.faceEnrolled).length;
    const notEnrolledCount = rows.length - faceEnrolledCount;

    return `${pageHead('Internal Staff', 'Everyone on the payroll who works in this portal. Accounts are provisioned here.',
      `<button class="btn btn--primary" type="button" data-act="new">${icon('plus')} Add Internal Employee</button>`)}

      <div class="stat-grid">
        ${statCard({ label: 'Internal Staff', value: rows.length, icon: 'users', color: 'var(--brand)', meta: 'Recruiters, managers and HR' })}
        ${statCard({ label: 'Logins Created', value: logins.length, icon: 'check', color: 'var(--success)', meta: 'Can sign in to the portal' })}
        ${statCard({ label: 'Face Enrolled', value: faceEnrolledCount, icon: 'user-check', color: 'var(--info)', meta: 'Biometric attendance enabled' })}
        ${statCard({ label: 'Not Enrolled', value: notEnrolledCount, icon: 'user-x', color: 'var(--warning)', meta: 'Need face enrollment for attendance' })}
      </div>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Directory<span class="count-pill">${rows.length}</span></h3>
            <p class="card__sub">Reporting lines, portal access, login status, and the target or team roll-up for ${U.esc(U.monthLabel(new Date()))}.</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data-table data-table--compact">
              <thead><tr>
                <th scope="col">Name</th><th scope="col">Designation</th><th scope="col">Reports to</th>
                <th scope="col">Base</th><th scope="col">Login ID</th><th scope="col">Account</th>
                <th scope="col">Face</th><th scope="col">Target</th><th scope="col">Actions</th>
              </tr></thead>
              <tbody>${rows.map(staffRow).join('')}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  actions.new = function () {
    const managers = S.managerOptions();
    const cities = S.masterActive('cities');
    const hubs = S.masterActive('hubs');
    const opt = (list, selected) => list.map((v) => `<option value="${U.esc(v)}"${v === selected ? ' selected' : ''}>${U.esc(v)}</option>`).join('');

    const body = `<div class="form-grid">
        <div class="field" data-field="name"><label class="field__label" for="stf-name">Name <span class="req">*</span></label><input class="control" id="stf-name" type="text" placeholder="Full name" data-autofocus /><span class="field__error"></span></div>
        <div class="field" data-field="designation"><label class="field__label" for="stf-designation">Designation <span class="req">*</span></label><input class="control" id="stf-designation" type="text" placeholder="Senior Recruiter" /><span class="field__error"></span></div>
        <div class="field"><label class="field__label" for="stf-access">Portal access</label><select class="control" id="stf-access">${opt(ACCESS.map((a) => a.value), 'recruiter')}</select><span class="field__hint">Decides which screens the person can open.</span></div>
        <div class="field" data-field="reportsTo"><label class="field__label" for="stf-reportsTo">Reporting manager <span class="req">*</span></label><select class="control" id="stf-reportsTo">${opt(managers, managers[0] || '')}</select><span class="field__error"></span></div>
        <div class="field"><label class="field__label" for="stf-city">City</label><select class="control" id="stf-city">${opt(cities, cities[0])}</select></div>
        <div class="field"><label class="field__label" for="stf-hub">Hub</label><select class="control" id="stf-hub">${opt(hubs, hubs[0])}</select></div>
        <div class="field" data-field="email"><label class="field__label" for="stf-email">Work email</label><input class="control" id="stf-email" type="email" placeholder="name@qtconsultancy.in" /><span class="field__error"></span></div>
        <div class="field"><label class="field__label" for="stf-mobile">Mobile</label><input class="control" id="stf-mobile" type="tel" placeholder="98860 12470" /></div>
        <div class="field"><label class="field__label" for="stf-doj">Date of joining</label><div id="stf-doj-host"></div></div>
        <div class="field"><label class="field__label" for="stf-target">Monthly target</label><input class="control" id="stf-target" type="number" min="0" max="200" value="${S.policy().targetDefault}" /><span class="field__hint">Assigned for ${U.esc(U.monthLabel(new Date()))}. Leave 0 to use the policy default.</span></div>
        <div class="field field--full"><label class="field__label" for="stf-account">Portal login</label><select class="control" id="stf-account">${opt(['Create login now', 'Create later'], 'Create login now')}</select><span class="field__hint">A temporary password is shown once and must be changed at first sign-in.</span></div>
      </div>`;

    A.ui.modal({
      title: 'Add Internal Employee',
      body,
      onMount() {
        A.DateField({ mount: 'stf-doj-host', id: 'stf-doj', label: 'Date of joining', value: U.todayKey() });
      },
      actions: [
        { label: 'Cancel', onClick: (m) => m.close() },
        {
          label: 'Create',
          variant: 'primary',
          onClick: (m) => {
            inDialog(m, () => S.createStaff({
              name: U.by('stf-name').value,
              designation: U.by('stf-designation').value,
              access: U.by('stf-access').value,
              reportsTo: U.by('stf-reportsTo').value,
              city: U.by('stf-city').value,
              hub: U.by('stf-hub').value,
              email: U.by('stf-email').value,
              mobile: U.by('stf-mobile').value,
              doj: A.DateField.valueOf('stf-doj'),
              target: parseInt(U.by('stf-target').value, 10) || 0,
              createAccount: U.by('stf-account').value === 'Create login now',
            })).then((result) => {
              if (result.error) {
                const holder = result.field ? U.by(`stf-${result.field}`).closest('.field') : null;
                if (holder) A.ui.error(holder, result.error);
                return;
              }
              m.close();
              paintStaff();
              A.ui.toast('success', 'Employee added', `${result.staff.name} · ${result.employeeId}.`);
              if (result.credentials) oneTimeCredentials(result.credentials, 'Login created');
            });
          },
        },
      ],
    });
  };

  actions.provision = function (btn) {
    const id = btn.dataset.id;
    return S.createLogin(id)
      .then((result) => {
        paintStaff();
        oneTimeCredentials(result, 'Login created');
      })
      .catch(failWith('Login not created'));
  };

  actions.reset = function (btn) {
    const id = btn.dataset.id;
    const name = S.ownerName(id);
    return A.ui.confirm({
      title: 'Force password reset',
      tone: 'warning',
      confirmLabel: 'Reset password',
      message: `Replaces <strong>${U.esc(name)}</strong>'s password with a new temporary one and requires a change at the next sign-in. Their existing password stops working immediately and is never shown to you.`,
    }).then((yes) => {
      if (!yes) return null;
      return S.forceResetPassword(id)
        .then((result) => {
          paintStaff();
          oneTimeCredentials(result, 'Password reset');
        })
        .catch(failWith('Not reset'));
    });
  };

  actions.lock = function (btn) {
    const id = btn.dataset.id;
    return S.setLoginLocked(id, true)
      .then(() => {
        A.ui.toast('warning', 'Login locked', `${S.ownerName(id)} cannot sign in until unlocked.`);
        paintStaff();
      })
      .catch(failWith('Not locked'));
  };

  actions.unlock = function (btn) {
    const id = btn.dataset.id;
    return S.setLoginLocked(id, false)
      .then(() => {
        A.ui.toast('success', 'Login unlocked', `${S.ownerName(id)} can sign in again.`);
        paintStaff();
      })
      .catch(failWith('Not unlocked'));
  };
  
  actions['reset-face'] = function (btn) {
    const id = btn.dataset.id;
    const name = S.ownerName(id);
    return A.ui.confirm({
      title: 'Reset face enrollment',
      tone: 'danger',
      confirmLabel: 'Reset face',
      message: `This will delete <strong>${U.esc(name)}</strong>'s stored face template. They will need to re-enroll their face before marking attendance again. This action cannot be undone.`,
    }).then((yes) => {
      if (!yes) return null;
      
      return A.api.post(`/admin/face-enrollment/reset/${id}`)
        .then((result) => {
          A.ui.toast('success', 'Face enrollment reset', result.message);
          // Reload staff master data to reflect the reset
          return S.reload(['staff']);
        })
        .catch((error) => {
          A.ui.toast('error', 'Reset failed', error.message);
        });
    });
  };

  actions.delete = function (btn) {
    const id = btn.dataset.id;
    const name = S.ownerName(id);
    return A.ui.confirm({
      title: 'Delete staff record',
      tone: 'danger',
      confirmLabel: 'Delete permanently',
      message: `<strong>${U.esc(name)}</strong> will be permanently removed — their login, uploaded documents and face template are destroyed. There is no trash or restore, so this cannot be undone.
        <ul class="confirm-danger-list">
          <li>Only people with no real history can be deleted.</li>
          <li>To keep the records but hide them, use <strong>Lock</strong> or set them inactive instead.</li>
        </ul>`,
    }).then((yes) => {
      if (!yes) return null;
      return S.deleteStaff(id)
        .then(() => {
          A.ui.toast('success', 'Staff deleted', `${name} was removed.`);
          paintStaff();
        })
        .catch(failWith('Not deleted'));
    });
  };

  function paintStaff() {
    U.by('adminHost').innerHTML = staffContent();
  }

  /* A row opens the staff profile; its own buttons and dialogs keep working. */
  function bindStaff(host) {
    host.addEventListener('click', (ev) => {
      if (ev.target.closest('[data-act], button, a, input, select')) return;
      const tr = ev.target.closest('[data-open-staff]');
      if (tr) window.location.hash = `#/staff/${encodeURIComponent(tr.dataset.openStaff)}`;
    });
  }

  pages.staff = function (container) {
    return guard(container, 'Internal Staff', 'Payroll employees and their portal accounts.', staffContent, bindStaff, ['staff', 'targets', 'recruits']);
  };

  /* ============ Targets ============ */
  let monthOffset = 0;

  function joinedIn(ownerId, month) {
    return S.store.recruits.filter((r) => r.ownerId === ownerId && r.doj.slice(0, 7) === month).length;
  }

  /* The HR Admin sits above everyone; a manager's team is the people below them. */
  function rollupTeamSize(id) {
    if (S.accessOf(id) === 'admin') return S.allStaffIds().filter((sid) => sid !== id).length;
    return A.data.org.descendantsOf(id).length;
  }

  function monthLabelOf(offset) {
    const key = A.data.monthOf(offset);
    return U.monthLabel(new Date(`${key}-01T00:00:00`));
  }

  function targetRow(row, month) {
    const assigned = S.assignedTarget(row.id, month);
    const joined = joinedIn(row.id, month);
    const target = assigned === null ? S.policy().targetDefault : assigned;
    return `<tr>
      <td><strong>${U.esc(row.name)}</strong><span class="cell-sub cell-id">${U.esc(row.employeeId)}</span></td>
      <td class="cell-muted">${U.esc(row.reportsTo)}</td>
      <td class="cell-muted">${U.esc(row.location)}</td>
      <td>
        <div class="target-edit">
          <input class="control control--num" type="number" min="0" max="500" data-target-input="${row.id}" value="${target}" aria-label="Target for ${U.esc(row.name)}" />
          <button class="btn btn--sm" type="button" data-act="save-target" data-id="${row.id}">Set</button>
        </div>
        ${assigned === null ? '<span class="cell-sub">Policy default</span>' : ''}
      </td>
      <td class="cell-num">${joined}</td>
      <td class="cell-num">${Math.max(target - joined, 0)}</td>
    </tr>`;
  }

  function targetsContent() {
    const month = A.data.monthOf(monthOffset);
    const rows = S.staffRows().filter((r) => r.access === 'recruiter');
    const leads = S.staffRows().filter((r) => r.access !== 'recruiter');
    const assignedCount = rows.filter((r) => S.assignedTarget(r.id, month) !== null).length;
    const total = rows.reduce((sum, r) => sum + (S.assignedTarget(r.id, month) || S.policy().targetDefault), 0);

    return `${pageHead('Targets', 'Monthly placement targets assigned to each recruiter. Managers and the HR Admin roll these up.',
      `<div class="month-nav">
        <button class="icon-btn" type="button" data-act="month-prev" aria-label="Previous month"><svg viewBox="0 0 24 24">${A.ui.icons.back}</svg></button>
        <strong>${U.esc(monthLabelOf(monthOffset))}</strong>
        <button class="icon-btn" type="button" data-act="month-next" aria-label="Next month"><svg viewBox="0 0 24 24" style="transform:rotate(180deg)">${A.ui.icons.back}</svg></button>
      </div>
      <div class="inline-add inline-add--inline">
        <input class="control control--num" id="bulkTarget" type="number" min="0" max="500" placeholder="20" aria-label="Bulk target" />
        <button class="btn" type="button" data-act="bulk">Apply to all</button>
      </div>`)}

      <div class="stat-grid">
        ${statCard({ label: 'Recruiters', value: rows.length, icon: 'users', color: 'var(--brand)', meta: monthLabelOf(monthOffset) })}
        ${statCard({ label: 'Assigned', value: assignedCount, icon: 'check', color: 'var(--success)', meta: `${rows.length - assignedCount} still on the default` })}
        ${statCard({ label: 'Company Target', value: total, icon: 'target', color: 'var(--info)', meta: 'Sum of every recruiter' })}
        ${statCard({ label: 'Policy Default', value: S.policy().targetDefault, icon: 'clock', color: 'var(--text-3)', meta: 'Used until a target is set' })}
      </div>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Assigned targets<span class="count-pill">${rows.length}</span></h3>
            <p class="card__sub">Balance is what is still open in ${U.esc(monthLabelOf(monthOffset))} after this month's joins.</p>
          </div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data-table data-table--compact">
              <thead><tr>
                <th scope="col">Recruiter</th><th scope="col">Reports to</th><th scope="col">Base</th>
                <th scope="col">Target</th><th scope="col">Joined</th><th scope="col">Balance</th>
              </tr></thead>
              <tbody>${rows.map((r) => targetRow(r, month)).join('')}</tbody>
            </table>
          </div>
        </div>
      </section>

      <section class="card">
        <div class="card__head">
          <div><h3 class="card__title">Roll-ups</h3><p class="card__sub">Derived from the recruiters below each lead. Not editable.</p></div>
        </div>
        <div class="card__body card__body--flush">
          <div class="table-wrap">
            <table class="data-table data-table--compact">
              <thead><tr><th scope="col">Lead</th><th scope="col">Access</th><th scope="col">Team</th><th scope="col">Roll-up target</th></tr></thead>
              <tbody>${leads.map((r) => `<tr>
                <td><strong>${U.esc(r.name)}</strong><span class="cell-sub cell-id">${U.esc(r.employeeId)}</span></td>
                <td>${U.esc(S.roleLabel(r.access))}</td>
                <td class="cell-num">${rollupTeamSize(r.id)}</td>
                <td class="cell-num">${leadTarget(r)}</td>
              </tr>`).join('')}</tbody>
            </table>
          </div>
        </div>
      </section>`;
  }

  actions['month-prev'] = function () {
    monthOffset -= 1;
    const month = A.data.monthOf(monthOffset);
    return S.reload(['targets'], month).then(paintTargets);
  };

  actions['month-next'] = function () {
    monthOffset += 1;
    const month = A.data.monthOf(monthOffset);
    return S.reload(['targets'], month).then(paintTargets);
  };

  actions['save-target'] = function (btn) {
    const id = btn.dataset.id;
    const input = document.querySelector(`[data-target-input="${id}"]`);
    const month = A.data.monthOf(monthOffset);
    return S.setTarget(id, month, input.value)
      .then((result) => {
        if (result.error) {
          A.ui.toast('error', 'Target not set', result.error);
          return;
        }
        A.ui.toast('success', 'Target set', `${S.ownerName(id)} · ${result.target} for ${monthLabelOf(monthOffset)}.`);
        paintTargets();
      });
  };

  actions.bulk = function () {
    const input = U.by('bulkTarget');
    const month = A.data.monthOf(monthOffset);
    const rows = S.staffRows().filter((r) => r.access === 'recruiter');
    return S.applyTargetRange(input.value, month, rows.map((r) => r.id))
      .then((result) => {
        if (result.error) {
          A.ui.toast('error', 'Not applied', result.error);
          return;
        }
        input.value = '';
        A.ui.toast('success', 'Targets applied', `${result.count} recruiters set to ${result.target} for ${monthLabelOf(monthOffset)}.`);
        paintTargets();
      });
  };

  function paintTargets() {
    U.by('adminHost').innerHTML = targetsContent();
  }

  pages.targets = function (container) {
    return guard(container, 'Targets', 'Monthly placement targets.', targetsContent, null, ['targets', 'staff', 'recruits', 'policy']);
  };

  /* ============ Policy ============ */
  function policyContent() {
    const p = S.policy();
    return `${pageHead('Policy', 'Working rules the portal applies to attendance, exits and passwords.')}

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Working rules</h3>
            <p class="card__sub">Changes apply to new marks, new filings and new passwords. History keeps the values it was recorded with.</p>
          </div>
        </div>
        <div class="card__body">
          <form id="policyForm" class="form-grid" novalidate>
            <div class="field" data-field="lateAfter">
              <label class="field__label" for="pol-late">Late check-in after</label>
              <input class="control" id="pol-late" type="time" value="${U.esc(p.lateAfter)}" />
              <span class="field__hint">Present marks logged after this time are flagged Late.</span>
              <span class="field__error"></span>
            </div>
            <div class="field" data-field="noticeDays">
              <label class="field__label" for="pol-notice">Notice period (days)</label>
              <input class="control" id="pol-notice" type="number" min="1" max="90" value="${p.noticeDays}" />
              <span class="field__hint">New resignation filings must confirm this many days before release.</span>
              <span class="field__error"></span>
            </div>
            <div class="field" data-field="targetDefault">
              <label class="field__label" for="pol-target">Default monthly target</label>
              <input class="control" id="pol-target" type="number" min="1" max="200" value="${p.targetDefault}" />
              <span class="field__hint">Used for recruiters with no assigned target this month.</span>
              <span class="field__error"></span>
            </div>
            <div class="field" data-field="passwordMinLength">
              <label class="field__label" for="pol-password">Minimum password length</label>
              <input class="control" id="pol-password" type="number" min="8" max="32" value="${p.passwordMinLength}" />
              <span class="field__hint">Applies when an employee changes their own password.</span>
              <span class="field__error"></span>
            </div>
            <div class="field field--full" style="margin-top:8px;border-top:1px solid var(--border);padding-top:16px">
              <h4 style="margin-bottom:12px;font-size:14px">Geofenced Attendance</h4>
              <p class="card__sub" style="margin-bottom:16px">Require employees to be within a specific radius of the office to mark attendance. Face verification is also required.</p>
            </div>
            <div class="field" data-field="officeLatitude">
              <label class="field__label" for="pol-lat">Office Latitude</label>
              <div style="display:flex;gap:8px">
                <input class="control" id="pol-lat" type="number" step="0.000001" min="-90" max="90" placeholder="e.g., 12.971598" value="${p.officeLatitude || ''}" style="flex:1" />
                <button class="btn btn--sm" type="button" id="setLocationBtn" style="flex:none">Use Current Location</button>
              </div>
              <span class="field__hint">Latitude of the office location for geofencing.</span>
              <span class="field__error"></span>
            </div>
            <div class="field" data-field="officeLongitude">
              <label class="field__label" for="pol-lng">Office Longitude</label>
              <input class="control" id="pol-lng" type="number" step="0.000001" min="-180" max="180" placeholder="e.g., 77.594566" value="${p.officeLongitude || ''}" />
              <span class="field__hint">Longitude of the office location for geofencing.</span>
              <span class="field__error"></span>
            </div>
            <div class="field" data-field="geofenceRadiusMeters">
              <label class="field__label" for="pol-radius">Geofence Radius (meters)</label>
              <input class="control" id="pol-radius" type="number" min="10" max="5000" value="${p.geofenceRadiusMeters || 100}" />
              <span class="field__hint">Employees must be within this distance from the office to mark attendance (10-5000m).</span>
              <span class="field__error"></span>
            </div>
            <div class="field field--full">
              <button class="btn btn--primary" type="submit">Save policy</button>
            </div>
          </form>
        </div>
      </section>`;
  }

  function paintPolicy() {
    U.by('adminHost').innerHTML = policyContent();
    bindPolicyForm();
  }

  function bindPolicyForm() {
    const form = U.by('policyForm');

    // Bind "Use Current Location" button
    const setLocationBtn = U.by('setLocationBtn');
    if (setLocationBtn) {
      setLocationBtn.addEventListener('click', () => {
        if (!navigator.geolocation) {
          A.ui.toast('error', 'Geolocation not supported', 'Your browser does not support location services.');
          return;
        }
        navigator.geolocation.getCurrentPosition(
          (position) => {
            U.by('pol-lat').value = position.coords.latitude.toFixed(6);
            U.by('pol-lng').value = position.coords.longitude.toFixed(6);
            A.ui.toast('success', 'Location set', `Latitude: ${position.coords.latitude.toFixed(6)}, Longitude: ${position.coords.longitude.toFixed(6)}`);
          },
          (error) => {
            A.ui.toast('error', 'Location access denied', 'Please allow location access to set office coordinates.');
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      });
    }

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      ['lateAfter', 'noticeDays', 'targetDefault', 'passwordMinLength', 'maxFailedAttempts', 'lockMinutes', 'passwordHistory', 'officeLatitude', 'officeLongitude', 'geofenceRadiusMeters'].forEach((key) => {
        const field = form.querySelector(`[data-field="${key}"]`);
        if (field) field.classList.remove('has-error');
      });

      const latValue = U.by('pol-lat').value ? parseFloat(U.by('pol-lat').value) : null;
      const lngValue = U.by('pol-lng').value ? parseFloat(U.by('pol-lng').value) : null;

      // Validate coordinates if either is provided
      if ((latValue !== null || lngValue !== null) && (latValue === null || lngValue === null)) {
        A.ui.toast('error', 'Incomplete coordinates', 'Both latitude and longitude are required for geofencing.');
        return;
      }
      if (latValue !== null && (latValue < -90 || latValue > 90)) {
        A.ui.toast('error', 'Invalid latitude', 'Latitude must be between -90 and 90.');
        return;
      }
      if (lngValue !== null && (lngValue < -180 || lngValue > 180)) {
        A.ui.toast('error', 'Invalid longitude', 'Longitude must be between -180 and 180.');
        return;
      }

      return S.setPolicy({
        lateAfter: U.by('pol-late').value,
        noticeDays: parseInt(U.by('pol-notice').value, 10),
        targetDefault: parseInt(U.by('pol-target').value, 10),
        passwordMinLength: parseInt(U.by('pol-password').value, 10),
        maxFailedAttempts: parseInt(form.querySelector('[name="maxFailedAttempts"]')?.value || '5', 10),
        lockMinutes: parseInt(form.querySelector('[name="lockMinutes"]')?.value || '15', 10),
        passwordHistory: parseInt(form.querySelector('[name="passwordHistory"]')?.value || '3', 10),
        officeLatitude: latValue,
        officeLongitude: lngValue,
        geofenceRadiusMeters: parseInt(U.by('pol-radius').value, 10) || 100,
      })
        .then((result) => {
          if (result.error) {
            A.ui.toast('error', 'Policy not saved', result.error);
            return;
          }
          A.ui.toast('success', 'Policy saved', 'Applied across the portal for new records.');
          paintPolicy();
        })
        .catch(failWith('Not saved'));
    });
  }

  pages.policy = function (container) {
    return guard(container, 'Policy', 'Working rules applied across the portal.', policyContent, bindPolicyForm, ['policy']);
  };
})(window.App);
