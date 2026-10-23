/* Applied before the stylesheets so a saved night theme never flashes light first.
   The server sets a Content-Security-Policy of script-src 'self', so this cannot stay inline. */
(function () {
  var stored = null;
  try { stored = localStorage.getItem('hrms.theme'); } catch (e) {}
  var dark = stored ? stored === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
