window.App = window.App || {};

(function (A) {
  const BASE = '/api';
  let token = null;
  let refreshing = null;

  /* The access token lives in memory only; the refresh cookie is the durable half of the session. */
  function setToken(next) { token = next || null; }

  function failure(res, payload) {
    const error = payload && payload.error ? payload.error : {};
    const problem = new Error(error.message || 'The server could not complete the request');
    problem.status = res.status;
    problem.code = error.code || 'internal';
    problem.fields = error.fields || null;
    return problem;
  }

  async function read(res) {
    const text = await res.text();
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  }

  /* A 401 here means bad credentials, not an expired token, so no refresh is attempted. */
  const NO_RETRY = ['/auth/login', '/auth/refresh'];

  async function send(path, options, retried) {
    options = options || {};
    const init = {
      method: options.method || 'GET',
      credentials: 'include',
      headers: {},
    };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (options.body !== undefined) {
      if (options.raw) {
        init.body = options.body;
        if (options.fileName) init.headers['X-File-Name'] = options.fileName;
      } else {
        init.headers['Content-Type'] = 'application/json';
        init.body = JSON.stringify(options.body);
      }
    }

    const res = await fetch(`${BASE}${path}`, init);
    const authCall = NO_RETRY.indexOf(path) !== -1;
    if (res.status === 401 && !retried && !authCall) {
      const renewed = await refresh();
      if (renewed) return send(path, options, true);
      A.api.expired();
      throw await failure(res, await read(res));
    }
    if (!res.ok) throw failure(res, await read(res));
    if (options.blob) return res.blob();
    if (res.status === 204) return null;
    return read(res);
  }

  /* A single refresh call is shared by every request that raced to an expired access token. */
  function refresh() {
    if (!refreshing) {
      refreshing = send('/auth/refresh', { method: 'POST' })
        .then((payload) => {
          setToken(payload && payload.token);
          return !!payload;
        })
        .catch((error) => {
          console.warn('Session refresh failed:', error?.message || error);
          return false;
        })
        .finally(() => { refreshing = null; });
    }
    return refreshing;
  }

  A.api = {
    get token() { return token; },
    setToken,
    refresh,
    onExpired: null,
    expired() {
      token = null;
      if (A.api.onExpired) A.api.onExpired();
    },

    login(loginId, password) {
      return send('/auth/login', { method: 'POST', body: { loginId, password } }).then((payload) => {
        setToken(payload.token);
        return payload;
      });
    },
    logout() {
      return send('/auth/logout', { method: 'POST' }).finally(() => { token = null; });
    },
    me() { return send('/auth/me'); },

    get(path) { return send(path, {}); },
    post(path, body) { return send(path, { method: 'POST', body }); },
    patch(path, body) { return send(path, { method: 'PATCH', body }); },
    put(path, body) { return send(path, { method: 'PUT', body }); },
    del(path) { return send(path, { method: 'DELETE' }); },

    upload(path, file) {
      return send(path, { method: 'POST', body: file, raw: true, fileName: file.name });
    },
    /* Files are served behind the bearer token, so a download is fetched as a blob rather than linked. */
    async download(path, fileName) {
      const blob = await send(path, { blob: true });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName || 'document';
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  };
})(window.App);
