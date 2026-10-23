window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const ui = {};

  /* ============ Toast ============ */
  const ICONS = {
    success: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    error: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v5"/><path d="M12 16h.01"/>',
    warning: '<path d="M12 4.5 21 19H3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    info: '<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  };

  const CHEV = '<path d="M9 6l6 6-6 6"/>';

  ui.toast = function (tone, title, message, ms) {
    const stack = U.by('toastStack');
    const node = document.createElement('div');
    node.className = `toast toast--${tone}`;
    node.setAttribute('role', tone === 'error' ? 'alert' : 'status');
    node.style.setProperty('--toast-dur', `${ms || 3800}ms`);
    node.innerHTML =
      `<span class="toast__icon"><svg viewBox="0 0 24 24">${ICONS[tone] || ICONS.info}</svg></span>
       <span class="toast__text"><strong>${U.esc(title)}</strong>${message ? `<p>${U.esc(message)}</p>` : ''}</span>
       <button class="icon-btn icon-btn--sm" aria-label="Dismiss notification"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
       <span class="toast__bar" aria-hidden="true"></span>`;
    stack.appendChild(node);
    const kill = () => {
      node.classList.add('is-out');
      setTimeout(() => node.remove(), 200);
    };
    node.querySelector('button').addEventListener('click', kill);
    setTimeout(kill, ms || 3800);
  };

  /* ============ Modal ============ */
  let modalCleanup = null;

  ui.modal = function (config) {
    const layer = U.by('modalLayer');
    const box = U.by('modalBox');
    const body = U.by('modalBody');
    const foot = U.by('modalFoot');

    U.by('modalTitle').textContent = config.title || '';
    box.classList.toggle('modal--sm', !!config.compact);
    body.innerHTML = config.body || '';
    foot.innerHTML = '';

    const api = {
      close() {
        layer.hidden = true;
        box.className = 'modal';
        if (modalCleanup) modalCleanup();
        modalCleanup = null;
        if (config.onClose) config.onClose();
      },
      body,
      foot,
    };

    (config.actions || []).forEach((action) => {
      const btn = document.createElement('button');
      btn.className = `btn ${action.variant ? `btn--${action.variant}` : ''}${action.size ? ` btn--${action.size}` : ''}`;
      btn.textContent = action.label;
      btn.addEventListener('click', () => action.onClick(api));
      foot.appendChild(btn);
    });

    layer.hidden = false;
    document.body.style.overflow = 'hidden';

    const onKey = (ev) => {
      if (ev.key === 'Escape' && !config.persistent) api.close();
      if (ev.key === 'Tab') trapFocus(ev, box);
    };
    document.addEventListener('keydown', onKey);

    modalCleanup = () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };

    U.by('modalClose').onclick = () => {
      if (!config.persistent) api.close();
    };
    U.by('modalBackdrop').onclick = () => {
      if (!config.persistent) api.close();
    };

    const focusTarget = box.querySelector('[data-autofocus]') || foot.querySelector('.btn--primary') || U.by('modalClose');
    if (focusTarget) setTimeout(() => focusTarget.focus(), 40);

    if (config.onMount) config.onMount(api);
    return api;
  };

  function trapFocus(ev, container) {
    const focusables = Array.prototype.slice.call(
      container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')
    ).filter((n) => !n.disabled && n.offsetParent !== null);
    if (!focusables.length) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    }
  }

  ui.confirm = function (opts) {
    return new Promise((resolve) => {
      const tone = opts.tone || 'warning';
      const glyph = tone === 'danger'
        ? '<path d="M12 4.5 21 19H3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>'
        : '<path d="M12 3.5a8.5 8.5 0 1 0 0 17 8.5 8.5 0 0 0 0-17Z"/><path d="M12 11v5"/><path d="M12 8h.01"/>';
      let settled = false;
      const finish = (value) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      const requireText = opts.requireText ? String(opts.requireText) : null;
      const typeBlock = requireText
        ? `<div class="confirm-type">
             <label for="confirmTypeInput">This is permanent. Type <strong class="confirm-type__word">${U.esc(requireText)}</strong> to confirm:</label>
             <input class="control" id="confirmTypeInput" data-autofocus type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${U.esc(requireText)}" />
           </div>`
        : '';

      const m = ui.modal({
        title: opts.title,
        compact: true,
        persistent: !!requireText,
        body: `<div class="confirm-icon confirm-icon--${tone}"><svg viewBox="0 0 24 24">${glyph}</svg></div>
               <p>${opts.message}</p>${typeBlock}`,
        actions: [
          { label: opts.cancelLabel || 'Cancel', onClick: (m2) => { finish(false); m2.close(); } },
          { label: opts.confirmLabel || 'Confirm', variant: tone === 'danger' ? 'danger' : 'primary', onClick: (m2) => { finish(true); m2.close(); } },
        ],
        onClose: () => finish(false),
      });

      if (requireText) {
        const input = m.body.querySelector('#confirmTypeInput');
        const confirmBtn = m.foot.querySelector('.btn:last-child');
        if (input && confirmBtn) {
          confirmBtn.disabled = true;
          const sync = () => {
            confirmBtn.disabled = input.value.trim().toLowerCase() !== requireText.trim().toLowerCase();
          };
          input.addEventListener('input', sync);
          input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter' && !confirmBtn.disabled) { finish(true); m.close(); }
          });
          sync();
        }
      }
    });
  };

  ui.notice = function (title, bodyHTML, label) {
    ui.modal({
      title,
      compact: true,
      body: bodyHTML,
      actions: [{ label: label || 'Close', variant: 'primary', onClick: (m) => m.close() }],
    });
  };

  /* ============ Combobox (searchable select) ============ */
  ui.Combobox = function (options) {
    const cfg = Object.assign({
      mount: null,
      data: [],
      value: '',
      placeholder: 'Select',
      searchPlaceholder: 'Search',
      searchable: true,
      label: 'Filter',
    }, options);

    const wrap = document.createElement('div');
    wrap.className = 'combo';
    wrap.innerHTML = `
      <button type="button" class="combo__trigger" aria-haspopup="listbox" aria-expanded="false">
        <span class="combo__text is-placeholder">${U.esc(cfg.placeholder)}</span>
        <span class="combo__clear" role="button" tabindex="-1" hidden aria-label="Clear selection"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></span>
        <svg class="combo__caret" viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <div class="combo__panel" hidden></div>`;
    cfg.mount.appendChild(wrap);

    const trigger = wrap.querySelector('.combo__trigger');
    const textEl = wrap.querySelector('.combo__text');
    const clearEl = wrap.querySelector('.combo__clear');
    const panel = wrap.querySelector('.combo__panel');
    let value = cfg.value;
    let query = '';

    function render() {
      textEl.textContent = value || cfg.placeholder;
      textEl.classList.toggle('is-placeholder', !value);
      clearEl.hidden = !value;
      trigger.setAttribute('aria-label', `${cfg.label}: ${value || cfg.placeholder}`);
    }

    clearEl.addEventListener('click', (ev) => {
      ev.stopPropagation();
      if (!value) return;
      value = '';
      render();
      if (cfg.onChange) cfg.onChange(value);
    });

    function buildPanel() {
      const list = cfg.data.filter((item) => !query || item.toLowerCase().indexOf(query.toLowerCase()) !== -1);
      panel.innerHTML = `${cfg.searchable ? `<input class="combo__search" type="text" placeholder="${U.esc(cfg.searchPlaceholder)}" value="${U.esc(query)}" />` : ''}
        <div class="combo__list" role="listbox">${
          list.length
            ? list.map((item) => `<button type="button" class="combo__opt${item === value ? ' is-selected' : ''}" role="option" data-value="${U.esc(item)}">${U.esc(item)}${item === value ? '<svg viewBox="0 0 24 24"><path d="M4 12.5 9 17.5 20 6.5"/></svg>' : ''}</button>`).join('')
            : '<p class="combo__empty">No matches found</p>'
        }</div>`;
      const search = panel.querySelector('.combo__search');
      if (search) {
        search.addEventListener('input', () => {
          query = search.value;
          buildPanel();
          const next = panel.querySelector('.combo__search');
          next.focus();
          next.setSelectionRange(next.value.length, next.value.length);
        });
      }
      U.delegate(panel, 'click', '.combo__opt', (ev, opt) => {
        value = opt.dataset.value;
        query = '';
        close();
        render();
        if (cfg.onChange) cfg.onChange(value);
      });
    }

    function open() {
      panel.hidden = false;
      wrap.classList.add('is-open');
      trigger.setAttribute('aria-expanded', 'true');
      buildPanel();
      const search = panel.querySelector('.combo__search');
      if (search) search.focus();
      document.addEventListener('mousedown', outside, true);
    }

    function close() {
      panel.hidden = true;
      wrap.classList.remove('is-open');
      trigger.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
    }

    function outside(ev) {
      if (!wrap.contains(ev.target)) close();
    }

    trigger.addEventListener('click', () => (panel.hidden ? open() : close()));
    document.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !panel.hidden) close();
    });

    render();

    return {
      element: wrap,
      get value() { return value; },
      setValue(next, silent) {
        value = next || '';
        render();
        if (!silent && cfg.onChange) cfg.onChange(value);
      },
      open,
      close,
    };
  };

  /* ============ Field errors ============ */
  ui.error = function (fieldEl, message) {
    if (!fieldEl) return;
    fieldEl.classList.add('has-error');
    const box = fieldEl.querySelector('.field__error');
    if (box) box.textContent = message;
  };

  ui.clearErrors = function (root) {
    (root || document).querySelectorAll('.field.has-error').forEach((f) => f.classList.remove('has-error'));
    (root || document).querySelectorAll('.field__error').forEach((box) => { box.textContent = ''; });
  };

  ui.firstInvalid = function (root) {
    const node = root.querySelector('.field.has-error .control, .field.has-error .combo__trigger');
    if (node) node.focus();
    return !!node;
  };

  /* ============ Document upload tiles ============ */
  const FILE_GLYPH = '<path d="M14 4v5h5"/><path d="M14 4H7a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V9Z"/>';
  const UPLOAD_GLYPH = '<path d="M12 16V5"/><path d="M7.5 9.5 12 5l4.5 4.5"/><path d="M5 18h14"/>';

  ui.docTiles = function (mount, docs, opts) {
    const config = Object.assign({ editable: true, onChange: null }, opts);
    const acceptText = 'PDF, JPG, PNG, DOC, DOCX. Max 5 MB.';

    function inputHTML(field) {
      return `<input class="doc-input" type="file" accept="${A.data.docAccept}" data-doc="${field.key}" hidden />`;
    }

    function tileHTML(field) {
      const file = docs[field.key];
      if (!file) {
        return `<div class="doc-tile" data-doc="${field.key}">
          <div class="doc-tile__head"><span class="doc-tile__name">${field.label}</span><span class="doc-tile__opt">Optional</span></div>
          ${config.editable
            ? `<button type="button" class="doc-tile__drop" data-act="pick">
                 <svg viewBox="0 0 24 24">${UPLOAD_GLYPH}</svg><span>Select file</span></button>${inputHTML(field)}`
            : '<p class="field__hint">Not uploaded</p>'}
          <p class="doc-tile__accept">${acceptText}</p>
        </div>`;
      }
      const actions = config.editable
        ? `<span class="doc-tile__actions">
             <button type="button" class="icon-btn icon-btn--sm" data-act="pick" title="Replace file" aria-label="Replace ${field.label} file"><svg viewBox="0 0 24 24">${UPLOAD_GLYPH}</svg></button>
             <button type="button" class="icon-btn icon-btn--sm" data-act="remove" title="Remove file" aria-label="Remove ${field.label} file"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>
             ${inputHTML(field)}
           </span>`
        : '';
      return `<div class="doc-tile has-file" data-doc="${field.key}">
        <div class="doc-tile__head"><span class="doc-tile__name">${field.label}</span><span class="doc-tile__opt">Uploaded</span></div>
        <div class="doc-tile__file">
          <span class="doc-tile__file-icon"><svg viewBox="0 0 24 24">${FILE_GLYPH}</svg></span>
          <span class="doc-tile__file-text"><strong title="${U.esc(file.name)}">${U.esc(file.name)}</strong><small>${U.fmtBytes(file.size)}, uploaded ${U.esc(file.uploadedOn ? U.fmtDate(file.uploadedOn) : '—')}</small></span>
          ${actions}
        </div>
        <p class="doc-tile__accept">${acceptText}</p>
      </div>`;
    }

    function render() {
      mount.innerHTML = A.data.docFields.map(tileHTML).join('');
    }

    render();

    if (config.editable) {
      function accept(key, file) {
        const ext = `.${(file.name.split('.').pop() || '').toLowerCase()}`;
        if (A.data.docAccept.split(',').indexOf(ext) === -1) {
          ui.toast('error', 'Unsupported file type', `${file.name}. Allowed: PDF, JPG, PNG, DOC, DOCX.`);
          return;
        }
        if (file.size > A.data.docMaxBytes) {
          ui.toast('error', 'File too large', `${file.name} exceeds the 5 MB limit.`);
          return;
        }
        /* The browser keeps the File until the record exists, then state.js uploads it. */
        docs[key] = { name: file.name, size: file.size, uploadedOn: U.todayKey(), file };
        render();
        ui.toast('success', 'File attached', `${A.data.docFields.find((f) => f.key === key).label}: ${file.name}`);
        if (config.onChange) config.onChange(key, docs[key]);
      }

      mount.addEventListener('change', (ev) => {
        const input = ev.target.closest('.doc-input');
        if (!input) return;
        const file = input.files && input.files[0];
        if (file) accept(input.dataset.doc, file);
      });

      mount.addEventListener('click', (ev) => {
        const btn = ev.target.closest('[data-act]');
        if (!btn) return;
        const tile = btn.closest('[data-doc]');
        const key = tile.dataset.doc;
        if (btn.dataset.act === 'pick') {
          const input = tile.querySelector('.doc-input');
          if (input) input.click();
          return;
        }
        docs[key] = null;
        render();
        ui.toast('info', 'File removed', `${A.data.docFields.find((f) => f.key === key).label} is no longer attached.`);
        if (config.onChange) config.onChange(key, null);
      });
    }

    return { render };
  };

  ui.icons = {
    upload: UPLOAD_GLYPH,
    download: '<path d="M12 4v10"/><path d="M7.5 10.5 12 15l4.5-4.5"/><path d="M5 19h14"/>',
    file: FILE_GLYPH,
    chev: CHEV,
    plus: '<path d="M12 5v14M5 12h14"/>',
    search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4 4"/>',
    pencil: '<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="M13.5 6.5 17.5 10.5"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    filter: '<path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/>',
    users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3 2.9-4.6 5.5-4.6S14 16 14.6 19"/><path d="M16.5 6.4a3 3 0 0 1 0 5.2"/><path d="M18 14.6c2 .6 3.2 2.1 3.6 4.4"/>',
    user: '<circle cx="12" cy="8" r="3.4"/><path d="M5 20c.8-3.7 3.6-5.6 7-5.6s6.2 1.9 7 5.6"/>',
    mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 7 12 13l8.5-6"/>',
    phone: '<path d="M7 3.5h2.5L11 8l-2 1.5a10 10 0 0 0 4.5 4.5L15 12l4.5 1.5V16c0 1.4-1.2 2.6-2.6 2.5A14 14 0 0 1 5.5 6.1C5.4 4.7 6.5 3.5 7 3.5Z"/>',
    pin: '<path d="M12 21s6.5-6 6.5-11A6.5 6.5 0 0 0 5.5 10c0 5 6.5 11 6.5 11Z"/><circle cx="12" cy="10" r="2.4"/>',
    briefcase: '<rect x="3" y="7.5" width="18" height="12" rx="2"/><path d="M9 7.5V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v1.5"/><path d="M3 12.5h18"/>',
    calendar: '<rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
    camera: '<path d="M3.5 8.5h3.2L8.4 6h7.2l1.7 2.5h3.2a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"/><circle cx="12" cy="13.2" r="3.4"/>',
    image: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4 3.5 3 3-2.5L20 17"/>',
    chart: '<path d="M4 19V9M10 19V5M16 19v-7M21 19H3"/>',
    target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="4"/><circle cx="12" cy="12" r="0.6"/>',
    check: '<path d="M4 12.5 9 17.5 20 6.5"/>',
    warning: '<path d="M12 4.5 21 19H3Z"/><path d="M12 10v4"/><path d="M12 17h.01"/>',
    x: '<path d="M6 6l12 12M18 6 6 18"/>',
    shield: '<path d="M12 4 5 6.5V12c0 4.2 2.9 7.3 7 8.5 4.1-1.2 7-4.3 7-8.5V6.5L12 4Z"/>',
    lock: '<rect x="5.5" y="10.5" width="13" height="9" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7.5V12l3.2 2"/>',
    up: '<path d="M12 20V6"/><path d="m6.5 11.5 5.5-5.5 5.5 5.5"/>',
    logout: '<path d="M14 5H6v14h8"/><path d="M13 12h7"/><path d="M17.5 8.5 21 12l-3.5 3.5"/>',
    trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/><path d="M10 11v6M14 11v6"/>',
    refresh: '<path d="M20 11a8 8 0 0 0-14-5"/><path d="M4 13a8 8 0 0 0 14 5"/><path d="M20 5v6h-6"/><path d="M4 19v-6h6"/>',
  };

  ui.icon = function (name, cls) {
    const svg = A.utils.ICONS || null;
    return `<svg class="${cls || ''}" viewBox="0 0 24 24" aria-hidden="true">${ui.icons[name] || ''}</svg>`;
  };

  A.ui = ui;
})(window.App);
