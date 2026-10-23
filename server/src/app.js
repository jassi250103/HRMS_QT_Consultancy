import path from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import helmet from 'helmet';
import { config, projectRoot } from './config.js';
import { one } from './db.js';
import { errorHandler, handler, notFound } from './errors.js';
import attendance from './routes/attendance.js';
import audit from './routes/audit.js';
import auth from './routes/auth.js';
import dashboard from './routes/dashboard.js';
import faceEnrollment from './routes/face-enrollment.js';
import leave from './routes/leave.js';
import master from './routes/master.js';
import policy from './routes/policy.js';
import recruits from './routes/recruits.js';
import resignation from './routes/resignation.js';
import sheets from './routes/sheets.js';
import staff from './routes/staff.js';
import targets from './routes/targets.js';
import adminFaceReset from './routes/admin-face-reset.js';
import { expirePendingLeaves } from './services/leaveAutoExpire.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  // Auto-expire pending leaves for past dates on startup
  expirePendingLeaves()
    .then((count) => {
      if (count > 0) console.log(`Auto-expired ${count} pending leave(s) for past dates`);
    })
    .catch((err) => console.error('Error expiring pending leaves:', err));

  app.use(helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:'],
        'connect-src': ["'self'"],
        'frame-ancestors': ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));
  app.use(cookieParser());
  app.use('/api', express.json({ limit: '1mb' }));

  app.get('/api/health', handler(async (_req, res) => {
    const hit = await one('SELECT current_timestamp AS now, current_setting($1) AS version', ['server_version']);
    res.json({ status: 'ok', database: hit.version, time: hit.now });
  }));

  app.use('/api/auth', auth);
  app.use('/api/staff', staff);
  app.use('/api/recruits', recruits);
  app.use('/api/sheets', sheets);
  app.use('/api/attendance', attendance);
  app.use('/api/face-enrollment', faceEnrollment);
  app.use('/api/leave', leave);
  app.use('/api/resignations', resignation);
  app.use('/api/targets', targets);
  app.use('/api/master', master);
  app.use('/api/policy', policy);
  app.use('/api/audit', audit);
  app.use('/api/dashboard', dashboard);
  app.use('/api/admin/face-enrollment', adminFaceReset);

  // Serve face-api.js models
  app.use('/models', express.static(path.join(projectRoot, 'server', 'models')));

  if (config.serveUi) app.use(express.static(projectRoot, { index: 'index.html' }));

  app.use('/api', notFound);
  if (config.serveUi) {
    app.use((req, res, next) => {
      if (req.method !== 'GET') return next();
      return res.sendFile(path.join(projectRoot, 'index.html'));
    });
  }
  app.use(errorHandler);
  return app;
}
