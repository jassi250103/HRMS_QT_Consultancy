window.App = window.App || {};

/* dd/mm/yyyy text input with a calendar popover; the stored value stays yyyy-mm-dd. */
(function (A) {
  const U = A.utils;

  const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

  function toDisplay(iso) {
    const d = U.parseISO(iso);
    if (!d) return '';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  /* Accepts 5/6/2001, 05.06.2001, 05-06-2001 or 2001-06-05; rejects impossible days. */
  function toIso(text) {
    const raw = String(text || '').trim();
    if (!raw) return '';
    const m = raw.match(/^(\d{1,2})[\/.\-\s](\d{1,2})[\/.\-\s](\d{2}|\d{4})$/) || raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    let day;
    let mon;
    let year;
    if (m.length === 4 && m[1].length === 4) {
      year = +m[1]; mon = +m[2]; day = +m[3];
    } else {
      day = +m[1]; mon = +m[2]; year = +m[3];
      if (year < 100) year += year > 60 ? 1900 : 2000;
    }
    const d = new Date(year, mon - 1, day, 12, 0, 0, 0);
    if (isNaN(d) || d.getFullYear() !== year || d.getMonth() !== mon - 1 || d.getDate() !== day) return null;
    return U.isoOf(d);
  }

  function gridHTML(view, selectedIso, minIso, maxIso) {
    const first = new Date(view.getFullYear(), view.getMonth(), 1, 12);
    const daysInMonth = new Date(view.getFullYear(), view.getMonth() + 1, 0).getDate();
    const lead = (first.getDay() + 6) % 7;
    const todayIso = U.todayKey();
    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="datefield__day is-void"></span>';
    for (let day = 1; day <= daysInMonth; day++) {
      const iso = U.isoOf(new Date(view.getFullYear(), view.getMonth(), day, 12));
      const off = (minIso && iso < minIso) || (maxIso && iso > maxIso);
      cells += `<button type="button" class="datefield__day${iso === selectedIso ? ' is-sel' : ''}${iso === todayIso ? ' is-today' : ''}" data-iso="${iso}"${off ? ' disabled' : ''}>${day}</button>`;
    }
    return `<div class="datefield__dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div><div class="datefield__grid">${cells}</div>`;
  }

  A.DateField = function (cfg) {
    const mount = typeof cfg.mount === 'string' ? U.by(cfg.mount) : cfg.mount;
    if (!mount) return null;

    let value = U.dateKey(cfg.value || '');
    let minIso = cfg.min || '';
    let maxIso = cfg.max || '';
    let view = U.parseISO(value) || new Date();

    mount.classList.add('datefield');
    mount.innerHTML = `<input class="control" type="text" id="${U.esc(cfg.id || '')}" inputmode="numeric" autocomplete="off" placeholder="dd/mm/yyyy" aria-label="${U.esc(cfg.label || 'Date')}" />
      <button type="button" class="datefield__btn" aria-label="Open calendar" aria-expanded="false"><svg viewBox="0 0 24 24">${A.ui.icons.calendar}</svg></button>
      <div class="datefield__panel" hidden></div>`;

    const input = mount.querySelector('input');
    const btn = mount.querySelector('.datefield__btn');
    const panel = mount.querySelector('.datefield__panel');

    function syncText() {
      input.value = toDisplay(value);
    }

    function emit() {
      if (cfg.onChange) cfg.onChange(value);
      mount.dispatchEvent(new CustomEvent('change', { bubbles: true }));
    }

    function panelHTML() {
      return `<div class="datefield__head">
        <button type="button" class="datefield__nav" data-nav="-12" aria-label="Previous year">«</button>
        <button type="button" class="datefield__nav" data-nav="-1" aria-label="Previous month">‹</button>
        <strong class="datefield__month">${U.monthLabel(view)}</strong>
        <button type="button" class="datefield__nav" data-nav="1" aria-label="Next month">›</button>
        <button type="button" class="datefield__nav" data-nav="12" aria-label="Next year">»</button>
      </div>${gridHTML(view, value, minIso, maxIso)}`;
    }

    function paint() {
      panel.innerHTML = panelHTML();
    }

    function open() {
      view = U.parseISO(value) || new Date();
      paint();
      panel.hidden = false;
      panel.style.left = '';
      panel.style.right = '';
      mount.classList.add('is-open');
      btn.setAttribute('aria-expanded', 'true');
      fitWithinViewport();
      document.addEventListener('mousedown', outside, true);
    }

    /* Keep the popover inside the viewport when the field sits near an edge. */
    function fitWithinViewport() {
      const rect = panel.getBoundingClientRect();
      const margin = 8;
      const overRight = rect.right - (window.innerWidth - margin);
      const overLeft = margin - rect.left;
      if (overRight > 0) {
        const shift = Math.min(overRight, rect.width - margin);
        panel.style.left = `${-shift}px`;
        panel.style.right = 'auto';
      } else if (overLeft > 0) {
        panel.style.left = `${overLeft}px`;
        panel.style.right = 'auto';
      }
    }

    function close() {
      panel.hidden = true;
      mount.classList.remove('is-open');
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('mousedown', outside, true);
    }

    function outside(ev) {
      if (!mount.contains(ev.target)) close();
    }

    function setIso(next, fromUser) {
      if (next && ((minIso && next < minIso) || (maxIso && next > maxIso))) { syncText(); return; }
      value = next || '';
      syncText();
      if (!panel.hidden) paint();
      if (fromUser) emit();
    }

    btn.addEventListener('click', () => (panel.hidden ? open() : close()));
    input.addEventListener('focus', () => input.select());

    U.delegate(panel, 'click', '[data-nav]', (ev, b) => {
      view = new Date(view.getFullYear(), view.getMonth() + Number(b.dataset.nav), 1, 12);
      paint();
    });

    U.delegate(panel, 'click', '.datefield__day:not(.is-void)', (ev, b) => {
      if (b.disabled) return;
      setIso(b.dataset.iso, true);
      close();
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape') { close(); return; }
      if (ev.key !== 'Enter') return;
      ev.preventDefault();
      commitTyped();
      close();
    });

    function commitTyped() {
      if (!input.value.trim()) { setIso('', true); return; }
      const next = toIso(input.value);
      if (next === null) { syncText(); return; }
      setIso(next, true);
    }

    input.addEventListener('blur', commitTyped);

    /* Digits only, auto-slashed: 05062001 -> 05/06/2001 */
    input.addEventListener('input', () => {
      const digits = input.value.replace(/\D/g, '').slice(0, 8);
      let out = digits.slice(0, 2);
      if (digits.length > 2) out += '/' + digits.slice(2, 4);
      if (digits.length > 4) out += '/' + digits.slice(4, 8);
      if (out !== input.value) input.value = out;
    });

    mount.addEventListener('keydown', (ev) => {
      if (ev.key === 'Escape' && !panel.hidden) close();
    });

    syncText();

    const api = {
      element: mount,
      get value() { return value; },
      setValue(next) { setIso(U.dateKey(next || ''), false); },
      setMin(next) { minIso = next || ''; },
      setMax(next) { maxIso = next || ''; },
      close,
    };
    mount.dateField = api;
    input.dateField = api;
    return api;
  };

  /* Call sites that read a plain element id can go through these. */
  A.DateField.valueOf = function (id) {
    const node = U.by(id);
    if (node && node.dateField) return node.dateField.value;
    return node ? String(node.value || '').trim() : '';
  };

  A.DateField.toDisplay = toDisplay;
  A.DateField.toIso = toIso;
})(window.App);
