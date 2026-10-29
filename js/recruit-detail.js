window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});
  const ACTIVE = 'Active';

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function item(label, value, muted) {
    return `<div class="detail-item">
      <p class="detail-item__label">${label}</p>
      <p class="detail-item__value${muted && !value ? ' detail-item__value--muted' : ''}">${value || '—'}</p>
    </div>`;
  }

  function readOnlyCards(r) {
    const personal = `<div class="detail-grid">
      ${item('Name', U.esc(r.name))}
      ${item('Recruit ID', `<strong>${U.esc(r.id)}</strong>`)}
      ${item('Gender', U.esc(r.gender))}
      ${item('Date of Birth', U.fmtDate(r.dob))}
    </div>`;
    const contact = `<div class="detail-grid">
      ${item('Mobile Number', U.esc(r.mobile))}
      ${item('Email', U.esc(r.email))}
      ${item('Address', U.esc(r.address))}
    </div>`;
    const employment = `<div class="detail-grid">
      ${item('Date of Joining (DOJ)', U.fmtDate(r.doj))}
      ${item('Role', U.esc(r.role))}
      ${item('HR', U.esc(r.hr))}
      ${item('Company', U.esc(r.company))}
      ${item('City', U.esc(r.city))}
      ${item('Hub', U.esc(r.hub))}
      ${item('Active Status', `<span class="badge ${r.status === ACTIVE ? 'badge--active' : 'badge--inactive'}"><i></i>${U.esc(r.status)}</span>`)}
      ${r.status === ACTIVE ? '' : item('Deactivated On', U.fmtDate(r.deactivatedOn || r.doj))}
    </div>`;

    return `<div class="profile-cols">
        <section class="card"><div class="card__head"><h3 class="section-title" style="margin:0">${icon('user')}Personal Information</h3></div><div class="card__body">${personal}</div></section>
        <section class="card"><div class="card__head"><h3 class="section-title" style="margin:0">${icon('mail')}Contact Information</h3></div><div class="card__body">${contact}</div></section>
      </div>
      <section class="card"><div class="card__head"><h3 class="section-title" style="margin:0">${icon('briefcase')}Employment Information</h3></div><div class="card__body">${employment}</div></section>`;
  }

  function docsCard(r) {
    const acceptNote = 'PDF, JPG, PNG, DOC, DOCX. Max 5 MB.';
    const tiles = A.data.docFields.map((f) => {
      const file = r.docs[f.key];
      if (!file) {
        return `<div class="doc-tile">
          <div class="doc-tile__head"><span class="doc-tile__name">${f.label}</span><span class="doc-tile__opt">Optional</span></div>
          <p class="field__hint">Not uploaded</p>
          <p class="doc-tile__accept">${acceptNote}</p>
        </div>`;
      }
      return `<div class="doc-tile has-file">
        <div class="doc-tile__head"><span class="doc-tile__name">${f.label}</span><span class="doc-tile__opt">Uploaded</span></div>
        <div class="doc-tile__file">
          <span class="doc-tile__file-icon"><svg viewBox="0 0 24 24">${A.ui.icons.file}</svg></span>
          <span class="doc-tile__file-text"><strong title="${U.esc(file.name)}">${U.esc(file.name)}</strong><small>${U.fmtBytes(file.size)}, uploaded ${U.fmtDate(file.uploadedOn)}</small></span>
          <span class="doc-tile__actions"><button class="icon-btn icon-btn--sm" type="button" data-view-doc="${f.key}" title="Open ${f.label}" aria-label="Open ${f.label} file"><svg viewBox="0 0 24 24">${A.ui.icons.download}</svg></button></span>
        </div>
        <p class="doc-tile__accept">${acceptNote}</p>
      </div>`;
    }).join('');

    const uploaded = A.data.docFields.filter((f) => r.docs[f.key]).length;
    return `<section class="card">
      <div class="card__head">
        <div><h3 class="card__title">Documents</h3><p class="card__sub">${uploaded} of 4 documents on file. Uploads are optional.</p></div>
        <span class="badge badge--neutral">${uploaded} of 4</span>
      </div>
      <div class="card__body"><div class="doc-grid">${tiles}</div></div>
    </section>`;
  }

  function timeline(r) {
    const events = [{ label: `Joined ${r.company}`, date: r.doj, note: `Onboarded as ${r.role}, ${r.hub}` }];
    A.data.docFields.forEach((f) => {
      const file = r.docs[f.key];
      if (file) events.push({ label: `${f.label} uploaded`, date: file.uploadedOn, note: file.name });
    });
    if (r.status !== ACTIVE) {
      events.push({ danger: true, label: `Marked Not Active. Reason: ${r.reason || 'Not recorded'}`, date: r.deactivatedOn || r.doj, note: r.remarks || 'No remarks' });
    }
    events.sort((a, b) => (a.date < b.date ? 1 : -1));
    return `<section class="card">
      <div class="card__head"><div><h3 class="card__title">Record history</h3><p class="card__sub">Events logged on this recruit record</p></div></div>
      <div class="card__body"><div class="timeline">
        ${events.map((e) => `<div class="timeline__item${e.danger ? ' timeline__item--danger' : ''}">
          <strong>${U.esc(e.label)}</strong>
          <span>${U.fmtDate(e.date)}</span>
          <p>${U.esc(e.note)}</p>
        </div>`).join('')}
      </div></div>
    </section>`;
  }

  function hero(r, mode) {
    const isActive = r.status === ACTIVE;
    return `<div class="detail-hero">
      <div class="detail-hero__meta">
        <h2>${U.esc(r.name)}
          <span class="badge ${isActive ? 'badge--active' : 'badge--inactive'}"><i></i>${U.esc(r.status)}</span>
          ${mode === 'edit' ? '<span class="edit-flag">Editing</span>' : ''}
        </h2>
        <p>${U.esc(r.company)} · ${U.esc(r.role)} · DOJ ${U.fmtDate(r.doj)}</p>
        <div class="profile-hero__tags">
          <span class="chip">Recruit ID <strong>${U.esc(r.id)}</strong></span>
          <span class="chip">HR <strong>${U.esc(r.hr)}</strong></span>
          <span class="chip">City <strong>${U.esc(r.city)}</strong></span>
          <span class="chip">Hub <strong>${U.esc(r.hub)}</strong></span>
        </div>
      </div>
      ${mode === 'view' ? `<div class="detail-hero__actions">
        <a class="btn" href="#/recruits">Back to list</a>
        <button class="btn" type="button" data-action="toggle-status">${isActive ? 'Mark Not Active' : 'Mark Active'}</button>
        <button class="btn btn--primary" type="button" data-action="edit">Edit</button>
      </div>` : ''}</div>`;
  }

  function deactivationAlert(r) {
    if (r.status === ACTIVE) return '';
    return `<div class="alert alert--danger">
      <div class="alert__body">
        <strong>Not Active · Reason: ${U.esc(r.reason || 'Not recorded')}</strong>
        <p>Remarks: ${U.esc(r.remarks || 'None')}</p>
        <p>Recorded on ${U.fmtDate(r.deactivatedOn || r.doj)} by ${U.esc(A.state.ownerName(r.ownerId))} (${U.esc(A.data.org.byId[r.ownerId] ? A.data.org.byId[r.ownerId].employeeId : '—')}).</p>
      </div>
    </div>`;
  }

  function recordToFormShape(r) {
    return {
      name: r.name, code: r.code || r.id, gender: r.gender, dob: r.dob,
      mobile: r.mobile, email: r.email, address: r.address,
      doj: r.doj, role: r.role, hr: r.hr, company: r.company,
      city: r.city, hub: r.hub, status: r.status,
      reason: r.reason, remarks: r.remarks,
      docs: Object.assign({}, r.docs),
    };
  }

  function renderView(container, r) {
    container.innerHTML = `<div class="form-page">
      <nav class="breadcrumb">
        <a href="#/recruits">My Recruits</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <span>${U.esc(r.id)}</span>
      </nav>
      ${hero(r, 'view')}
      ${deactivationAlert(r)}
      ${readOnlyCards(r)}
      ${docsCard(r)}
      ${timeline(r)}
    </div>`;

    const editBtn = container.querySelector('[data-action="edit"]');
    if (editBtn) editBtn.addEventListener('click', () => renderEdit(container, r));

    const toggleBtn = container.querySelector('[data-action="toggle-status"]');
    if (toggleBtn) toggleBtn.addEventListener('click', () => {
      const next = r.status === ACTIVE ? S.INACTIVE : ACTIVE;
      A.statusFlow(r, next, () => mount(r.id, container));
    });

    container.querySelectorAll('[data-view-doc]').forEach((btn) => {
      btn.addEventListener('click', (ev) => {
        ev.stopPropagation();
        const key = btn.dataset.viewDoc;
        const field = A.data.docFields.find((f) => f.key === key);
        btn.disabled = true;
        /* Files sit behind the bearer token, so the browser fetches a blob rather than linking to it. */
        S.downloadDocument(r.id, key).then(() => {
          A.ui.toast('success', 'File downloaded', `${field ? field.label : key} saved from the record.`);
        }, (error) => {
          A.ui.toast('error', 'File not available', error.message);
        }).then(() => { btn.disabled = false; });
      });
    });
  }

  function renderEdit(container, r) {
    container.innerHTML = `<div class="form-page">
      <nav class="breadcrumb">
        <a href="#/recruits">My Recruits</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <a href="#/recruits/${encodeURIComponent(r.id)}">${U.esc(r.id)}</a>
        <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
        <span>Edit</span>
      </nav>
      ${hero(r, 'edit')}
      <div id="editFormHost"></div>
      <div class="form-foot">
        <p class="form-foot__note">Documents can be replaced or removed. Uploads are optional.</p>
        <div class="btn-row">
          <button class="btn" type="button" id="editCancel">Cancel</button>
          <button class="btn btn--primary" type="button" id="editSave">Save Changes</button>
        </div>
      </div>
    </div>`;

    const form = A.recruitForm.create({
      mount: U.by('editFormHost'),
      prefix: 'edit',
      editingId: r.id,
      record: recordToFormShape(r),
      onDocChange: writeDocument,
    });

    let dirty = false;
    U.by('editFormHost').addEventListener('input', () => { dirty = true; });
    U.by('editFormHost').addEventListener('change', () => { dirty = true; });

    /* A document is stored on its own, the moment it is picked, not with the Save button. */
    function writeDocument(key, value) {
      const field = A.data.docFields.filter((f) => f.key === key)[0];
      const label = field ? field.label : key;

      if (value && value.file) {
        const file = value.file;
        return S.saveDocument(r.id, key, file).then((fresh) => {
          form.setDoc(key, fresh && fresh.docs ? Object.assign({}, fresh.docs[key]) : null);
          A.ui.toast('success', 'Document saved', `${label}: ${file.name} is on the record.`);
        }, (error) => {
          form.setDoc(key, null);
          A.ui.toast('error', 'Upload failed', error.message);
        });
      }
      if (value) return undefined;

      return S.removeDocument(r.id, key).then(() => {
        form.setDoc(key, null);
        A.ui.toast('info', 'Document removed', `${label} is no longer attached to this record.`);
      }, (error) => {
        A.ui.toast('error', 'Removal failed', error.message);
      });
    }

    function leaveView() {
      if (!dirty) {
        renderView(container, S.getRecruit(r.id));
        return;
      }
      A.ui.confirm({
        title: 'Discard changes',
        tone: 'danger',
        confirmLabel: 'Discard',
        cancelLabel: 'Continue editing',
        message: 'This record has unsaved changes. Discarding cannot be undone.',
      }).then((accepted) => {
        if (accepted) {
          dirty = false;
          renderView(container, S.getRecruit(r.id));
        }
      });
    }

    U.by('editCancel').addEventListener('click', leaveView);

    U.by('editSave').addEventListener('click', () => {
      const result = form.validate();
      if (!result.ok) {
        form.focusFirstInvalid();
        A.ui.toast('error', 'Validation failed', 'Correct the highlighted fields.');
        return;
      }
      const data = result.data;
      const wasActive = r.status === ACTIVE;
      const willBeActive = data.status === ACTIVE;

      function persist(note) {
        const saveBtn = U.by('editSave');
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
        return S.updateRecruit(r.id, data).then((updated) => {
          dirty = false;
          if (!updated) {
            A.ui.toast('error', 'Change not saved', 'The record could not be re-read.');
            return;
          }
          A.ui.toast('success', 'Record saved', note || `${updated.name} (${updated.id}) updated.`);
          return mount(r.id, container);
        }, (error) => {
          A.ui.toast('error', 'Change not saved', error.message);
        }).then(() => {
          const btn = U.by('editSave');
          if (btn) { btn.disabled = false; btn.textContent = 'Save Changes'; }
        });
      }

      if (wasActive && !willBeActive) {
        A.ui.confirm({
          title: 'Confirm deactivation',
          tone: 'danger',
          confirmLabel: 'Yes, deactivate',
          cancelLabel: 'Go back',
          message: `Set <strong>${U.esc(data.name)}</strong> to <strong>Not Active</strong>.<br>Reason: ${U.esc(data.reason)}. The reason is stored on this record.`,
        }).then((accepted) => {
          if (accepted) persist(`${data.name} set to Not Active. Reason: ${data.reason}.`);
        });
        return;
      }

      if (!wasActive && willBeActive) {
        A.ui.confirm({
          title: 'Reactivate recruit',
          tone: 'brand',
          confirmLabel: 'Yes, reactivate',
          cancelLabel: 'Keep as Not Active',
          message: `Set <strong>${U.esc(data.name)}</strong> to <strong>Active</strong>. The stored deactivation reason will be removed.`,
        }).then((accepted) => {
          if (accepted) persist(`${data.name} set to Active.`);
        });
        return;
      }

      persist();
    });
  }

  function mount(id, container) {
    const host = container || U.by('view');
    const key = decodeURIComponent(id);
    host.innerHTML = '<div class="card"><div class="card__body"><div class="skeleton" style="height:96px;margin-bottom:16px"></div><div class="skeleton" style="height:180px"></div></div></div>';

    return S.fetchRecruit(key).then((r) => {
      renderView(host, r);
    }, (error) => {
      host.innerHTML = `<div class="card"><div class="card__body"><div class="empty">
        <span class="empty__icon">${icon('users')}</span>
        <h3>Recruit not found</h3>
        <p>${U.esc(error.message)}</p>
        <a class="btn btn--primary" href="#/recruits">Back to My Recruits</a>
      </div></div></div>`;
    });
  }

  pages.recruitDetail = function (container, params) {
    return mount(params.id, container);
  };
})(window.App);
