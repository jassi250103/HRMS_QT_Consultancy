window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  const DOC_FIELDS = [
    { key: 'offer_letter', label: 'Offer Letter' },
    { key: 'appointment_letter', label: 'Appointment Letter' },
    { key: 'id_proof', label: 'ID Proof' },
    { key: 'resume', label: 'Resume / CV' },
    { key: 'other', label: 'Other Document' },
  ];
  const ROLES = [
    { value: 'recruiter', label: 'Recruiter' },
    { value: 'manager', label: 'Manager' },
    { value: 'hr_admin', label: 'HR Admin' },
  ];

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function item(label, value, muted) {
    return `<div class="detail-item">
      <p class="detail-item__label">${label}</p>
      <p class="detail-item__value${muted && !value ? ' detail-item__value--muted' : ''}">${value || '—'}</p>
    </div>`;
  }

  function accountBadge(st) {
    if (!st.hasAccount) return '<span class="badge badge--neutral"><i></i>No login</span>';
    if (st.locked) return '<span class="badge badge--inactive"><i></i>Locked</span>';
    if (st.mustChange) return '<span class="badge badge--brand"><i></i>Temp password</span>';
    return '<span class="badge badge--active"><i></i>Active</span>';
  }

  function oneTime(result, title) {
    A.ui.modal({
      title,
      compact: true,
      body: `<p>Share these with ${U.esc(result.name || 'the employee')} over a trusted channel. The password is shown once.</p>
        <div class="cred-box" style="margin-top:12px">
          <p><strong>Login ID:</strong> <code>${U.esc(result.loginId || '')}</code></p>
          <p><strong>Temporary password:</strong> <code>${U.esc(result.password || '')}</code></p>
        </div>`,
      actions: [{ label: 'Done', variant: 'primary', onClick: (m) => m.close() }],
    });
  }

  function hero(st, editing) {
    return `<div class="detail-hero">
      <div class="detail-hero__meta">
        <h2>${U.esc(st.name)}
          <span class="badge ${st.active ? 'badge--active' : 'badge--inactive'}"><i></i>${st.active ? 'Active' : 'Inactive'}</span>
          ${editing ? '<span class="edit-flag">Editing</span>' : ''}
        </h2>
        <p>${U.esc(st.designation || '')} · ${U.esc(st.roleLabel || S.roleLabel(st.role))} · reports to ${U.esc(st.managerName || '—')}</p>
        <div class="profile-hero__tags">
          <span class="chip">Employee ID <strong>${U.esc(st.employeeCode)}</strong></span>
          <span class="chip">Hub <strong>${U.esc(st.hub || '—')}</strong></span>
          <span class="chip">City <strong>${U.esc(st.city || '—')}</strong></span>
          <span class="chip">DOJ <strong>${U.fmtDate(st.doj)}</strong></span>
        </div>
      </div>
      ${editing ? '' : `<div class="detail-hero__actions">
        <a class="btn" href="#/staff">Back to directory</a>
        <button class="btn btn--primary" type="button" data-action="edit">Edit</button>
      </div>`}
    </div>`;
  }

  function employmentCard(st) {
    return `<section class="card">
      <div class="card__head"><h3 class="section-title" style="margin:0">${icon('briefcase')} Employment</h3></div>
      <div class="card__body"><div class="detail-grid">
        ${item('Reports to', U.esc(st.managerName || '—'))}
        ${item('Portal access', U.esc(st.roleLabel || S.roleLabel(st.role)))}
        ${item('Hub', U.esc(st.hub))}
        ${item('City', U.esc(st.city))}
        ${item('Location', U.esc(st.location))}
        ${item('Cluster', U.esc(st.cluster))}
        ${item('Date of joining', U.fmtDate(st.doj))}
        ${item('Gender', U.esc(st.gender))}
        ${item('Date of birth', U.fmtDate(st.dob))}
        ${item('HR contact', U.esc(st.hr))}
        ${item('Mobile', U.esc(st.mobile))}
        ${item('Email', U.esc(st.email))}
        ${item('Address', U.esc(st.address), true)}
        ${item('Mandate', U.esc(st.mandate), true)}
        ${item('Team note', U.esc(st.teamNote), true)}
      </div></div>
    </section>`;
  }

  function accountCard(st) {
    let controls = '';
    if (st.hasAccount) {
      controls = `<div class="btn-row">
        <button class="btn btn--sm" type="button" data-staff-act="reset">Reset password</button>
        <button class="btn btn--sm" type="button" data-staff-act="${st.locked ? 'unlock' : 'lock'}">${st.locked ? 'Unlock' : 'Lock'}</button>
      </div>`;
    } else {
      controls = `<button class="btn btn--sm btn--primary" type="button" data-staff-act="provision">${icon('plus')} Create login</button>`;
    }
    const face = st.faceEnrolled
      ? `<span class="badge badge--active"><i></i>Enrolled</span>
         <button class="btn btn--sm btn--danger" type="button" data-staff-act="reset-face" style="margin-left:8px">Reset face</button>`
      : '<span class="badge badge--neutral"><i></i>Not enrolled</span>';
    const deleteControl = st.id === S.session.userId
      ? ''
      : `<button class="btn btn--sm btn--danger" type="button" data-staff-act="delete">${icon('trash')} Delete</button>`;
    return `<section class="card">
      <div class="card__head"><h3 class="section-title" style="margin:0">${icon('lock')} Portal account</h3><span>${accountBadge(st)}</span></div>
      <div class="card__body">
        <div class="detail-grid">
          ${item('Login ID', st.loginId ? `<strong>${U.esc(st.loginId)}</strong>` : '—')}
          ${item('Created on', U.fmtDate(st.accountCreatedAt))}
          ${item('Last sign-in', U.fmtDate(st.lastLoginAt))}
          ${item('Face for attendance', face)}
        </div>
        <div style="margin-top:14px"><div class="btn-row">${controls}${deleteControl}</div></div>
      </div>
    </section>`;
  }

  function workCard(st) {
    const row = S.staffRows().filter((r) => r.id === st.id)[0];
    const days = S.attendanceDays(st.id);
    const lower = (s) => String(s || '').toLowerCase();
    const present = days.filter((d) => lower(d.status) === 'present').length;
    const absent = days.filter((d) => lower(d.status) === 'absent').length;
    const leave = days.filter((d) => lower(d.status) === 'leave').length;
    const leaves = (S.store.leaves || []).filter((l) => l.ownerId === st.id);
    return `<section class="card">
      <div class="card__head"><h3 class="section-title" style="margin:0">${icon('users')} Work summary</h3><p class="card__sub" style="margin:0">Window ${U.esc(U.monthLabel(new Date()))} · ${days.length} marked days</p></div>
      <div class="card__body"><div class="detail-grid">
        ${item('Monthly target', row ? String(row.target) : String(st.target || 0))}
        ${item('Recruits on record', `${st.totalRecruits || 0}`)}
        ${item('Active recruits', `${st.activeRecruits || 0}`)}
        ${item('Days present', `${present}`)}
        ${item('Days absent', `${absent}`)}
        ${item('Leave days', `${leave}`)}
        ${item('Leave requests', `${leaves.length}`)}
        ${item('Open leave', `${leaves.filter((l) => l.status === 'Applied').length}`)}
      </div></div>
    </section>`;
  }

  function docTile(key, label, file, editable) {
    if (editable) {
      return `<div class="doc-tile${file ? ' has-file' : ''}">
        <div class="doc-tile__head"><span class="doc-tile__name">${label}</span><span class="doc-tile__opt">${file ? 'Uploaded' : 'Optional'}</span></div>
        ${file ? `<div class="doc-tile__file">
          <span class="doc-tile__file-icon"><svg viewBox="0 0 24 24">${A.ui.icons.file}</svg></span>
          <span class="doc-tile__file-text"><strong title="${U.esc(file.name)}">${U.esc(file.name)}</strong><small>${U.fmtBytes(file.size)}, uploaded ${U.fmtDate(file.uploadedOn)}</small></span>
        </div>` : '<p class="field__hint">Not uploaded</p>'}
        <div class="btn-row" style="margin-top:8px">
          <label class="btn btn--sm" style="cursor:pointer">${file ? 'Replace' : 'Upload'}<input type="file" accept=".pdf,.jpg,.jpeg,.png,.doc,.docx" data-doc-input="${key}" style="display:none" /></label>
          ${file ? `<button class="btn btn--sm btn--danger" type="button" data-doc-remove="${key}">Remove</button>` : ''}
        </div>
        <p class="doc-tile__accept">PDF, JPG, PNG, DOC, DOCX. Max 5 MB.</p>
      </div>`;
    }
    return `<div class="doc-tile${file ? ' has-file' : ''}">
      <div class="doc-tile__head"><span class="doc-tile__name">${label}</span><span class="doc-tile__opt">${file ? 'Uploaded' : 'Not uploaded'}</span></div>
      ${file ? `<div class="doc-tile__file">
        <span class="doc-tile__file-icon"><svg viewBox="0 0 24 24">${A.ui.icons.file}</svg></span>
        <span class="doc-tile__file-text"><strong title="${U.esc(file.name)}">${U.esc(file.name)}</strong><small>${U.fmtBytes(file.size)}, uploaded ${U.fmtDate(file.uploadedOn)}</small></span>
        <span class="doc-tile__actions"><button class="icon-btn icon-btn--sm" type="button" data-doc-download="${key}" title="Open ${label}" aria-label="Open ${label} file"><svg viewBox="0 0 24 24">${A.ui.icons.download}</svg></button></span>
      </div>` : ''}
      <p class="doc-tile__accept">PDF, JPG, PNG, DOC, DOCX. Max 5 MB.</p>
    </div>`;
  }

  function docsHTML(st, docs, editable) {
    const uploaded = DOC_FIELDS.filter((f) => docs[f.key]).length;
    return `<div class="card__head">
        <div><h3 class="card__title">Documents</h3><p class="card__sub">${uploaded} of ${DOC_FIELDS.length} documents on file${editable ? ' · uploads save immediately' : ''}.</p></div>
        <span class="badge badge--neutral">${uploaded} of ${DOC_FIELDS.length}</span>
      </div>
      <div class="card__body"><div class="doc-grid">
        ${DOC_FIELDS.map((f) => docTile(f.key, f.label, docs[f.key], editable)).join('')}
      </div></div>`;
  }

  function docsCard(st, docs) {
    return `<section class="card" id="staffDocsCard">${docsHTML(st, docs, false)}</section>`;
  }

  function renderView(container, st, docs) {
    container.innerHTML = `<div class="form-page">
      <nav class="breadcrumb">
        <a href="#/staff">Internal Staff</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <span>${U.esc(st.name)}</span>
      </nav>
      ${hero(st)}
      ${employmentCard(st)}
      ${accountCard(st)}
      ${workCard(st)}
      ${docsCard(st, docs)}
    </div>`;

    container.querySelector('[data-action="edit"]').addEventListener('click', () => renderEdit(container, st, docs));

    container.querySelectorAll('[data-doc-download]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const key = btn.dataset.docDownload;
        const file = docs[key];
        btn.disabled = true;
        S.downloadStaffDocument(st.id, key, file && file.name)
          .then(() => A.ui.toast('success', 'File downloaded', `${file ? file.name : key} saved.`),
            (error) => A.ui.toast('error', 'File not available', error.message))
          .then(() => { btn.disabled = false; });
      });
    });

    container.querySelectorAll('[data-staff-act]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const act = btn.dataset.staffAct;
        btn.disabled = true;
        const done = (fn) => Promise.resolve()
          .then(fn)
          .catch((error) => A.ui.toast('error', 'Not saved', error.message))
          .then(() => remount(container, st.id));
        if (act === 'provision') return done(() => S.createLogin(st.id).then((r) => oneTime(r, 'Login created')));
        if (act === 'reset') return done(() => A.ui.confirm({
          title: 'Force password reset',
          tone: 'warning',
          confirmLabel: 'Reset password',
          message: `Replaces <strong>${U.esc(st.name)}</strong>'s password with a new temporary one.`,
        }).then((yes) => (yes ? S.forceResetPassword(st.id).then((r) => oneTime(r, 'Password reset')) : null)));
        if (act === 'lock' || act === 'unlock') return done(() => S.setLoginLocked(st.id, act === 'lock').then(() => A.ui.toast('info', act === 'lock' ? 'Login locked' : 'Login unlocked', `${st.name}.`)));
        if (act === 'reset-face') return done(() => A.ui.confirm({
          title: 'Reset face enrollment',
          tone: 'danger',
          confirmLabel: 'Reset face',
          message: `Deletes <strong>${U.esc(st.name)}</strong>'s stored face template. They must re-enroll before marking attendance.`,
        }).then((yes) => (yes ? A.api.post(`/admin/face-enrollment/reset/${st.id}`).then((r) => A.ui.toast('success', 'Face enrollment reset', r.message)) : null)));
        if (act === 'delete') {
          return A.ui.confirm({
            title: 'Delete staff record',
            tone: 'danger',
            confirmLabel: 'Delete permanently',
            message: `<strong>${U.esc(st.name)}</strong> will be permanently removed — their login, uploaded documents and face template are destroyed. There is no trash or restore, so this cannot be undone.
              <ul class="confirm-danger-list">
                <li>Only people with no real history can be deleted.</li>
                <li>To keep the records but hide them, <strong>Lock</strong> them or set them inactive instead.</li>
              </ul>`,
          }).then((yes) => {
            if (!yes) { btn.disabled = false; return null; }
            return S.deleteStaff(st.id)
              .then(() => {
                A.ui.toast('success', 'Staff deleted', `${st.name} was removed.`);
                window.location.hash = '#/staff';
              })
              .catch((error) => { A.ui.toast('error', 'Not deleted', error.message); btn.disabled = false; });
          });
        }
        return undefined;
      });
    });
  }

  function remount(container, id) {
    return mountInto(container, id);
  }

  /* ---------- Edit ---------- */
  function renderEdit(container, st, docs) {
    const managers = S.managerOptions();
    const cities = S.masterActive('cities');
    const hubs = S.masterActive('hubs');
    const withCurrent = (list, current) => {
      const out = list.slice();
      if (current && out.indexOf(current) === -1) out.unshift(current);
      return out;
    };
    const opt = (list, selected) => list.map((v) => `<option value="${U.esc(v)}"${v === selected ? ' selected' : ''}>${U.esc(v)}</option>`).join('');

    container.innerHTML = `<div class="form-page">
      <nav class="breadcrumb">
        <a href="#/staff">Internal Staff</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <a href="#/staff/${encodeURIComponent(st.id)}">${U.esc(st.name)}</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <span>Edit</span>
      </nav>
      ${hero(st, true)}
      <section class="card">
        <div class="card__head"><h3 class="section-title" style="margin:0">${icon('briefcase')} Record</h3></div>
        <div class="card__body"><div class="form-grid">
          <div class="field" data-field="name"><label class="field__label" for="stfe-name">Name <span class="req">*</span></label><input class="control" id="stfe-name" type="text" value="${U.esc(st.name)}" data-autofocus /><span class="field__error"></span></div>
          <div class="field" data-field="designation"><label class="field__label" for="stfe-designation">Designation <span class="req">*</span></label><input class="control" id="stfe-designation" type="text" value="${U.esc(st.designation || '')}" /><span class="field__error"></span></div>
          <div class="field"><label class="field__label" for="stfe-role">Portal access</label><select class="control" id="stfe-role">${opt(ROLES.map((r) => r.value), st.role)}</select><span class="field__hint">Decides which screens the person can open.</span></div>
          <div class="field" data-field="reportsTo"><label class="field__label" for="stfe-reportsTo">Reporting manager <span class="req">*</span></label><select class="control" id="stfe-reportsTo">${opt(withCurrent(managers, st.managerName), st.managerName || '')}</select><span class="field__error"></span></div>
          <div class="field"><label class="field__label" for="stfe-city">City</label><select class="control" id="stfe-city">${opt(withCurrent(cities, st.city), st.city || '')}</select></div>
          <div class="field"><label class="field__label" for="stfe-hub">Hub</label><select class="control" id="stfe-hub">${opt(withCurrent(hubs, st.hub), st.hub || '')}</select></div>
          <div class="field" data-field="email"><label class="field__label" for="stfe-email">Work email</label><input class="control" id="stfe-email" type="email" value="${U.esc(st.email || '')}" /><span class="field__error"></span></div>
          <div class="field"><label class="field__label" for="stfe-mobile">Mobile</label><input class="control" id="stfe-mobile" type="tel" value="${U.esc(st.mobile || '')}" /></div>
          <div class="field"><label class="field__label" for="stfe-doj">Date of joining</label><div id="stfe-doj-host"></div></div>
          <div class="field"><label class="field__label" for="stfe-dob">Date of birth</label><div id="stfe-dob-host"></div></div>
          <div class="field"><label class="field__label" for="stfe-gender">Gender</label><input class="control" id="stfe-gender" type="text" maxlength="20" value="${U.esc(st.gender || '')}" /></div>
          <div class="field"><label class="field__label" for="stfe-hr">HR contact</label><input class="control" id="stfe-hr" type="text" maxlength="120" value="${U.esc(st.hr || '')}" /></div>
          <div class="field"><label class="field__label" for="stfe-cluster">Cluster</label><input class="control" id="stfe-cluster" type="text" maxlength="240" value="${U.esc(st.cluster || '')}" /></div>
          <div class="field"><label class="field__label" for="stfe-mandate">Mandate</label><input class="control" id="stfe-mandate" type="text" maxlength="240" value="${U.esc(st.mandate || '')}" /></div>
          <div class="field field--full"><label class="field__label" for="stfe-address">Address</label><input class="control" id="stfe-address" type="text" maxlength="400" value="${U.esc(st.address || '')}" /></div>
          <div class="field field--full"><label class="field__label" for="stfe-teamNote">Team note</label><input class="control" id="stfe-teamNote" type="text" maxlength="240" value="${U.esc(st.teamNote || '')}" /></div>
        </div></div>
      </section>
      <section class="card" id="staffDocsCard">${docsHTML(st, docs, true)}</section>
      <div class="form-foot">
        <p class="form-foot__note">Documents save on pick, not with the Save button.</p>
        <div class="btn-row">
          <button class="btn" type="button" id="editCancel">Cancel</button>
          <button class="btn btn--primary" type="button" id="editSave">Save Changes</button>
        </div>
      </div>
    </div>`;

    let dirty = false;
    A.DateField({ mount: 'stfe-doj-host', id: 'stfe-doj', label: 'Date of joining', value: st.doj || '' });
    A.DateField({ mount: 'stfe-dob-host', id: 'stfe-dob', label: 'Date of birth', value: st.dob || '' });
    container.addEventListener('input', () => { dirty = true; });
    container.addEventListener('change', () => { dirty = true; });

    /* Documents save immediately; only the tiles are repainted so the form keeps its values. */
    function repaintDocs(nextDocs) {
      docs = nextDocs || {};
      U.by('staffDocsCard').innerHTML = docsHTML(st, docs, true);
      bindDocs();
    }

    function bindDocs() {
      U.by('staffDocsCard').querySelectorAll('[data-doc-input]').forEach((input) => {
        input.addEventListener('change', () => {
          const file = input.files && input.files[0];
          if (!file) return;
          const key = input.dataset.docInput;
          const label = (DOC_FIELDS.filter((f) => f.key === key)[0] || {}).label || key;
          S.saveStaffDocument(st.id, key, file).then((map) => {
            repaintDocs(map);
            A.ui.toast('success', 'Document saved', `${label}: ${file.name} is on the record.`);
          }, (error) => A.ui.toast('error', 'Upload failed', error.message));
        });
      });
      U.by('staffDocsCard').querySelectorAll('[data-doc-remove]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const key = btn.dataset.docRemove;
          const label = (DOC_FIELDS.filter((f) => f.key === key)[0] || {}).label || key;
          S.removeStaffDocument(st.id, key).then((map) => {
            repaintDocs(map);
            A.ui.toast('info', 'Document removed', `${label} is no longer attached.`);
          }, (error) => A.ui.toast('error', 'Removal failed', error.message));
        });
      });
    }
    bindDocs();

    U.by('editCancel').addEventListener('click', () => {
      if (!dirty) {
        renderView(container, st, docs);
        return;
      }
      A.ui.confirm({
        title: 'Discard changes',
        tone: 'danger',
        confirmLabel: 'Discard',
        cancelLabel: 'Continue editing',
        message: 'This record has unsaved changes. Discarding cannot be undone.',
      }).then((yes) => {
        if (yes) renderView(container, st, docs);
      });
    });

    U.by('editSave').addEventListener('click', () => {
      const value = (id) => U.by(id).value.trim();
      const nameField = U.by('stfe-name').closest('.field');
      const desigField = U.by('stfe-designation').closest('.field');
      const managerField = U.by('stfe-reportsTo').closest('.field');
      const emailField = U.by('stfe-email').closest('.field');
      [nameField, desigField, managerField, emailField].forEach((f) => f.classList.remove('has-error'));

      let bad = false;
      if (!U.by('stfe-name').value.trim()) { A.ui.error(nameField, 'Enter the name'); bad = true; }
      if (!U.by('stfe-designation').value.trim()) { A.ui.error(desigField, 'Enter the designation'); bad = true; }
      if (!U.by('stfe-reportsTo').value) { A.ui.error(managerField, 'Select the reporting manager'); bad = true; }
      const email = value('stfe-email');
      if (email && !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email)) { A.ui.error(emailField, 'Enter a valid email'); bad = true; }
      if (bad) {
        A.ui.toast('error', 'Validation failed', 'Correct the highlighted fields.');
        return;
      }

      const reportsTo = U.by('stfe-reportsTo').value;
      const manager = S.store.staff.filter((r) => r.name === reportsTo)[0];
      const hub = U.by('stfe-hub').value;
      const city = U.by('stfe-city').value;
      const saveBtn = U.by('editSave');
      saveBtn.disabled = true;
      saveBtn.textContent = 'Saving…';

      S.updateStaff(st.id, {
        name: value('stfe-name'),
        designation: value('stfe-designation'),
        role: U.by('stfe-role').value,
        managerId: manager ? manager.id : null,
        city,
        hub,
        location: hub || city,
        gender: value('stfe-gender'),
        dob: A.DateField.valueOf('stfe-dob') || null,
        mobile: value('stfe-mobile'),
        email,
        address: value('stfe-address'),
        doj: A.DateField.valueOf('stfe-doj') || null,
        hr: value('stfe-hr'),
        cluster: value('stfe-cluster'),
        mandate: value('stfe-mandate'),
        teamNote: value('stfe-teamNote'),
      }).then((updated) => {
        dirty = false;
        A.ui.toast('success', 'Record saved', `${updated.name} updated.`);
        return remount(container, st.id);
      }, (error) => {
        A.ui.toast('error', 'Change not saved', error.message);
        saveBtn.disabled = false;
        saveBtn.textContent = 'Save Changes';
      });
    });
  }

  function mountInto(container, id) {
    return Promise.all([S.fetchStaffDetail(id), S.loadStaffDocuments(id)])
      .then(([st, docs]) => {
        renderView(container, st, docs);
      }, (error) => {
        container.innerHTML = `<div class="card"><div class="card__body"><div class="empty">
          <span class="empty__icon">${icon('users')}</span>
          <h3>Staff member not found</h3>
          <p>${U.esc(error.message)}</p>
          <a class="btn btn--primary" href="#/staff">Back to Internal Staff</a>
        </div></div></div>`;
      });
  }

  pages.staffDetail = function (container, params) {
    const id = decodeURIComponent(params.id);
    container.innerHTML = '<div class="card"><div class="card__body"><div class="skeleton" style="height:96px;margin-bottom:16px"></div><div class="skeleton" style="height:180px"></div></div></div>';
    return S.reload(['staff', 'master', 'targets', 'recruits', 'leave', 'attendance'])
      .then(() => mountInto(container, id));
  };
})(window.App);
