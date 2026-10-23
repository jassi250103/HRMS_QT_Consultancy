window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;

  const STATUS_ACTIVE = 'Active';
  const STATUS_INACTIVE = 'Not Active';

  const emailRx = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

  const spec = [
    { section: 'personal', name: 'name', label: 'Name', type: 'text', required: true, placeholder: 'Full name as per Aadhaar' },
    { section: 'personal', name: 'code', label: 'Recruiter ID', type: 'text', required: true, placeholder: 'ID issued by the company' },
    { section: 'personal', name: 'gender', label: 'Gender', type: 'select', options: ['Male', 'Female', 'Other'], required: true },
    { section: 'personal', name: 'dob', label: 'Date of Birth', type: 'date', required: true },

    { section: 'contact', name: 'mobile', label: 'Mobile Number', type: 'tel', required: true, placeholder: '98860 12470' },
    { section: 'contact', name: 'email', label: 'Email', type: 'email', required: true, placeholder: 'name@mailbox.in' },
    { section: 'contact', name: 'address', label: 'Address', type: 'textarea', required: true, full: true, placeholder: 'House / street / city / pin code' },

    { section: 'employment', name: 'doj', label: 'Date of Joining (DOJ)', type: 'date', required: true },
    { section: 'employment', name: 'role', label: 'Role', type: 'select', options: null, required: true },
    { section: 'employment', name: 'hr', label: 'HR', type: 'select', options: null, required: true },
    { section: 'employment', name: 'company', label: 'Company', type: 'combo', options: null, required: true },
    { section: 'employment', name: 'city', label: 'City', type: 'select', options: null, required: true },
    { section: 'employment', name: 'hub', label: 'Hub', type: 'select', options: null, required: true },
    { section: 'employment', name: 'status', label: 'Active Status', type: 'select', options: [STATUS_ACTIVE, STATUS_INACTIVE], required: true },
  ];

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function optionsHTML(list, selected) {
    return list.map((v) => `<option value="${U.esc(v)}"${v === selected ? ' selected' : ''}>${U.esc(v)}</option>`).join('');
  }

  function optionsFor(name) {
    if (name === 'role') return S.roles();
    if (name === 'company') return S.companies();
    if (name === 'hr') return S.masterActive('hrs');
    if (name === 'city') return S.masterActive('cities');
    if (name === 'hub') return S.masterActive('hubs');
    return [];
  }

  function fieldHTML(field, record, p, autoId) {
    const id = `${p}-${field.name}`;
    const value = record[field.name] == null ? '' : record[field.name];
    const req = field.required && !autoId ? '<span class="req">*</span>' : '';
    let control;

    if (field.type === 'select') {
      const list = field.options || optionsFor(field.name);
      control = `<select class="control" id="${id}">${optionsHTML(list, value)}</select>`;
    } else if (field.type === 'combo') {
      control = `<div id="${id}-host"></div>`;
    } else if (field.type === 'date') {
      control = `<div id="${id}-host"></div>`;
    } else if (field.type === 'textarea') {
      control = `<textarea class="control" id="${id}" rows="2" placeholder="${U.esc(field.placeholder || '')}">${U.esc(value)}</textarea>`;
    } else {
      control = `<input class="control" id="${id}" type="${field.type}" value="${U.esc(value)}" placeholder="${U.esc(field.placeholder || '')}" />`;
    }

    return `<div class="field${field.full ? ' field--full' : ''}" data-field="${field.name}">
      <label class="field__label" for="${id}">${field.label} ${req}</label>
      ${control}
      ${field.name === 'code' ? '<span class="field__hint">The company-assigned ID — this is the recruit\u2019s main identifier.</span>' : ''}
      ${field.name === 'status' ? `<span class="field__hint" id="${id}-hint">No deactivation reason required.</span>` : ''}
      <span class="field__error"></span>
    </div>`;
  }

  function sectionHTML(section, record, p, autoId) {
    const meta = {
      personal: { title: 'Personal Information', icon: 'user' },
      contact: { title: 'Contact Information', icon: 'mail' },
      employment: { title: 'Employment Information', icon: 'briefcase' },
    }[section];
    const fields = spec.filter((f) => f.section === section);
    return `<section class="card" id="${p}-${section}" style="margin-bottom:20px">
      <div class="card__head"><h3 class="section-title" style="margin:0">${icon(meta.icon)}${meta.title}</h3></div>
      <div class="card__body"><div class="form-grid">${fields.map((f) => fieldHTML(f, record, p, autoId)).join('')}</div></div>
    </section>`;
  }

  function reasonBlockHTML(p, record) {
    const show = record.status === STATUS_INACTIVE;
    const isOther = show && record.reason && S.masterActive('deactivationReasons').indexOf(record.reason) === -1;
    return `<div id="${p}-reasonBlock" class="alert alert--danger" style="display:${show ? 'flex' : 'none'};flex-direction:column;align-items:stretch;gap:16px;margin-top:18px">
      <div style="display:flex;gap:11px;align-items:flex-start">
        ${icon('shield')}
        <div class="alert__body">
          <strong>Reason for Deactivation is mandatory</strong>
          <p>Required because the status is Not Active.</p>
        </div>
      </div>
      <div class="form-grid form-grid--2">
        <div class="field" data-field="reason">
          <label class="field__label" for="${p}-reason">Reason <span class="req">*</span></label>
          <select class="control" id="${p}-reason">${A.reasonOptions(record.reason || '')}</select>
          <span class="field__error"></span>
        </div>
        <div class="field" data-field="reasonOther" ${isOther ? '' : 'hidden'}>
          <label class="field__label" for="${p}-reasonOther">Enter Reason <span class="req">*</span></label>
          <input class="control" id="${p}-reasonOther" type="text" maxlength="120" placeholder="Enter reason" value="${U.esc(isOther ? record.reason : '')}" />
          <span class="field__error"></span>
        </div>
        <div class="field field--full" data-field="remarks">
          <label class="field__label" for="${p}-remarks">Remarks <span class="field__hint">(optional)</span></label>
          <input class="control" id="${p}-remarks" type="text" maxlength="180" placeholder="Notes for HR" value="${U.esc(record.remarks || '')}" />
        </div>
      </div>
    </div>`;
  }

  function docsSectionHTML(p, record) {
    return `<section class="card" id="${p}-documents" style="margin-bottom:20px">
      <div class="card__head">
        <div><h3 class="card__title">Documents</h3><p class="card__sub">Aadhaar, PAN, Resume and Passbook uploads are optional.</p></div>
        <span class="badge badge--neutral">Not mandatory</span>
      </div>
      <div class="card__body"><div class="doc-grid" id="${p}-docGrid"></div></div>
    </section>`;
  }

  A.recruitForm = {
    spec,
    STATUS_ACTIVE,
    STATUS_INACTIVE,

    create(config) {
      const p = config.prefix;
      const autoId = !config.editingId;
      const record = Object.assign({
        name: '', code: '', gender: 'Male', dob: '',
        mobile: '', email: '', address: '',
        doj: U.todayKey(), role: S.roles()[0], hr: S.masterActive('hrs')[0], company: S.companies()[0],
        city: S.masterActive('cities')[0], hub: S.masterActive('hubs')[0], status: STATUS_ACTIVE,
        reason: '', remarks: '',
        docs: { aadhaar: null, pan: null, resume: null, passbook: null },
      }, config.record || {});

      config.mount.innerHTML = `
        ${sectionHTML('personal', record, p, autoId)}
        ${sectionHTML('contact', record, p, autoId)}
        ${sectionHTML('employment', record, p, autoId)}
        ${reasonBlockHTML(p, record)}
        ${docsSectionHTML(p, record)}`;

      const docs = Object.assign({ aadhaar: null, pan: null, resume: null, passbook: null }, record.docs || {});
      const tiles = A.ui.docTiles(U.by(`${p}-docGrid`), docs, { editable: true, onChange: config.onDocChange });

      const combo = A.ui.Combobox({
        mount: U.by(`${p}-company-host`),
        data: S.companies(),
        value: record.company,
        placeholder: 'Select company',
        searchable: true,
        label: 'Company',
      });

      /* Date fields are dd/mm/yyyy text + calendar; they still hand yyyy-mm-dd to the API. */
      const dateFields = {};
      spec.filter((f) => f.type === 'date').forEach((f) => {
        dateFields[f.name] = A.DateField({
          mount: U.by(`${p}-${f.name}-host`),
          id: `${p}-${f.name}`,
          label: f.label,
          value: record[f.name],
          max: f.name === 'doj' ? U.todayKey() : '',
        });
      });

      const statusSelect = U.by(`${p}-status`);
      const reasonBlock = U.by(`${p}-reasonBlock`);
      const statusHint = U.by(`${p}-status-hint`);

      function syncReasonBlock() {
        const inactive = statusSelect.value === STATUS_INACTIVE;
        reasonBlock.style.display = inactive ? 'flex' : 'none';
        statusHint.textContent = inactive
          ? 'Reason for Deactivation is mandatory.'
          : 'No deactivation reason required.';
        if (!inactive) {
          U.by(`${p}-reason`).closest('.field').classList.remove('has-error');
          U.by(`${p}-reasonOther`).closest('.field').classList.remove('has-error');
        }
      }
      statusSelect.addEventListener('change', syncReasonBlock);

      U.by(`${p}-reason`).addEventListener('change', (ev) => {
        U.by(`${p}-reasonOther`).closest('.field').hidden = ev.target.value !== 'Other';
      });
      if (record.reason && S.masterActive('deactivationReasons').indexOf(record.reason) === -1) {
        U.by(`${p}-reason`).value = 'Other';
        U.by(`${p}-reasonOther`).closest('.field').hidden = false;
      }
      syncReasonBlock();

      function value(name) {
        if (name === 'company') return combo.value;
        if (dateFields[name]) return dateFields[name].value;
        const node = U.by(`${p}-${name}`);
        return node ? node.value.trim() : '';
      }

      function collect() {
        return {
          code: value('code'),
          name: value('name'),
          gender: value('gender'),
          dob: value('dob'),
          mobile: value('mobile'),
          email: value('email'),
          address: value('address'),
          doj: value('doj'),
          role: value('role'),
          hr: value('hr'),
          company: value('company'),
          city: value('city'),
          hub: value('hub'),
          status: value('status'),
          reason: value('status') === STATUS_ACTIVE ? '' : (value('reason') === 'Other' ? value('reasonOther') : value('reason')),
          remarks: value('status') === STATUS_ACTIVE ? '' : value('remarks'),
          docs,
        };
      }

      function validate() {
        A.ui.clearErrors(config.mount);
        const data = collect();
        const errors = {};

        spec.forEach((field) => {
          const raw = value(field.name);
          if (field.required && !raw) {
            errors[field.name] = `${field.label} is required`;
            return;
          }
          if (field.name === 'name' && raw.length < 3) errors.name = 'Enter the full name';
          if (field.name === 'mobile' && !/^[0-9][0-9 \-+()]{8,15}$/.test(raw)) errors.mobile = 'Enter a valid mobile number';
          if (field.name === 'email' && !emailRx.test(raw)) errors.email = 'Enter a valid email address';
          if (field.name === 'dob') {
            if (U.daysBetween(raw, U.todayKey()) < 18 * 365) errors.dob = 'Recruit must be at least 18 years old';
          }
          if (field.name === 'doj' && raw > U.todayKey()) errors.doj = 'DOJ cannot be in the future';
        });

        if (data.status === STATUS_INACTIVE) {
          const reason = value('reason');
          if (!reason) errors.reason = 'Select the reason for deactivation';
          else if (reason === 'Other' && !value('reasonOther')) errors.reasonOther = 'Enter the deactivation reason';
        }

        Object.keys(errors).forEach((key) => {
          const host = config.mount.querySelector(`[data-field="${key}"]`);
          A.ui.error(host, errors[key]);
        });

        return { ok: !Object.keys(errors).length, data, errors };
      }

      return {
        prefix: p,
        record,
        collect,
        validate,
        docs,
        combo,
        // The detail page writes files straight away, so it swaps a tile's content for the server's copy.
        setDoc(key, value) {
          docs[key] = value;
          tiles.render();
        },
        statusValue: () => statusSelect.value,
        focusFirstInvalid: () => A.ui.firstInvalid(config.mount),
      };
    },
  };

  /* ---------- Add Recruiter page ---------- */
  const pages = (A.pages = A.pages || {});

  pages.recruitNew = function (container) {
    let dirty = false;
    // Consumed once so a plain "Add Recruit" never inherits a stale join.
    const join = A.pendingJoin || null;
    A.pendingJoin = null;
    container.innerHTML = `<div class="form-page" style="max-width:900px;margin:0 auto">
      <div class="form-topbar">
        <nav class="breadcrumb" style="margin:0">
          <a href="#/recruits">${join ? 'My Calls' : 'My Recruits'}</a>
          <svg viewBox="0 0 24 24">${A.ui.icons.chev}</svg>
          <span>${join ? 'Mark as joined' : 'Add Recruits'}</span>
        </nav>
        <div class="form-anchor-nav">
          <a class="form-anchor" href="#add-personal">Personal</a>
          <a class="form-anchor" href="#add-contact">Contact</a>
          <a class="form-anchor" href="#add-employment">Employment</a>
          <a class="form-anchor" href="#add-documents">Documents</a>
        </div>
      </div>

      <div id="recruitFormHost">
        ${[0, 1, 2].map(() => '<section class="card" style="margin-bottom:20px"><div class="card__body">'
          + [0, 1, 2, 3].map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:12px"></span>').join('')
          + '</div></section>').join('')}
      </div>

      <div class="form-foot">
        <p class="form-foot__note">Fields marked <span class="req">*</span> are required. Documents are optional.</p>
        <div class="btn-row">
          <button class="btn" type="button" id="formCancel">Cancel</button>
          <button class="btn btn--primary" type="button" id="formSave" disabled>Save Recruit</button>
        </div>
      </div>
    </div>`;

    container.querySelectorAll('.form-anchor').forEach((link) => {
      link.addEventListener('click', (ev) => {
        ev.preventDefault();
        const target = U.by(link.getAttribute('href').slice(1));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    });

    const backTo = join ? '#/my-calls' : '#/recruits';
    U.by('formCancel').addEventListener('click', () => {
      if (!dirty) {
        A.router(backTo);
        return;
      }
      A.ui.confirm({
        title: 'Discard changes',
        tone: 'danger',
        confirmLabel: 'Discard',
        cancelLabel: 'Continue editing',
        message: 'This record has unsaved changes. Discarding cannot be undone.',
      }).then((accepted) => {
        if (accepted) A.router(backTo);
      });
    });

    /* The dropdowns read the master lists, so the form is built after they arrive. */
    return S.reload(['master', 'staff', 'recruits']).then(() => {
      const host = U.by('recruitFormHost');
      const form = A.recruitForm.create({ mount: host, prefix: 'add', record: join ? { name: join.name, mobile: join.mobile } : undefined });
      if (join) {
        const mobileInput = U.by('add-mobile');
        mobileInput.readOnly = true;
        mobileInput.classList.add('is-readonly');
        mobileInput.closest('.field').insertAdjacentHTML('beforeend',
          '<span class="field__hint">Mobile is locked — it links this contact to the recruit record.</span>');
      }
      host.addEventListener('input', () => { dirty = true; });
      host.addEventListener('change', () => { dirty = true; });
      U.by('formSave').disabled = false;

      U.by('formSave').addEventListener('click', () => {
        const result = form.validate();
        if (!result.ok) {
          form.focusFirstInvalid();
          A.ui.toast('error', 'Validation failed', 'Correct the highlighted fields.');
          return;
        }
        const data = result.data;
        const saveBtn = U.by('formSave');
        saveBtn.disabled = true;
        saveBtn.textContent = join ? 'Marking joined…' : 'Saving…';

        S.addRecruit({
          name: data.name, gender: data.gender, dob: data.dob,
          mobile: data.mobile, email: data.email, address: data.address,
          company: data.company, role: data.role, hr: data.hr, doj: data.doj,
          city: data.city, hub: data.hub, status: data.status,
          reason: data.reason, remarks: data.remarks,
          code: data.code || undefined,
          docs: data.docs,
          ownerId: A.state.session.userId,  // Explicitly set owner to current user
        }).then((created) => {
          if (!created) throw new Error('The record was saved but could not be re-read.');
          if (!join) {
            dirty = false;
            A.ui.toast('success', 'Record saved', `${created.name} (${created.id}) added to your recruit list.`);
            A.router(`#/recruits/${encodeURIComponent(created.id)}`);
            return null;
          }
          // The recruit now exists with the contact's (locked) mobile, so convert links the sheet row to it.
          return A.api.post(`/sheets/rows/${join.rowId}/convert`, {}).then(() => {
            dirty = false;
            return S.reload(['recruits', 'staff']).then(() => {
              A.ui.toast('success', 'Marked as joined', `${created.name} (${created.id}) joined and linked to the sheet.`);
              A.router(`#/recruits/${encodeURIComponent(created.id)}`);
            });
          });
        }, (error) => {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save Recruit';
          A.ui.toast('error', 'Record not saved', error.message);
        });
      });
    });
  };
})(window.App);
