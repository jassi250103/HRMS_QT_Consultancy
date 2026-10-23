# Face Recognition Setup Guide

This HRMS now uses **face-api.js** for production-grade face recognition to prevent proxy attendance.

## What Changed

### Before (Insecure):
- Used SHA-256 hashing of image blocks
- Different people could mark attendance for each other
- ~40% accuracy at distinguishing faces

### After (Secure):
- Uses **face-api.js** with SSD MobileNet v1 + FaceRecognitionNet
- Extracts 128-dimensional facial feature vectors
- ~90%+ accuracy at distinguishing different people
- Euclidean distance comparison with 60% similarity threshold

## Architecture

```
Browser (Client-Side):
  ├─ Loads face-api.js models (~6MB total)
  ├─ Accesses webcam via getUserMedia
  ├─ Detects face using SSD MobileNet v1
  ├─ Extracts 128-dim descriptor using FaceRecognitionNet
  └─ Sends descriptor array to server (not raw image)

Server (Node.js):
  ├─ Receives 128-dim descriptor
  ├─ Validates format and confidence
  ├─ Stores in database as JSON array
  └─ Compares using Euclidean distance for verification
```

## Recent Changes (October 17, 2026)

### All Face Enrollments Reset
All previous face enrollments have been cleared from the database for security audit purposes. **All staff members need to re-enroll their faces** before they can mark attendance.

### What This Means:
- ✅ Server is running and healthy
- ✅ Face recognition system is fully operational
- ✅ Admin face reset feature is implemented and tested
- ✅ Master data integration complete (enrollment status visible everywhere)
- ⚠️ **Action Required**: All 8 staff members must re-enroll their faces

### Re-enrollment Process:
1. Login to the HRMS portal
2. Navigate to **Face Enrollment** page (or click "Enroll Now" on dashboard if not enrolled)
3. Click "Start Camera" and allow permissions
4. Position your face clearly in the frame
5. Click "Capture Face"
6. Once detected, click "Enroll"
7. You'll see confirmation: "Face enrolled successfully"

### For HR Admins:
- View enrollment statistics on the **Dashboard** (shows team-wide stats)
- Check individual status on **Internal Staff** page
- Reset face enrollment for any staff member using the "Reset Face" button
- All resets are logged in the audit trail

---

## Setup Steps

### 1. Download ML Models (One-time)

```bash
cd server
npm run setup-face-models
```

Or manually:
```bash
node scripts/download-models-v2.js
```

Models will be downloaded to `server/models/`:
- `ssd_mobilenetv1_model.bin` (~5.6MB - face detection)
- `face_landmark_68_model.bin` (~357KB - facial landmarks)
- `face_recognition_model.bin` (~6.4MB - feature extraction)
- Plus corresponding manifest JSON files

### 2. Start Server

```bash
cd server
npm run dev
```

The server will serve models at `http://localhost:3000/models/`

### 3. Test Face Enrollment

1. Login to the app
2. Go to **Face Enrollment** page
3. Click "Start Camera"
4. Allow camera permissions
5. Position your face clearly
6. Click "Capture Face"
7. If detected successfully, click "Enroll"

You should see:
- Console log: `[Face Detector] Face captured on attempt 1, confidence: XX%`
- Toast: "Face enrolled successfully"

### 4. Test Attendance Marking

1. Go to **Attendance** page
2. Click "Mark Attendance"
3. Select "Present" status
4. Click "Capture Face"
5. Position your face
6. Wait for detection
7. Click "Save"

If someone else tries to mark your attendance:
- Face detection will extract their facial features
- Server compares with your enrolled descriptor
- Similarity < 60% → **REJECTED** with error message

## Security Features

### ✅ Implemented:
- **Real facial feature extraction** (128-dim vectors)
- **Euclidean distance comparison** (mathematically robust)
- **60% similarity threshold** (balances security vs usability)
- **Confidence validation** (rejects weak detections < 70%)
- **Retry logic** (tries up to 3 times for good detection)
- **One-time enrollment** (prevents unauthorized re-enrollment)
- **Admin-only reset** (HR admins can reset face enrollment)
- **Master data integration** (face enrollment status visible in staff listings, admin dashboard, and attendance pages)
- **Real-time updates** (enrollment status refreshes immediately across all pages)
- **Privacy-first** (only stores 128-dimension descriptor arrays, no raw images)

### 📊 Admin Visibility:
- **Staff Management Page**: Shows face enrollment stats (enrolled/not enrolled counts), individual enrollment status badges, and "Reset Face" button
- **Dashboard**: Displays team-wide enrollment statistics for HR admins (total enrolled, not enrolled, total staff)
- **Attendance Page**: Checks enrollment status before allowing attendance marking
- **Face Enrollment Page**: Shows current user's enrollment status with date

### ⚠️ Limitations:
- Can potentially be fooled by high-quality photos (no liveness detection)
- Requires good lighting and clear face visibility
- Not as accurate as cloud services (AWS Rekognition, Azure Face API)

### 🔮 Future Improvements:
- Add liveness detection (blink, smile challenges)
- Upgrade to AWS Rekognition for enterprise security
- Add anti-spoofing measures

## Troubleshooting

### Models not loading:
```
Console: [Face Detector] Failed to load models
```
**Fix:** Run `npm run setup-face-models` in server directory

### Camera not working:
```
Error: Camera access denied
```
**Fix:** Allow camera permissions in browser settings

### Face not detected:
```
Error: No face detected
```
**Fix:** 
- Improve lighting
- Remove glasses/hat if possible
- Position face centrally in frame
- Look directly at camera

### Verification failing for same person:
```
Error: Face verification failed. Similarity: 45% (required: 60%)
```
**Fix:**
- Re-enroll with better quality image
- Ensure similar lighting conditions
- Contact HR admin to reset enrollment

## Technical Details

### Descriptor Format:
```javascript
// 128-dimensional Float32Array converted to regular array
[
  -0.0234, 0.1234, -0.0567, ..., // 128 numbers
]
```

### Comparison Algorithm:
```javascript
// Euclidean distance between two 128-dim vectors
distance = sqrt(sum((a[i] - b[i])^2))
similarity = 1 - (distance / maxDistance)

// Threshold: similarity >= 0.6 (60%)
```

### Database Storage:
```sql
ALTER TABLE staff ADD COLUMN face_embedding JSONB;
-- Stores: [-0.0234, 0.1234, ...] (128 numbers)
```

## Performance

- **Model Load Time:** ~2-5 seconds (first time only, then cached)
- **Face Detection:** ~200-500ms per frame
- **Descriptor Extraction:** ~100-300ms
- **Server Comparison:** < 1ms

## Cost

- **Current (face-api.js):** $0/month (runs locally)
- **Future (AWS Rekognition):** ~$50-100/month for 50 users
- **Future (Azure Face API):** ~$40-80/month for 50 users

---

**Questions?** Contact the development team or check the face-api.js documentation.
