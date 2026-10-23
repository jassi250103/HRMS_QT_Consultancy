window.App = window.App || {};

(function (A) {
  const U = A.utils;
  const S = A.state;
  const pages = (A.pages = A.pages || {});

  // Pagination state
  let currentPage = 1;
  let PAGE_SIZE = 25;
  let currentPagination = null;
  let pageItems = null;
  let myServerTotal = null;

  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /* Managers land on their own marks; the approval queue is one tab away. */
  let tab = 'my';

  function icon(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${A.ui.icons[name]}</svg>`;
  }

  function statCard(opts) {
    return `<article class="stat" style="--accent:${opts.color}">
      <div class="stat__top">
        <span class="stat__label">${opts.label}</span>
        <span class="stat__icon">${icon(opts.icon)}</span>
      </div>
      <p class="stat__value">${opts.value}</p>
      <p class="stat__meta">${opts.meta}</p>
    </article>`;
  }

  function statusBadge(status) {
    if (status === 'Present') return '<span class="badge badge--active"><i></i>Present</span>';
    if (status === 'Absent') return '<span class="badge badge--inactive"><i></i>Absent</span>';
    if (status === 'Leave') return '<span class="badge badge--info"><i></i>Leave</span>';
    return '<span class="badge badge--neutral"><i></i>Not marked</span>';
  }

  function approvalBadge(state) {
    if (state === 'Accepted') return '<span class="badge badge--active"><i></i>Accepted</span>';
    if (state === 'Rejected') return '<span class="badge badge--inactive"><i></i>Rejected</span>';
    return '<span class="badge badge--brand"><i></i>Pending</span>';
  }

  function dateCell(day, lateAfter) {
    const isToday = day.date === U.todayKey();
    const weekday = DAYS[U.parseISO(day.date).getDay()];
    const sub = isToday ? `${weekday} · today` : weekday;
    let time = '—';
    if (day.login) {
      const late = day.status === 'Present' && day.login > lateAfter;
      time = `${day.login}${late ? '<span class="att-flag">Late</span>' : ''}`;
    }
    return { main: U.fmtDate(day.date), sub, time };
  }

  /* A manager decides on the day; anyone else only reads who holds the decision. */
  function decisionCell(day) {
    if (day.status === 'Not marked' && !day.approval) return '<span class="cell-muted">Not marked</span>';
    if (day.approval !== 'Pending') {
      return `<span class="cell-muted">${approvalBadge(day.approval)}${day.decidedBy ? `<span class="cell-sub">${U.esc(day.decidedBy)}</span>` : ''}</span>`;
    }
    if (!S.canDecide(day.ownerId)) {
      return `<span class="cell-muted">With ${U.esc(S.approverName(day.ownerId))}</span>`;
    }
    return `<div class="btn-row">
      <button class="btn btn--sm" type="button" data-accept-day="${U.esc(day.ownerId)}|${day.date}">${icon('check')} Accept</button>
      <button class="btn btn--sm btn--danger" type="button" data-reject-day="${U.esc(day.ownerId)}|${day.date}">${icon('x')} Reject</button>
    </div>`;
  }

  function rowHTML(day, lateAfter, withOwner) {
    const c = dateCell(day, lateAfter);
    const isToday = day.date === U.todayKey();
    return `<tr${isToday ? ' class="att-row--today"' : ''}>
      <td>${c.main}<span class="cell-sub${isToday ? ' cell-sub--now' : ''}">${c.sub}</span></td>
      ${withOwner ? `<td>${U.esc(S.ownerName(day.ownerId))}</td>` : ''}
      <td>${statusBadge(day.status)}</td>
      <td class="cell-num">${c.time}</td>
      <td>${decisionCell(day)}</td>
    </tr>`;
  }

  function head(withOwner) {
    return `<tr>
      <th scope="col">Date</th>
      ${withOwner ? '<th scope="col">Recruiter</th>' : ''}
      <th scope="col">Status</th>
      <th scope="col">Time of Login</th>
      <th scope="col">Decision</th>
    </tr>`;
  }

  function bodyHTML(days, lateAfter, withOwner) {
    if (!days.length) {
      return `<tr><td colspan="${withOwner ? 5 : 4}"><div class="empty">
        <span class="empty__icon">${icon('calendar')}</span>
        <h3>No attendance records</h3>
        <p>Marks appear here once a working day is recorded.</p>
      </div></td></tr>`;
    }
    return days.map((d) => rowHTML(d, lateAfter, withOwner)).join('');
  }

  function content() {
    const manager = S.hasTeam();
    const onTeam = manager && tab === 'team';
    const days = pageItems || (onTeam ? S.attendanceLog() : S.myAttendanceLog());
    const totalDays = currentPagination ? currentPagination.total : days.length;
    const s = S.attendanceStats(onTeam ? S.reportAttendance() : S.attendanceDays());
    const today = S.todayRecord();
    const markedToday = today && today.status !== 'Not marked';
    const queue = S.pendingAttendance().length;

    const own = `${s.marked} of ${s.total} working days marked. ${
      markedToday ? `Today marked ${today.status}${today.login ? ` at ${today.login}` : ''}.` : 'Today is not marked yet.'
    } Sundays are roster-off.`;
    const intro = onTeam
      ? `${s.marked} of ${s.total} team working days marked · ${queue} mark${queue === 1 ? '' : 's'} waiting on your decision.`
      : manager && queue
        ? `${own} ${queue} recruiter mark${queue === 1 ? '' : 's'} waiting on you.`
        : own;

    const listSub = onTeam
      ? 'Recruiter marks, newest first · rejecting a day leaves it Absent until it is re-marked.'
      : `Your marks, newest first · decisions are made by ${U.esc(S.approverName())}.`;

    return `<div class="page-head">
      <div class="page-head__text">
        <h2>Attendance</h2>
        <p>${intro}</p>
      </div>
      <div class="page-head__actions">
        <button class="btn btn--primary" type="button" id="markAttBtn">${icon('check')} Mark Attendance</button>
      </div>
    </div>
    ${manager ? tabsBar() : ''}

    <div class="stat-grid">
      ${statCard({ label: onTeam ? 'Team Days Present' : 'Days Present', value: s.present, icon: 'check', color: 'var(--success)', meta: `${s.onTime} on time, ${s.late} late` })}
      ${statCard({ label: onTeam ? 'Team Days Absent' : 'Days Absent', value: s.absent, icon: 'x', color: 'var(--danger)', meta: 'No login recorded' })}
      ${statCard({ label: 'On Leave', value: s.leave, icon: 'calendar', color: 'var(--info)', meta: 'Approved leave' })}
      ${onTeam
        ? statCard({ label: 'Awaiting Decision', value: queue, icon: 'clock', color: 'var(--warning)', meta: 'Marks from your recruiters' })
        : statCard({ label: 'Late Check-ins', value: s.late, icon: 'clock', color: 'var(--warning)', meta: `Login after ${s.lateAfter}` })}
    </div>

    <section class="card">
      <div class="card__head">
        <div>
          <h3 class="card__title">${onTeam ? 'Team attendance' : 'Attendance log'}<span class="count-pill">${totalDays}</span></h3>
          <p class="card__sub">${listSub}</p>
        </div>
        <div style="display:flex;align-items:center;gap:12px">
          <label for="pageSizeSelect" style="font-size:0.875rem;color:var(--muted)">Rows per page:</label>
          <select id="pageSizeSelect" class="control control--sm" style="width:auto">
            <option value="10"${PAGE_SIZE === 10 ? ' selected' : ''}>10</option>
            <option value="15"${PAGE_SIZE === 15 ? ' selected' : ''}>15</option>
            <option value="20"${PAGE_SIZE === 20 ? ' selected' : ''}>20</option>
            <option value="25"${PAGE_SIZE === 25 ? ' selected' : ''}>25</option>
          </select>
        </div>
      </div>
      <div class="card__body card__body--flush">
        <div class="table-wrap">
          <table class="data-table data-table--compact">
            <thead>${head(onTeam)}</thead>
            <tbody id="attRows">${bodyHTML(days, s.lateAfter, onTeam)}</tbody>
          </table>
        </div>
      </div>
      ${A.pagination && currentPagination ? A.pagination.render(currentPagination, (page) => {
        currentPage = page;
        loadAndRender();
      }) : ''}
    </section>`;
  }

  function tabsBar() {
    const items = [
      { key: 'my', label: 'My attendance', count: myServerTotal === null ? S.myAttendanceLog().length : myServerTotal },
      { key: 'team', label: 'Team approvals', count: S.pendingAttendance().length },
    ];
    return `<div class="tabs" role="tablist" aria-label="Attendance views">
      ${items.map((t) => `<button class="tab${tab === t.key ? ' is-on' : ''}" type="button" role="tab"
        aria-selected="${tab === t.key}" data-tab="${t.key}">${t.label}<span class="tab__count">${t.count}</span></button>`).join('')}
    </div>`;
  }

  /* ---------- Mark attendance with geofence and face verification ---------- */
  let videoStream = null;
  let capturedFaceDescriptor = null; // Store descriptor instead of image
  let currentLocation = null;
  let enrollmentStatus = null;
  let attLive = null;

  function setAttFaceStatus(state) {
    const cam = U.by('faceCaptureHost');
    if (!cam) return;
    cam.classList.remove('is-searching', 'is-hold', 'is-perfect', 'is-captured');
    if (state === 'searching' || state === 'starting') cam.classList.add('is-searching');
    else if (state === 'hold' || state === 'tooFar' || state === 'tooClose' || state === 'offCenter') cam.classList.add('is-hold');
    else if (state === 'perfect') cam.classList.add('is-perfect');
    else if (state === 'captured') cam.classList.add('is-captured');
  }

  async function checkEnrollmentStatus() {
    try {
      enrollmentStatus = await A.api.get('/face-enrollment/me');
    } catch (error) {
      enrollmentStatus = { enrolled: false };
    }
  }

  async function openMarkModal(onSaved) {
    await checkEnrollmentStatus();

    const record = S.todayRecord();
    const lateAfter = S.attendanceStats(S.attendanceDays()).lateAfter;
    const already = record && record.status !== 'Not marked';
    const policy = S.policy();
    const hasGeofence = policy.officeLatitude && policy.officeLongitude;
    const hasFaceEnrolled = enrollmentStatus && enrollmentStatus.enrolled;
    
    // Debug: log policy and location status

    // Reset state on each open
    capturedFaceDescriptor = null;
    currentLocation = null;
    if (attLive) { attLive.stop(); attLive = null; }

    // Reset face capture controls
    const startBtn = U.by('startAttCameraBtn');
    if (startBtn) {
      startBtn.disabled = false;
      startBtn.innerHTML = `${icon('camera')} Start Camera`;
      startBtn.onclick = startAttCamera;
    }
    const capBtn = U.by('attCaptureBtn');
    if (capBtn) { capBtn.style.display = 'none'; capBtn.disabled = false; capBtn.textContent = 'Capture Now'; }
    const camHost = U.by('faceCaptureHost');
    if (camHost) camHost.classList.remove('is-live', 'is-searching', 'is-hold', 'is-perfect', 'is-captured');
    const attStatus = U.by('attFaceStatus');
    if (attStatus) attStatus.textContent = 'Press "Start Camera" to verify your face.';

    const body = `<p>${already
      ? `Today is already marked <strong>${U.esc(record.status)}</strong>${record.login ? ` at ${U.esc(record.login)}` : ''}. Saving replaces that mark. A login after ${lateAfter} goes to ${U.esc(S.approverName())} for approval.`
      : `Marking attendance for today. A login after ${lateAfter} is sent to ${U.esc(S.approverName())} for approval; an on-time mark needs no approval.`}</p>

      ${hasGeofence ? `
      <div class="alert alert--info" style="margin:12px 0">
        <div class="alert__body">
          <strong>📍 Office Location Required:</strong> You must be within ${policy.geofenceRadiusMeters || 100}m of the office to mark attendance.
          ${currentLocation ? `<br><span style="color:var(--success)">✓ Location verified - ${currentLocation.distance}m from office</span>` : '<br><button class="btn btn--sm" type="button" id="getLocationBtn" style="margin-top:8px">📍 Verify My Location</button>'}
        </div>
      </div>
      ` : `
      <div class="alert alert--warning" style="margin:12px 0">
        <div class="alert__body">
          <strong>⚠️ Office Location Not Configured:</strong> Contact HR admin to set up office geofence for location-based attendance.
        </div>
      </div>
      `}

      ${hasFaceEnrolled ? `
      <div class="field" style="margin-top:14px">
        <label class="field__label">Face Verification <span class="req">*</span></label>
        <div id="faceCaptureHost" class="facecam">
          <div class="facecam__stage">
            <video id="attVideo" autoplay playsinline muted></video>
            <canvas id="attOverlay"></canvas>
            <div class="facecam__mask"></div>
            <div class="facecam__ring"></div>
          </div>
          <p class="facecam__status" id="attFaceStatus">Press "Start Camera" to verify your face.</p>
        </div>
        <div class="btn-row" style="margin-top:8px">
          <button class="btn btn--sm" type="button" id="startAttCameraBtn">${icon('camera')} Start Camera</button>
          <button class="btn btn--sm" type="button" id="attCaptureBtn" style="display:none">${icon('image')} Capture Now</button>
        </div>
        <span class="field__hint">Your face will be verified against your enrolled template. This prevents proxy attendance.</span>
        <span class="field__error"></span>
      </div>
      ` : `
      <div class="alert alert--danger" style="margin:12px 0">
        <div class="alert__body">
          <strong>🔒 Face Enrollment Required:</strong> You must enroll your face before marking attendance. <a href="#/face-enrollment" style="color:var(--brand);text-decoration:underline;font-weight:bold">Enroll Now →</a>
        </div>
      </div>
      `}

      <div class="field" style="margin:14px 0">
        <label class="field__label" for="attStatus">Status <span class="req">*</span></label>
        <select class="control" id="attStatus" data-autofocus>
          <option value="present"${already && record.status === 'Present' ? ' selected' : ''}>Present</option>
        </select>
        <span class="field__hint">Absent and Leave are auto-filled based on leave applications or marked absence.</span>
        <span class="field__error"></span>
      </div>
      <div class="field">
        <label class="field__label" for="attLogin">Time of Login <span class="req">*</span></label>
        <input class="control" id="attLogin" type="time" value="${already && record.login ? U.esc(record.login) : '09:15'}" min="06:00" max="23:59" />
        <span class="field__hint">Applies to Present only. Check-ins after ${lateAfter} are flagged as late.</span>
        <span class="field__error"></span>
      </div>`;

    A.ui.modal({
      title: 'Mark Attendance',
      body,
      compact: false,
      actions: [
        { label: 'Cancel', onClick: (m) => { stopAttCamera(); m.close(); } },
        {
          label: 'Save',
          variant: 'primary',
          onClick: (m) => {
            const loginField = U.by('attLogin').closest('.field');
            const status = 'present'; // Always present when manually marking
            const login = U.by('attLogin').value;
            loginField.classList.remove('has-error');

            if (!login) {
              A.ui.error(loginField, 'Enter the login time');
              A.ui.toast('error', 'Login time required', 'Present days need a login time.');
              return;
            }
            if (hasGeofence && !currentLocation) {
              A.ui.toast('error', 'Location required', 'You must verify your location is within office premises before marking attendance.');
              return;
            }
            if (hasFaceEnrolled && !capturedFaceDescriptor) {
              A.ui.toast('error', 'Face verification required', 'Face capture is mandatory to prevent proxy attendance. Please capture your face.');
              return;
            }
            if (!hasFaceEnrolled) {
              A.ui.toast('error', 'Face enrollment required', 'You must enroll your face before marking attendance. Go to Face Enrollment page.');
              return;
            }

            // Validate that attendance is being marked for today only
            const today = U.todayKey();
            // Attendance is always marked for today in this modal
            // No need to check payload.workDate as it doesn't exist here

            // Check if already marked today (unless this is replacing an existing mark)
            if (already && status === record.status && login === record.login) {
              A.ui.toast('warning', 'Already marked', `Today is already marked as ${status} at ${login}. Make a different selection to update.`);
              return;
            }

            // Validate face capture before proceeding
            if (!capturedFaceDescriptor) {
              A.ui.toast('error', 'Face verification required', 'Please click "Capture Face" and verify your identity before saving.');
              return;
            }

            // Validate location if geofence is configured
            if (hasGeofence && !currentLocation) {
              A.ui.toast('error', 'Location verification required', 'Please wait for location verification to complete before saving.');
              return;
            }

            m.close();
            stopAttCamera();

            const payload = {
              workDate: U.todayKey(),
              status: status.toLowerCase(),
              loginTime: status === 'Present' ? login : null,
            };

            if (hasGeofence && currentLocation) {
              payload.latitude = currentLocation.latitude;
              payload.longitude = currentLocation.longitude;
            }
            if (capturedFaceDescriptor) {
              payload.faceDescriptor = capturedFaceDescriptor;
            } else {
              console.warn('[Attendance] No face descriptor captured! capturedFaceDescriptor is:', capturedFaceDescriptor);
            }
            

            S.markAttendance(payload).then((record) => {
              // Close modal first before showing toast
              m.close();
              stopAttCamera();
              
              const pending = record && record.approval === 'Pending';
              A.ui.toast('success', 'Attendance saved', `${U.fmtDate(U.todayKey())} marked ${status}${status === 'Present' ? ` at ${login}` : ''}. `
                + (pending ? `Waiting on ${U.esc(S.approverName())}.` : 'No approval needed.'));
              onSaved();
            }).catch((error) => {
              A.ui.toast('error', 'Mark not saved', error.message);
            });
          },
        },
      ],
      onMount: () => {
        const sync = () => {
          const present = U.by('attStatus').value === 'Present';
          U.by('attLogin').disabled = !present;
          U.by('attStatus').closest('.field').classList.remove('has-error');
          U.by('attLogin').closest('.field').classList.remove('has-error');
        };
        U.by('attStatus').addEventListener('change', sync);
        sync();

        if (hasGeofence) {
          // Get location automatically
          getCurrentLocation();
        }

        if (hasFaceEnrolled) {
          // Bind camera button
          U.by('startAttCameraBtn').addEventListener('click', startAttCamera);
        }
      },
    });
  }

  function getCurrentLocation() {
    if (!navigator.geolocation) {
      A.ui.toast('error', 'Geolocation not supported', 'Your browser does not support location services.');
      return;
    }
    
    const btn = U.by('getLocationBtn');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Getting location...';
    }
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        currentLocation = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        };
        // Refresh modal to show location detected
        const btn = U.by('getLocationBtn');
        if (btn) {
          btn.parentElement.innerHTML = '<span style="color:var(--success)">Location detected ✓</span>';
        }
      },
      (error) => {
        let message = 'Unable to get your location.';
        if (error.code === 1) {
          message = 'Location access denied. Please enable location permissions in your browser settings.';
        } else if (error.code === 2) {
          message = 'Location unavailable. Please try again.';
        } else if (error.code === 3) {
          message = 'Location request timed out. Please try again.';
        }
        A.ui.toast('error', 'Location access failed', message);
        
        const btn = U.by('getLocationBtn');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Get My Location';
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  }

  async function startAttCamera() {
    try {
      const loaded = await A.faceDetector.loadModels();
      if (!loaded) {
        A.ui.toast('error', 'Face detection not available', 'Please refresh the page.');
        return;
      }

      const video = U.by('attVideo');
      await A.faceDetector.startWebcam(video);

      U.by('faceCaptureHost').classList.add('is-live');
      U.by('startAttCameraBtn').style.display = 'none';
      const capBtn = U.by('attCaptureBtn');
      capBtn.style.display = 'inline-block';
      capBtn.onclick = attManualCapture;

      attLive = A.faceDetector.createLiveCapture({
        video,
        canvas: U.by('attOverlay'),
        onStatus: (state) => setAttFaceStatus(state),
        onCaptured: (result) => onAttCaptured(result),
        autoCapture: true,
      });
      attLive.start();
    } catch (error) {
      A.ui.toast('error', 'Camera access denied', 'Please allow camera access for face verification.');
    }
  }

  function attManualCapture() {
    if (attLive && attLive.snap()) return;
    A.ui.toast('info', 'Line your face up', 'Center your face in the oval and wait for the outline.');
  }

  function onAttCaptured(result) {
    if (attLive) { attLive.stop(); attLive = null; }
    A.faceDetector.stopWebcam();

    const first = result.descriptors && result.descriptors[0];
    capturedFaceDescriptor = first ? first.descriptor : null;

    U.by('faceCaptureHost').classList.remove('is-searching', 'is-hold', 'is-perfect');
    U.by('faceCaptureHost').classList.add('is-captured');
    U.by('attFaceStatus').textContent = 'Face captured ✓';

    const capBtn = U.by('attCaptureBtn');
    capBtn.disabled = true;
    capBtn.textContent = 'Face Captured ✓';
    capBtn.onclick = null;

    A.ui.toast('info', 'Face captured', 'Press Save to verify your identity.');
  }

  function stopAttCamera() {
    if (attLive) { attLive.stop(); attLive = null; }
    if (videoStream) {
      videoStream.getTracks().forEach(track => track.stop());
      videoStream = null;
    }
    if (A.faceDetector) A.faceDetector.stopWebcam();
  }

  /* ---------- Approval ---------- */
  function acceptDay(ownerId, date) {
    S.decideAttendance(date, ownerId, true).then((day) => {
      if (!day) return;
      A.ui.toast('success', 'Mark accepted', `${U.esc(S.ownerName(ownerId))} · ${U.fmtDate(date)} accepted.`);
      loadAndRender();
    }).catch((error) => A.ui.toast('error', 'Decision not saved', error.message));
  }

  function rejectDay(ownerId, date) {
    const day = S.dayRecord(ownerId, date);
    if (!day) return;
    A.ui.confirm({
      title: 'Reject attendance mark',
      tone: 'danger',
      confirmLabel: 'Reject mark',
      cancelLabel: 'Keep pending',
      message: `Rejects the <strong>${U.esc(day.status)}</strong> mark recorded by ${U.esc(S.ownerName(ownerId))} for ${U.fmtDate(date)}. The login is withdrawn and the day stands as Absent until it is re-marked.`,
    }).then((accepted) => {
      if (!accepted) return;
      S.decideAttendance(date, ownerId, false).then((decided) => {
        if (!decided) return;
        A.ui.toast('info', 'Mark rejected', `${U.esc(S.ownerName(ownerId))} · ${U.fmtDate(date)} is Absent again.`);
        loadAndRender();
      }).catch((error) => A.ui.toast('error', 'Decision not saved', error.message));
    });
  }

  /* ---------- Mount ---------- */
  
  async function loadAndRender() {
    const manager = S.hasTeam();
    const onTeam = manager && tab === 'team';

    // Load paginated data; "My" tab filters to the signed-in staff member.
    try {
      const result = await S.loadAttendancePage(currentPage, PAGE_SIZE, onTeam ? null : S.session.userId);
      pageItems = result.items;
      currentPagination = result.pagination;
      if (!onTeam) myServerTotal = result.pagination ? result.pagination.total : null;
    } catch (error) {
      console.error('Failed to load attendance page:', error);
      pageItems = null;
      currentPagination = null;
      myServerTotal = null;
    }

    paint();
  }
  
  function paint() {
    U.by('attHost').innerHTML = content();
    U.by('markAttBtn').addEventListener('click', () => {
      tab = 'my';
      openMarkModal(loadAndRender);
    });
    
    // Bind page size selector
    const pageSizeSelect = U.by('pageSizeSelect');
    if (pageSizeSelect) {
      pageSizeSelect.addEventListener('change', () => {
        PAGE_SIZE = parseInt(pageSizeSelect.value);
        currentPage = 1; // Reset to first page when changing page size
        loadAndRender();
      });
    }
    
    // Bind pagination controls
    if (A.pagination && currentPagination) {
      A.pagination.bind(U.by('attHost'), (page) => {
        currentPage = page;
        loadAndRender();
      });
    }
  }

  function bindRows(host) {
    host.addEventListener('click', (ev) => {
      const tabBtn = ev.target.closest('[data-tab]');
      if (tabBtn) {
        tab = tabBtn.dataset.tab;
        currentPage = 1;
        loadAndRender();
        return;
      }
      const accept = ev.target.closest('[data-accept-day]');
      if (accept) {
        const parts = accept.dataset.acceptDay.split('|');
        acceptDay(parts[0], parts[1]);
        return;
      }
      const reject = ev.target.closest('[data-reject-day]');
      if (reject) {
        const parts = reject.dataset.rejectDay.split('|');
        rejectDay(parts[0], parts[1]);
      }
    });
  }

  pages.attendance = function (container) {
    tab = 'my';
    container.innerHTML = '<div id="attHost"></div>';
    const host = U.by('attHost');
    bindRows(host);
    host.innerHTML = `<div class="page-head">
      <div class="page-head__text"><h2>Attendance</h2><p>Loading records…</p></div>
    </div>
    <div class="stat-grid">${[0, 1, 2, 3].map(() => '<article class="stat"><div class="stat__top"><span class="stat__label"><span class="skeleton" style="display:inline-block;width:72px;height:11px"></span></span></div><p class="stat__value"><span class="skeleton" style="display:inline-block;width:38px;height:20px"></span></p></article>').join('')}</div>
    <section class="card"><div class="card__body">${[0, 1, 2, 3, 4, 5].map(() => '<span class="skeleton" style="display:block;height:13px;margin-bottom:10px"></span>').join('')}</div></section>`;

    return S.reload(['attendance', 'staff', 'policy']).then(() => {
      currentPage = 1;
      return loadAndRender();
    });
  };
})(window.App);
