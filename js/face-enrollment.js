window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;

  let videoStream = null;
  let enrollmentStatus = null;
  let live = null;

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function setFaceStatus(state) {
    const cam = U.by('facecam');
    if (!cam) return;
    cam.classList.remove('is-searching', 'is-hold', 'is-perfect', 'is-captured');
    if (state === 'searching' || state === 'starting') cam.classList.add('is-searching');
    else if (state === 'hold' || state === 'tooFar' || state === 'tooClose' || state === 'offCenter') cam.classList.add('is-hold');
    else if (state === 'perfect') cam.classList.add('is-perfect');
    else if (state === 'captured') cam.classList.add('is-captured');
  }

  async function startCamera() {
    try {
      const loaded = await A.faceDetector.loadModels();
      if (!loaded) {
        A.ui.toast('error', 'Face detection not available', 'Please refresh the page and try again.');
        return;
      }

      const video = U.by('faceVideo');
      await A.faceDetector.startWebcam(video);

      U.by('facecam').classList.add('is-live');
      U.by('startCameraBtn').disabled = true;
      U.by('captureBtn').disabled = false;

      live = A.faceDetector.createLiveCapture({
        video,
        canvas: U.by('faceOverlay'),
        onStatus: (state) => setFaceStatus(state),
        onSample: (count, total) => { U.by('faceStatus').textContent = `Captured ${count} of ${total} — keep holding still`; },
        onCaptured: (result) => onCaptured(result),
        autoCapture: true,
        samples: 3,
      });
      live.start();
    } catch (error) {
      A.ui.toast('error', 'Camera access denied', 'Please allow camera access to enroll your face.');
    }
  }

  function manualCapture() {
    if (live && live.snap()) return;
    A.ui.toast('info', 'Line your face up', 'Center your face in the oval and wait for the outline to appear.');
  }

  // Return the capture UI to its pre-capture state so the user can retry.
  // Used when enrollment is rejected (e.g. a sample's confidence was too low).
  function resetCaptureUi(message) {
    if (live) { live.stop(); live = null; }
    A.faceDetector.stopWebcam();
    window._faceSamples = null;

    const cam = U.by('facecam');
    if (cam) cam.classList.remove('is-live', 'is-searching', 'is-hold', 'is-perfect', 'is-captured');

    const startBtn = U.by('startCameraBtn');
    if (startBtn) startBtn.disabled = false;

    const captureBtn = U.by('captureBtn');
    if (captureBtn) { captureBtn.disabled = true; captureBtn.innerHTML = `${icon('image')} Capture Now`; }

    const enrollBtn = U.by('enrollBtn');
    if (enrollBtn) { enrollBtn.style.display = 'none'; enrollBtn.disabled = false; enrollBtn.innerHTML = `${icon('check')} Enroll (One-Time Only)`; }

    const status = U.by('faceStatus');
    if (status) status.textContent = message || 'Press "Start Camera" to begin.';
  }

  function onCaptured(result) {
    if (live) { live.stop(); live = null; }
    A.faceDetector.stopWebcam();

    U.by('facecam').classList.remove('is-searching', 'is-hold', 'is-perfect');
    U.by('facecam').classList.add('is-captured');
    U.by('faceStatus').textContent = `Captured ${result.descriptors.length} face samples`;

    window._faceSamples = result.descriptors;

    const captureBtn = U.by('captureBtn');
    captureBtn.disabled = true;
    captureBtn.textContent = 'Face Captured ✓';
    U.by('enrollBtn').style.display = 'inline-block';
    A.ui.toast('success', 'Face captured', `Captured ${result.descriptors.length} samples. Press Enroll to save.`);
  }

  function pageContent() {
    const enrolled = enrollmentStatus && enrollmentStatus.enrolled;
    const enrolledDate = enrolled ? U.fmtDate(enrollmentStatus.enrolledAt) : 'Not enrolled';

    return `<div class="form-page">
      <div class="page-head">
        <div class="page-head__text">
          <p>Register your face for biometric attendance verification. Your face is converted into a numeric face signature (not a photo) and stored securely on the server.</p>
        </div>
      </div>

      <div class="stat-grid stat-grid--one">
        <article class="stat stat--bar" style="--accent:${enrolled ? 'var(--success)' : 'var(--warning)'}">
          <span class="stat__icon">${icon(enrolled ? 'check' : 'clock')}</span>
          <span class="stat__label">Enrollment status</span>
          <span class="stat__sep"></span>
          <p class="stat__value">${enrolled ? 'Enrolled' : 'Not enrolled'}</p>
          <p class="stat__meta">${enrolledDate}</p>
        </article>
      </div>

      <section class="card">
        <div class="card__head">
          <div>
            <h3 class="card__title">${enrolled ? 'Re-enroll Face' : 'Enroll Face'}</h3>
            <p class="card__sub">${enrolled ? 'Update your face template with a new image.' : 'Capture your face to enable biometric attendance marking.'}</p>
          </div>
        </div>
        <div class="card__body">
          <div class="alert alert--info" style="margin-bottom:16px">
            <div class="alert__body">
              <strong>🔒 One-Time Security Enrollment:</strong>
              <ul style="margin-top:8px;padding-left:20px">
                <li>Face enrollment is permanent and cannot be changed by you</li>
                <li>This prevents proxy attendance - only YOU can mark your attendance</li>
                <li>Allow camera access when prompted</li>
                <li>Center your face inside the oval and follow the on-screen tips</li>
                <li>Your photo is captured automatically once your face is steady</li>
                <li><strong>Contact HR admin if appearance changes require re-enrollment</strong></li>
              </ul>
            </div>
          </div>

          <div class="facecam" id="facecam">
            <div class="facecam__stage">
              <video id="faceVideo" autoplay playsinline muted></video>
              <canvas id="faceOverlay"></canvas>
              <div class="facecam__mask"></div>
              <div class="facecam__ring"></div>
            </div>
            <p class="facecam__status" id="faceStatus">Press "Start Camera" to begin.</p>
          </div>

          <div class="btn-row" style="margin-top:16px">
            <button class="btn btn--primary" type="button" id="startCameraBtn">${icon('camera')} Start Camera</button>
            <button class="btn" type="button" id="captureBtn" disabled>${icon('image')} Capture Now</button>
            <button class="btn btn--primary" type="button" id="enrollBtn" style="display:none">${icon('check')} Enroll (One-Time Only)</button>
          </div>

          ${enrolled ? `
          <div class="alert alert--success" style="margin-top:16px">
            <div class="alert__body">
              <strong>✓ Face Already Enrolled:</strong> Your face was enrolled on ${enrolledDate}. This cannot be changed without HR admin approval for security reasons.
            </div>
          </div>
          <div class="btn-row" style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px">
            <span style="color:var(--text-secondary);font-size:0.9em">Need to re-enroll? Contact HR admin.</span>
          </div>
          ` : ''}
        </div>
      </section>
    </div>`;
  }

  async function enrollFace() {
    const samples = window._faceSamples;

    if (!samples || !samples.length) {
      A.ui.toast('error', 'No face captured', 'Please capture your face first before enrolling.');
      return;
    }

    const btn = U.by('enrollBtn');
    btn.disabled = true;
    btn.textContent = 'Enrolling...';

    try {
      await A.api.post('/face-enrollment', { descriptors: samples });
      A.ui.toast('success', 'Face enrolled', 'You can now mark attendance with face verification. This cannot be changed without HR admin approval.');

      window._faceSamples = null;

      // Reload staff master data so admins see the update immediately
      if (A.state && typeof A.state.reload === 'function') {
        await A.state.reload(['staff']);
      }

      loadStatus();
    } catch (error) {
      A.ui.toast('error', 'Enrollment failed', error.message);
      resetCaptureUi('Enrollment failed — press "Start Camera" to capture again.');
    }
  }

  async function removeEnrollment() {
    A.ui.confirm({
      title: 'Remove Face Enrollment',
      tone: 'danger',
      confirmLabel: 'Remove',
      message: 'This will delete your stored face template. You will need to re-enroll to use face verification for attendance.',
    }).then(async (yes) => {
      if (!yes) return;
      try {
        await A.api.del('/face-enrollment');
        A.ui.toast('success', 'Enrollment removed', 'Your face template has been deleted.');
        loadStatus();
      } catch (error) {
        A.ui.toast('error', 'Removal failed', error.message);
      }
    });
  }

  async function loadStatus() {
    try {
      enrollmentStatus = await A.api.get('/face-enrollment/me');
      render();
    } catch (error) {
      A.ui.toast('error', 'Failed to load status', error.message);
    }
  }

  function render() {
    if (live) { live.stop(); live = null; }
    const host = U.by('view');
    if (!host) return;
    host.innerHTML = pageContent();
    bindEvents();
  }

  function bindEvents() {
    U.by('startCameraBtn').addEventListener('click', startCamera);
    U.by('captureBtn').addEventListener('click', manualCapture);
    U.by('enrollBtn').addEventListener('click', enrollFace);
  }

  A.pages.faceEnrollment = function (container) {
    container.innerHTML = '<div class="card"><div class="card__body">Loading...</div></div>';
    loadStatus();
  };
})(window.App);
