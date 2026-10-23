window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  function field(id, label, control, hint) {
    return `<div class="field" data-field="${id}">
      <label class="field__label" for="${id}">${label} <span class="req">*</span></label>
      ${control}
      ${hint ? `<span class="field__hint">${hint}</span>` : ''}
      <span class="field__error"></span>
    </div>`;
  }

  function passwordField(id, label, hint) {
    return `<div class="field" data-field="${id}">
      <label class="field__label" for="${id}">${label} <span class="req">*</span></label>
      <div class="pw-wrap">
        <input class="control" id="${id}" type="password" autocomplete="off" />
        <button class="icon-btn icon-btn--sm pw-toggle" type="button" data-pw="${id}" aria-label="Show password" aria-pressed="false">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12S6 6.5 12 6.5 21.5 12 21.5 12 18 17.5 12 17.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="2.6"/></svg>
        </button>
      </div>
      ${hint ? `<span class="field__hint">${hint}</span>` : ''}
      <span class="field__error"></span>
    </div>`;
  }

  /* Show / hide is a display affordance only — the stored secret is never read from state. */
  function bindPasswordToggles(root) {
    root.addEventListener('click', (ev) => {
      const btn = ev.target.closest('[data-pw]');
      if (!btn) return;
      const input = U.by(btn.dataset.pw);
      const shown = input.type === 'text';
      input.type = shown ? 'password' : 'text';
      btn.setAttribute('aria-pressed', String(!shown));
      btn.setAttribute('aria-label', shown ? 'Show password' : 'Hide password');
    });
  }

  function brandHTML() {
    return `<div class="gate__brand">
      <img class="brand-logo brand-logo--gate" src="img/qt-consultancy.jpeg" alt="" width="40" height="40" />
      <span class="brand-text"><strong>QT Consultancy</strong><small>HRMS · Recruitment portal</small></span>
    </div>`;
  }

  /* ---------- Sign in ---------- */
  pages.login = function (container) {
    container.innerHTML = `<div class="gate">
      ${brandHTML()}
      <section class="card gate__card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Sign in</h3>
            <p class="card__sub">Use the login ID issued by the HR Admin.</p>
          </div>
        </div>
        <div class="card__body">
          <form id="loginForm" class="stack-form" novalidate>
            ${field('loginId', 'Login ID', '<input class="control" id="loginId" type="text" autocomplete="username" data-autofocus placeholder="ananya.rao" />')}
            ${passwordField('loginPw', 'Password', '')}
            <button class="btn btn--primary btn--block" type="submit" id="loginSubmit">Sign in</button>
            <p class="gate__help">Forgotten password? The HR Admin can reset it and issue a temporary one.</p>
          </form>
        </div>
      </section>
    </div>`;

    const form = U.by('loginForm');
    const submit = U.by('loginSubmit');
    bindPasswordToggles(form);

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      A.ui.clearErrors(form);
      const idField = U.by('loginId').closest('.field');
      const pwField = U.by('loginPw').closest('.field');
      const loginId = U.by('loginId').value.trim();
      const password = U.by('loginPw').value;
      if (!loginId) {
        A.ui.error(idField, 'Enter your login ID');
        return;
      }
      if (!password) {
        A.ui.error(pwField, 'Enter your password');
        return;
      }

      submit.disabled = true;
      S.login(loginId, password).then((result) => {
        submit.disabled = false;
        U.by('loginPw').value = '';
        A.ui.toast('success', 'Signed in', `${result.user.name} · ${result.user.employeeId}`);
        A.router('#/dashboard');
      }).catch((error) => {
        submit.disabled = false;
        const message = error.message || 'Sign in failed';
        // The server names the field it rejected; a wrong password is reported against the password.
        const where = error.fields && error.fields.loginId ? idField : pwField;
        A.ui.error(where, message);
        A.ui.toast('error', 'Sign in failed', message);
      });
    });

    return Promise.resolve();
  };

  /* ---------- Password forms ---------- */
  function passwordFormHTML(intro) {
    const min = S.policy().passwordMinLength;
    return `<form id="pwForm" class="stack-form" novalidate>
      ${intro}
      ${passwordField('pwCurrent', 'Current password', '')}
      ${passwordField('pwNext', 'New password', `At least ${min} characters, with a letter and a number.`)}
      ${passwordField('pwConfirm', 'Confirm new password', '')}
      <button class="btn btn--primary" type="submit">Save password</button>
    </form>`;
  }

  function bindPasswordForm(form, afterSave) {
    const submit = form.querySelector('button[type="submit"]');
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      A.ui.clearErrors(form);
      const current = U.by('pwCurrent').value;
      const next = U.by('pwNext').value;
      const confirm = U.by('pwConfirm').value;
      const show = (result) => {
        const input = result.field === 'current' ? 'pwCurrent' : result.field === 'confirm' ? 'pwConfirm' : 'pwNext';
        A.ui.error(U.by(input).closest('.field'), result.error);
        A.ui.toast('error', 'Password not changed', result.error);
      };
      // Client-side rules run first so an obvious mistake never reaches the server.
      const problem = localCheck(next, confirm);
      if (problem) {
        show(problem);
        return;
      }
      submit.disabled = true;
      S.changePassword(current, next, confirm).then((result) => {
        submit.disabled = false;
        if (result.error) {
          show(result);
          return;
        }
        form.reset();
        A.ui.toast('success', 'Password changed', 'Use the new password the next time you sign in.');
        afterSave();
      });
    });
  }

  function localCheck(next, confirm) {
    if (!next || next !== confirm) return { field: 'confirm', error: 'The two new passwords do not match' };
    const problem = S.passwordProblems(next);
    if (problem) return { field: 'next', error: problem };
    return null;
  }

  /* Shown instead of the workspace until a temporary password is replaced. */
  pages.forceChange = function (container) {
    const r = S.user();
    container.innerHTML = `<div class="gate">
      ${brandHTML()}
      <section class="card gate__card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Set a new password</h3>
            <p class="card__sub">${U.esc(r.name)}, this account is still using a temporary password.</p>
          </div>
        </div>
        <div class="card__body">
          ${passwordFormHTML('<div class="alert alert--warning" style="margin-bottom:14px"><div class="alert__body"><strong>Change required</strong><p>The HR Admin issued this login. Pick your own password before the workspace opens.</p></div></div>')}
          <p class="gate__help"><a href="#/login" id="cancelLogin">Back to sign in</a></p>
        </div>
      </section>
    </div>`;

    const form = U.by('pwForm');
    bindPasswordToggles(form);
    U.by('cancelLogin').addEventListener('click', () => S.logout());
    bindPasswordForm(form, () => A.router('#/dashboard'));
    return Promise.resolve();
  };

  /* ---------- Account ---------- */
  pages.account = function (container) {
    const r = S.user();
    const account = S.accountOf(r.id);

    container.innerHTML = `<div class="stack">
      <div class="page-head">
        <div class="page-head__text">
          <h2>Account</h2>
          <p>Sign-in details for ${U.esc(r.name)} · ${U.esc(r.employeeId)}.</p>
        </div>
      </div>

      <section class="card">
        <div class="card__head"><div><h3 class="card__title">Sign-in</h3><p class="card__sub">Issued and reset by the HR Admin.</p></div></div>
        <div class="card__body">
          ${account ? `<div class="detail-grid">
            <div class="detail-item"><p class="detail-item__label">Login ID</p><p class="detail-item__value">${U.esc(account.loginId)}</p></div>
            <div class="detail-item"><p class="detail-item__label">Status</p><p class="detail-item__value">${account.locked ? 'Locked' : 'Active'}</p></div>
            <div class="detail-item"><p class="detail-item__label">Created</p><p class="detail-item__value">${U.fmtDate(account.createdOn)}</p></div>
            <div class="detail-item"><p class="detail-item__label">Created by</p><p class="detail-item__value">${U.esc(account.createdBy)}</p></div>
            <div class="detail-item"><p class="detail-item__label">Last sign-in</p><p class="detail-item__value">${account.lastLogin ? U.fmtDate(account.lastLogin) : 'Never'}</p></div>
            <div class="detail-item"><p class="detail-item__label">Password</p><p class="detail-item__value">${account.mustChange ? 'Temporary, change required' : 'Set by you'}</p></div>
          </div>` : `<div class="empty">
            <span class="empty__icon"><svg viewBox="0 0 24 24">${A.ui.icons.lock}</svg></span>
            <h3>No login created</h3>
            <p>Ask the HR Admin to create your portal login from Internal Staff.</p>
          </div>`}
        </div>
      </section>

      ${account ? `<section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">Change password</h3>
            <p class="card__sub">Enter the current password, then the new one twice.</p>
          </div>
        </div>
        <div class="card__body">${passwordFormHTML('')}</div>
      </section>` : ''}
    </div>`;

    const form = U.by('pwForm');
    if (form) {
      bindPasswordToggles(form);
      bindPasswordForm(form, () => pages.account(container));
    }
    return Promise.resolve();
  };
})(window.App);
