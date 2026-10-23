/**
 * Download face-api.js models with retry logic and verification
 */

import https from 'https';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MODELS_DIR = path.join(__dirname, '..', 'models');
const BASE_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.15/model/';

const MODELS = [
  { name: 'ssd_mobilenetv1_model.bin', expectedSize: 5800000 },
  { name: 'ssd_mobilenetv1_model-weights_manifest.json', expectedSize: 28000 },
  { name: 'face_landmark_68_model.bin', expectedSize: 360000 },
  { name: 'face_landmark_68_model-weights_manifest.json', expectedSize: 8400 },
  { name: 'face_recognition_model.bin', expectedSize: 6500000 },
  { name: 'face_recognition_model-weights_manifest.json', expectedSize: 19500 },
];

function downloadWithRetry(url, dest, maxRetries = 3) {
  return new Promise(async (resolve, reject) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await downloadFile(url, dest, attempt);
        resolve();
        return;
      } catch (error) {
        if (attempt === maxRetries) {
          reject(error);
        } else {
          console.log(`  Retry ${attempt + 1}/${maxRetries}...`);
          await new Promise(r => setTimeout(r, 1000 * attempt));
        }
      }
    }
  });
}

function downloadFile(url, dest, attemptNum) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    let downloadedBytes = 0;

    const request = https.get(url, {
      timeout: 30000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    }, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        // Follow redirect
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          handleResponse(redirectResponse);
        }).on('error', reject);
        return;
      }

      if (response.statusCode !== 200) {
        fs.unlink(dest, () => {});
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        return;
      }

      handleResponse(response);
    });

    function handleResponse(response) {
      const totalSize = parseInt(response.headers['content-length'], 10);

      response.on('data', (chunk) => {
        downloadedBytes += chunk.length;
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();

        // Verify file size
        const stats = fs.statSync(dest);
        if (stats.size === 0) {
          fs.unlink(dest, () => {});
          reject(new Error('Downloaded file is empty'));
          return;
        }

        console.log(`  ✓ ${path.basename(dest)} (${formatBytes(stats.size)})`);
        resolve();
      });

      file.on('error', (err) => {
        fs.unlink(dest, () => {});
        reject(err);
      });
    }

    request.on('error', (err) => {
      fs.unlink(dest, () => {});
      reject(err);
    });

    request.on('timeout', () => {
      request.destroy();
      fs.unlink(dest, () => {});
      reject(new Error('Download timed out'));
    });
  });
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function main() {
  try {
    // Create models directory
    if (!fs.existsSync(MODELS_DIR)) {
      fs.mkdirSync(MODELS_DIR, { recursive: true });
    }

    console.log('Downloading face-api.js models...\n');

    let successCount = 0;
    for (const model of MODELS) {
      const url = `${BASE_URL}${model.name}`;
      const dest = path.join(MODELS_DIR, model.name);

      try {
        console.log(`Downloading ${model.name}...`);
        await downloadWithRetry(url, dest);
        successCount++;
      } catch (error) {
        console.error(`  ✗ Failed to download ${model.name}: ${error.message}`);
      }
    }

    console.log('');
    if (successCount === MODELS.length) {
      console.log(`✓ All ${MODELS.length} models downloaded successfully!`);
      console.log(`Models are in: ${MODELS_DIR}`);

      // List files with sizes
      console.log('\nModel files:');
      const files = fs.readdirSync(MODELS_DIR);
      for (const file of files) {
        const filePath = path.join(MODELS_DIR, file);
        const stats = fs.statSync(filePath);
        console.log(`  ${file}: ${formatBytes(stats.size)}`);
      }
    } else {
      console.error(`✗ Only ${successCount}/${MODELS.length} models downloaded`);
      console.error('\nPlease check your internet connection and try again.');
      process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Fatal error:', error.message);
    process.exit(1);
  }
}

main();
