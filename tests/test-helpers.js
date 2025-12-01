/**
 * Test Helpers for PDF Grid Viewer
 *
 * Provides utilities for offline testing via CDN route interception.
 */

const fs = require('fs');
const path = require('path');

/**
 * CDN URL to local file mapping
 */
const CDN_ROUTES = {
  // PDF.js
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js': 'vendor/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js': 'vendor/pdf.worker.min.js',

  // OpenSeadragon
  'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/openseadragon.min.js': 'vendor/openseadragon.min.js',

  // React
  'https://unpkg.com/react@18/umd/react.production.min.js': 'vendor/react.production.min.js',
  'https://unpkg.com/react-dom@18/umd/react-dom.production.min.js': 'vendor/react-dom.production.min.js',

  // Babel
  'https://unpkg.com/@babel/standalone/babel.min.js': 'vendor/babel.min.js',

  // Tailwind
  'https://cdn.tailwindcss.com': 'vendor/tailwind.js',
};

/**
 * OpenSeadragon images prefix
 */
const OSD_IMAGES_PREFIX = 'https://cdnjs.cloudflare.com/ajax/libs/openseadragon/4.1.0/images/';

/**
 * Get MIME type for file extension
 */
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const mimeTypes = {
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.css': 'text/css',
    '.html': 'text/html',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Setup CDN route interception for offline testing
 *
 * @param {import('@playwright/test').Page} page - Playwright page object
 * @param {string} baseDir - Base directory containing vendor/ folder
 * @returns {Promise<void>}
 */
async function setupOfflineRoutes(page, baseDir = process.cwd()) {
  // Intercept exact CDN URLs
  for (const [cdnUrl, localPath] of Object.entries(CDN_ROUTES)) {
    const fullPath = path.join(baseDir, localPath);

    await page.route(cdnUrl, async (route) => {
      try {
        const body = fs.readFileSync(fullPath);
        await route.fulfill({
          status: 200,
          contentType: getMimeType(localPath),
          body: body,
        });
      } catch (err) {
        console.error(`Failed to serve ${localPath}: ${err.message}`);
        await route.abort('failed');
      }
    });
  }

  // Intercept OpenSeadragon images (pattern match)
  await page.route(urlObj => {
    const urlStr = typeof urlObj === 'string' ? urlObj : urlObj.toString();
    return urlStr.startsWith(OSD_IMAGES_PREFIX);
  }, async (route) => {
    const requestUrl = route.request().url();
    const imageName = requestUrl.replace(OSD_IMAGES_PREFIX, '');
    const localPath = path.join(baseDir, 'vendor', 'openseadragon-images', imageName);

    try {
      const body = fs.readFileSync(localPath);
      await route.fulfill({
        status: 200,
        contentType: getMimeType(imageName),
        body: body,
      });
    } catch (err) {
      // OSD images are optional, just return 404
      await route.fulfill({ status: 404 });
    }
  });
}

/**
 * Wait for viewer to be ready (viewerReady flag set)
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout - Timeout in ms
 */
async function waitForViewerReady(page, timeout = 30000) {
  await page.waitForFunction(() => window.viewerReady === true, { timeout });
}

/**
 * Wait for all pending tile jobs to complete
 *
 * @param {import('@playwright/test').Page} page
 * @param {number} timeout - Timeout in ms
 */
async function waitForTilesComplete(page, timeout = 30000) {
  await page.waitForFunction(
    () => (window.tileStreamerRef?.pendingJobs?.size || 0) === 0,
    { timeout }
  );
}

/**
 * Wait for settled state: viewer ready + tiles complete + visual stability
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {number} options.timeout - Overall timeout in ms
 * @param {number} options.stabilityMs - How long display must be stable
 */
async function waitForSettled(page, options = {}) {
  const { timeout = 30000, stabilityMs = 500 } = options;

  // First wait for viewer and tiles
  await waitForViewerReady(page, timeout);
  await waitForTilesComplete(page, timeout);

  // Then wait for visual stability (no canvas changes)
  await page.waitForTimeout(stabilityMs);

  // Verify tiles still complete after stability period
  await waitForTilesComplete(page, 5000);
}

/**
 * Capture canvas pixels as ImageData-like object
 *
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<{width: number, height: number, data: number[]}>}
 */
async function captureCanvas(page) {
  return await page.evaluate(() => {
    const canvas = document.querySelector('.openseadragon-canvas canvas');
    if (!canvas) return null;

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    // Convert Uint8ClampedArray to regular array for serialization
    return {
      width: canvas.width,
      height: canvas.height,
      data: Array.from(imageData.data)
    };
  });
}

/**
 * Compare two canvas captures for differences
 *
 * @param {Object} img1 - First capture
 * @param {Object} img2 - Second capture
 * @param {number} threshold - Per-pixel difference threshold (0-255)
 * @returns {{different: boolean, percentDifferent: number, pixelsDifferent: number}}
 */
function compareCanvases(img1, img2, threshold = 10) {
  if (!img1 || !img2) return { different: true, percentDifferent: 100, pixelsDifferent: -1 };
  if (img1.width !== img2.width || img1.height !== img2.height) {
    return { different: true, percentDifferent: 100, pixelsDifferent: -1 };
  }

  const totalPixels = img1.width * img1.height;
  let differentPixels = 0;

  for (let i = 0; i < img1.data.length; i += 4) {
    const dr = Math.abs(img1.data[i] - img2.data[i]);
    const dg = Math.abs(img1.data[i + 1] - img2.data[i + 1]);
    const db = Math.abs(img1.data[i + 2] - img2.data[i + 2]);

    if (dr > threshold || dg > threshold || db > threshold) {
      differentPixels++;
    }
  }

  const percentDifferent = (differentPixels / totalPixels) * 100;

  return {
    different: differentPixels > 0,
    percentDifferent,
    pixelsDifferent: differentPixels
  };
}

/**
 * Capture frame sequence for flicker detection
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {number} options.duration - Total capture duration in ms
 * @param {number} options.interval - Interval between captures in ms
 * @returns {Promise<Array>} Array of canvas captures
 */
async function captureFrameSequence(page, options = {}) {
  const { duration = 3000, interval = 100 } = options;
  const frames = [];
  const frameCount = Math.floor(duration / interval);

  for (let i = 0; i < frameCount; i++) {
    frames.push(await captureCanvas(page));
    if (i < frameCount - 1) {
      await page.waitForTimeout(interval);
    }
  }

  return frames;
}

/**
 * Detect flickers in a frame sequence
 *
 * @param {Array} frames - Array of canvas captures
 * @param {Object} options
 * @param {number} options.threshold - Pixel difference threshold
 * @param {number} options.minPercentChange - Minimum % change to count as flicker
 * @returns {Array} Array of flicker events with frame indices
 */
function detectFlickers(frames, options = {}) {
  const { threshold = 10, minPercentChange = 0.1 } = options;
  const flickers = [];

  for (let i = 1; i < frames.length; i++) {
    const comparison = compareCanvases(frames[i - 1], frames[i], threshold);
    if (comparison.percentDifferent >= minPercentChange) {
      flickers.push({
        fromFrame: i - 1,
        toFrame: i,
        percentChange: comparison.percentDifferent,
        pixelsChanged: comparison.pixelsDifferent
      });
    }
  }

  return flickers;
}

/**
 * Wait for visual content to appear in the canvas (not blank)
 * This is the primary gating criterion - visual evidence of content.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {number} options.timeout - Max time to wait in ms
 * @param {number} options.pollInterval - How often to check in ms
 * @param {number} options.minUniqueColors - Minimum unique colors to consider "content"
 * @returns {Promise<boolean>} true if content appeared, throws on timeout
 */
async function waitForVisualContent(page, options = {}) {
  const { timeout = 30000, pollInterval = 200, minUniqueColors = 10 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const hasContent = await page.evaluate((minColors) => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) return false;

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      if (width === 0 || height === 0) return false;

      // Sample pixels across the canvas
      const sampleSize = 100;
      const colors = new Set();

      for (let i = 0; i < sampleSize; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        // Create color key from RGB (ignore alpha)
        const colorKey = `${pixel[0]},${pixel[1]},${pixel[2]}`;
        colors.add(colorKey);
      }

      // Content present if we have enough unique colors
      return colors.size >= minColors;
    }, minUniqueColors);

    if (hasContent) {
      return true;
    }

    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`Visual content did not appear within ${timeout}ms`);
}

/**
 * Wait for visual change after an action (pan/zoom)
 * Compares canvas before/after to detect change.
 *
 * @param {import('@playwright/test').Page} page
 * @param {Object} options
 * @param {number} options.timeout - Max time to wait in ms
 * @param {number} options.minPercentChange - Minimum % pixels changed
 * @returns {Promise<boolean>} true if change detected, throws on timeout
 */
async function waitForVisualChange(page, beforeCapture, options = {}) {
  const { timeout = 15000, pollInterval = 200, minPercentChange = 5 } = options;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    const afterCapture = await captureCanvas(page);
    if (afterCapture && beforeCapture) {
      const comparison = compareCanvases(beforeCapture, afterCapture, 10);
      if (comparison.percentDifferent >= minPercentChange) {
        return true;
      }
    }
    await page.waitForTimeout(pollInterval);
  }

  throw new Error(`Visual change did not occur within ${timeout}ms`);
}

module.exports = {
  setupOfflineRoutes,
  waitForViewerReady,
  waitForTilesComplete,
  waitForSettled,
  captureCanvas,
  compareCanvases,
  captureFrameSequence,
  detectFlickers,
  waitForVisualContent,
  waitForVisualChange,
  CDN_ROUTES,
};
