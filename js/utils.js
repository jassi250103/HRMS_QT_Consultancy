window.App = window.App || {};

(function (A) {
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  function esc(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function todayKey() {
    const d = new Date();
    return isoOf(d);
  }

  function isoOf(date) {
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${date.getFullYear()}-${m}-${day}`;
  }

  function daysAgo(n) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return isoOf(d);
  }

  function parseISO(value) {
    if (!value) return null;
    const parts = dateKey(value).split('-').map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return null;
    return new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0, 0);
  }

  // A timestamp from the API is an instant; a day is read in the browser's own calendar.
  function dateKey(value) {
    if (!value) return '';
    const text = String(value);
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
    const d = new Date(text);
    return isNaN(d) ? '' : isoOf(d);
  }

  // "14/03/2026"
  function fmtDate(value) {
    const d = parseISO(value);
    if (!d) return '—';
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  }

  // "14/03/2026, 04:20 PM"
  function fmtDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (isNaN(d)) return '—';
    const h = d.getHours();
    const suffix = h >= 12 ? 'PM' : 'AM';
    const h12 = String(((h + 11) % 12) + 1).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}, ${h12}:${min} ${suffix}`;
  }

  // "October 2026"
  function monthLabel(date) {
    const d = date || new Date();
    return `${MONTHS_LONG[d.getMonth()]} ${d.getFullYear()}`;
  }

  function initials(name) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
  }

  function fmtBytes(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function daysBetween(fromISO, toISO) {
    const a = parseISO(fromISO);
    const b = parseISO(toISO);
    if (!a || !b) return null;
    return Math.round((b - a) / 86400000);
  }

  function debounce(fn, wait) {
    let timer = null;
    return function () {
      const args = arguments;
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(null, args), wait || 180);
    };
  }

  function uid(prefix) {
    return `${prefix || 'id'}-${Math.random().toString(36).slice(2, 9)}`;
  }

  // Simulated round-trip so loading states are demonstrable
  function delay(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function by(value) {
    return document.getElementById(value);
  }

  function on(node, event, handler, options) {
    if (node) node.addEventListener(event, handler, options);
  }

  // Delegated listener: closestTarget('click', '.selector', fn)
  function delegate(root, event, selector, handler) {
    if (!root) return;
    root.addEventListener(event, function (ev) {
      const target = ev.target.closest(selector);
      if (target && root.contains(target)) handler(ev, target);
    });
  }

  A.utils = {
    MONTHS,
    esc,
    by,
    on,
    delegate,
    uid,
    delay,
    debounce,
    initials,
    fmtBytes,
    fmtDate,
    fmtDateTime,
    daysBetween,
    daysAgo,
    isoOf,
    parseISO,
    dateKey,
    monthLabel,
    todayKey,
  };
})(window.App);
