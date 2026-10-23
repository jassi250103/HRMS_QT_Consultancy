/**
 * Face Detection Utility using face-api.js
 * Handles webcam access, face detection, and descriptor extraction
 */

// Ensure App namespace exists
window.App = window.App || {};

(function (A) {
  let modelsLoaded = false;
  let videoStream = null;
  const MODEL_URL = '/models'; // Models served from server's models directory

  /**
   * Load face-api.js models (call once at app startup)
   */
  async function loadModels() {
    if (modelsLoaded) return true;

    try {
      
      // Load required models from server's /models endpoint
      await Promise.all([
        faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
        faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
        faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),
      ]);

      modelsLoaded = true;
      return true;
    } catch (error) {
      console.error('[Face Detector] Failed to load models:', error);
      A.ui.toast('error', 'Face detection not available', 'Please refresh the page and try again.');
      return false;
    }
  }

  /**
   * Start webcam stream
   */
  async function startWebcam(videoElement) {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      videoElement.srcObject = stream;
      videoStream = stream;
      
      // Wait for video to load and have data
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Video loading timeout'));
        }, 10000);
        
        videoElement.onloadedmetadata = () => {
          clearTimeout(timeout);
          videoElement.play().then(resolve).catch(reject);
        };
        
        videoElement.onerror = (err) => {
          clearTimeout(timeout);
          reject(err);
        };
      });

      // Additional wait to ensure first frame is available
      await new Promise(resolve => setTimeout(resolve, 500));
      
      return true;
    } catch (error) {
      console.error('[Face Detector] Webcam access denied:', error);
      throw new Error('Camera access required. Please allow camera permissions and try again.');
    }
  }

  /**
   * Stop webcam stream
   */
  function stopWebcam() {
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      videoStream = null;
    }
  }

  /**
   * Detect face and extract 128-dimensional descriptor
   * Returns: { descriptor: number[128], confidence: number, box: object }
   */
  async function detectFace(videoElement) {
    if (!modelsLoaded) {
      const loaded = await loadModels();
      if (!loaded) throw new Error('Face detection models not loaded');
    }

    // Check if video is ready
    if (!videoElement || videoElement.readyState < 2) {
      console.warn('[Face Detector] Video not ready, readyState:', videoElement?.readyState);
      throw new Error('Video not ready. Please wait a moment and try again.');
    }


    try {
      // Detect face with landmarks and descriptor
      const detection = await faceapi
        .detectSingleFace(videoElement)
        .withFaceLandmarks()
        .withFaceDescriptor();

      if (!detection) {
        console.warn('[Face Detector] No face detected in frame');
        throw new Error('No face detected. Please position your face clearly in the frame.');
      }

      // Debug: log detection structure
      
      // face-api.js returns descriptor directly on the detection object
      // confidence is on detection.detection for SSD, but may not exist for all detectors
      const descriptor = detection.descriptor;
      const confidence = detection.detection?.score ?? detection.score ?? 0; // face-api exposes .score

      if (confidence < 0.7) {
        throw new Error(
          `Face detection too weak (${(confidence * 100).toFixed(0)}%). Please improve lighting and try again.`
        );
      }

      return {
        descriptor: Array.from(descriptor), // 128-dim Float32Array -> regular array
        confidence: confidence,
        box: detection.detection?.box || null,
      };
    } catch (error) {
      if (error.message.includes('No face')) throw error;
      console.error('[Face Detector] Detection error:', error);
      throw new Error('Face detection failed. Please try again.');
    }
  }

  /**
   * Capture face from video with retry logic
   * Tries up to 3 times to get a good detection
   */
  async function captureFace(videoElement, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        // Small delay to ensure video frame is fresh
        await new Promise((resolve) => setTimeout(resolve, 300));
        
        const result = await detectFace(videoElement);
        return result;
      } catch (error) {
        if (attempt === maxRetries) {
          throw error;
        }
      }
    }
  }

  /**
   * Draw detection box on canvas (for debugging/feedback)
   */
  function drawDetection(canvas, detection) {
    const ctx = canvas.getContext('2d');
    const box = detection.box;
    
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(box.x, box.y, box.width, box.height);
    
    ctx.fillStyle = '#00ff00';
    ctx.font = '14px Arial';
    ctx.fillText(`Confidence: ${(detection.confidence * 100).toFixed(0)}%`, box.x, box.y - 10);
  }

  /**
   * Live, guided face capture. Draws the face box + 68-point mesh on an overlay
   * each frame and reports plain-language guidance so the user can see it working.
   * Auto-captures once the face is centered, correctly sized and stable.
   *
   * cfg: {
   *   video, canvas, onStatus(state, text), onSample(count, total),
   *   onCaptured({descriptors:[{descriptor,confidence}], confidence}),
   *   autoCapture=true, stableFrames=14, samples=1, sampleGapMs=350,
   *   minFace=0.20, maxFace=0.62 (fraction of frame width),
   * }
   */
  function createLiveCapture(cfg) {
    const video = cfg.video;
    const canvas = cfg.canvas;
    const onStatus = cfg.onStatus || function () {};
    const onSample = cfg.onSample || function () {};
    const onCaptured = cfg.onCaptured || function () {};
    const autoCapture = cfg.autoCapture !== false;
    const STABLE_NEEDED = cfg.stableFrames || 14;
    const SAMPLES = Math.max(1, cfg.samples || 1);
    const SAMPLE_GAP = cfg.sampleGapMs == null ? 350 : cfg.sampleGapMs;
    const MIN_FACE = cfg.minFace || 0.20;
    const MAX_FACE = cfg.maxFace || 0.62;
    const CENTER_X = 0.5, CENTER_Y = 0.44, TOL_X = 0.15, TOL_Y = 0.18;

    const ctx = canvas.getContext('2d');
    let running = false, finished = false, raf = 0;
    let stable = 0, lastC = null, best = null, lastCollectedAt = 0;
    const collected = [];

    const MSG = {
      starting: 'Starting camera…',
      searching: 'Look at the camera — place your face inside the oval',
      tooFar: 'Move a little closer',
      tooClose: 'Move back a little',
      offCenter: 'Center your face in the oval',
      hold: 'Hold still…',
      perfect: 'Perfect — hold that',
      captured: 'Captured',
    };

    function resize() {
      const w = video.clientWidth || video.videoWidth;
      const h = video.clientHeight || video.videoHeight;
      if (!w || !h) return false;
      if (canvas.width !== Math.round(w) || canvas.height !== Math.round(h)) {
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
      }
      return true;
    }

    function roundRect(x, y, w, h, r) {
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x + w, y, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
    }

    function paint(box, landmarks, color) {
      const sx = canvas.width / video.videoWidth;
      const sy = canvas.height / video.videoHeight;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 3;
      ctx.strokeStyle = color;
      roundRect(box.x * sx, box.y * sy, box.width * sx, box.height * sy, 12);
      ctx.stroke();
      ctx.fillStyle = color;
      const pts = landmarks.positions;
      for (let i = 0; i < pts.length; i++) {
        ctx.beginPath();
        ctx.arc(pts[i].x * sx, pts[i].y * sy, 1.5, 0, 6.283);
        ctx.fill();
      }
    }

    function collectCurrentSample() {
      if (!best || !(best.confidence >= 0.35)) return false;
      collected.push({ descriptor: best.descriptor, confidence: best.confidence });
      onSample(collected.length, SAMPLES);
      stable = 0; lastC = null; lastCollectedAt = Date.now();
      return collected.length >= SAMPLES;
    }

    function finish() {
      if (finished) return;
      finished = true;
      running = false;
      if (raf) cancelAnimationFrame(raf);
      const confidence = collected.length
        ? Math.min.apply(null, collected.map((s) => s.confidence))
        : 0;
      onStatus('captured', MSG.captured);
      onCaptured({ descriptors: collected, confidence });
    }

    async function tick() {
      if (!running) return;
      if (video.readyState >= 2 && resize()) {
        let res = null;
        try {
          res = await faceapi
            .detectSingleFace(video, new faceapi.SsdMobilenetv1Options({ minConfidence: 0.35, maxResults: 1 }))
            .withFaceLandmarks()
            .withFaceDescriptor();
        } catch (e) { res = null; }

        if (res) {
          const box = res.detection.box;
          const vw = video.videoWidth || 1, vh = video.videoHeight || 1;
          const normW = box.width / vw;
          const cx = (box.x + box.width / 2) / vw;
          const cy = (box.y + box.height / 2) / vh;
          best = { descriptor: Array.from(res.descriptor), confidence: res.detection.score };

          let state;
          if (normW < MIN_FACE) state = 'tooFar';
          else if (normW > MAX_FACE) state = 'tooClose';
          else if (Math.abs(cx - CENTER_X) > TOL_X || Math.abs(cy - CENTER_Y) > TOL_Y) state = 'offCenter';
          else state = 'hold';

          const moved = lastC ? Math.hypot(cx - lastC.cx, cy - lastC.cy) : 1;
          lastC = { cx, cy };

          if (state === 'hold' && moved < 0.035) {
            stable++;
            if (stable >= STABLE_NEEDED - 4) state = 'perfect';
          } else if (state === 'hold') {
            stable = Math.max(0, stable - 1);
          } else {
            stable = 0;
            lastC = null;
          }

          const good = state === 'perfect';
          paint(box, res.landmarks, good ? '#22c55e' : state === 'hold' ? '#38bdf8' : '#f59e0b');
          onStatus(state, MSG[state]);

          if (autoCapture && !finished && stable >= STABLE_NEEDED && state !== 'offCenter'
              && (Date.now() - lastCollectedAt) >= SAMPLE_GAP) {
            if (collectCurrentSample()) { finish(); return; }
          }
        } else {
          stable = 0; lastC = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          onStatus('searching', MSG.searching);
        }
      }
      raf = requestAnimationFrame(tick);
    }

    function start() {
      if (running) return;
      running = true; finished = false; stable = 0; lastC = null; best = null;
      lastCollectedAt = 0; collected.length = 0;
      onStatus('starting', MSG.starting);
      tick();
    }

    function stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    }

    // Manual capture: add the freshest good frame as a sample; finish once complete.
    function snap() {
      if (finished || !best || !(best.confidence >= 0.35)) return false;
      const done = collectCurrentSample();
      if (done) finish();
      return true;
    }

    return { start, stop, snap, getCount: () => collected.length, getSamples: () => collected };
  }

  // Export public API
  A.faceDetector = {
    loadModels,
    startWebcam,
    stopWebcam,
    detectFace,
    captureFace,
    drawDetection,
    createLiveCapture,
  };
})(window.App);
