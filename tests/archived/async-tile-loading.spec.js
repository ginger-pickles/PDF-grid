/**
 * Async Tile Loading Test
 *
 * Tests the new downloadTileStart pattern that replaces getTileUrl.
 * Verifies:
 * 1. Tiles load via async pattern (pendingJobs mechanism)
 * 2. No striped placeholder tiles remain visible
 * 3. finishPendingJobs completes queued tiles when pages render
 */

const { test, expect } = require('@playwright/test');

test.describe('Async Tile Loading', () => {

  test('PDF loads with async tile pattern - no striped placeholders', async ({ page }) => {
    const consoleErrors = [];
    const asyncTileLogs = [];

    // Capture console output
    page.on('console', msg => {
      const text = msg.text();
      if (msg.type() === 'error') {
        consoleErrors.push(text);
      }
      if (text.includes('[Async Tile]')) {
        asyncTileLogs.push(text);
      }
    });

    // Load with verbose logging to see async tile activity
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for initial rendering to settle
    await page.waitForTimeout(2000);

    // Check async tile infrastructure exists
    const asyncInfrastructure = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      return {
        hasPendingJobsMap: ts && ts.pendingJobs instanceof Map,
        hasTryGenerateTile: ts && typeof ts.tryGenerateTile === 'function',
        hasFinishPendingJobs: ts && typeof ts.finishPendingJobs === 'function',
        pendingJobsCount: ts?.pendingJobs?.size || 0
      };
    });

    console.log('\n=== ASYNC TILE INFRASTRUCTURE ===');
    console.log('Has pendingJobs Map:', asyncInfrastructure.hasPendingJobsMap);
    console.log('Has tryGenerateTile:', asyncInfrastructure.hasTryGenerateTile);
    console.log('Has finishPendingJobs:', asyncInfrastructure.hasFinishPendingJobs);
    console.log('Pending jobs count:', asyncInfrastructure.pendingJobsCount);

    // Verify infrastructure exists
    expect(asyncInfrastructure.hasPendingJobsMap).toBe(true);
    expect(asyncInfrastructure.hasTryGenerateTile).toBe(true);
    expect(asyncInfrastructure.hasFinishPendingJobs).toBe(true);

    // After initial load settles, pendingJobs should be empty (all completed)
    expect(asyncInfrastructure.pendingJobsCount).toBe(0);

    // No console errors
    if (consoleErrors.length > 0) {
      console.log('\nConsole errors:');
      consoleErrors.forEach(err => console.log('  -', err));
    }
    expect(consoleErrors.length).toBe(0);

    console.log('\n✓ Async tile infrastructure verified');
  });

  test('Tiles render without stripe patterns (visual check)', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for pages to render
    await page.waitForTimeout(3000);

    // Take screenshot for visual inspection
    await page.screenshot({ path: 'test-results/async-tile-initial.png' });

    // Sample canvas pixels to check for stripe pattern
    // Stripes are red (rgba 255, 0, 0, 0.3) on background
    const hasStripes = await page.evaluate(() => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) return { error: 'No canvas found' };

      const ctx = canvas.getContext('2d');
      const width = canvas.width;
      const height = canvas.height;

      // Sample center region
      const sampleSize = 100;
      const startX = Math.floor(width / 2 - sampleSize / 2);
      const startY = Math.floor(height / 2 - sampleSize / 2);

      const imageData = ctx.getImageData(startX, startY, sampleSize, sampleSize);
      const data = imageData.data;

      // Count red-ish pixels (stripe indicator)
      // Stripes are rgba(255, 0, 0, 0.3) = approximately r:255, g:0, b:0, a:76
      let redPixelCount = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i];
        const g = data[i + 1];
        const b = data[i + 2];
        // Check for red-dominant pixels (stripe pattern)
        if (r > 200 && g < 50 && b < 50) {
          redPixelCount++;
        }
      }

      const totalPixels = sampleSize * sampleSize;
      const redPercentage = (redPixelCount / totalPixels) * 100;

      return {
        redPixelCount,
        totalPixels,
        redPercentage: redPercentage.toFixed(2),
        hasStripePattern: redPercentage > 5 // More than 5% red = likely stripes
      };
    });

    console.log('\n=== STRIPE PATTERN CHECK ===');
    console.log('Sample region:', hasStripes.totalPixels, 'pixels');
    console.log('Red pixels found:', hasStripes.redPixelCount);
    console.log('Red percentage:', hasStripes.redPercentage + '%');
    console.log('Has stripe pattern:', hasStripes.hasStripePattern);

    // Should NOT have stripe pattern
    expect(hasStripes.hasStripePattern).toBe(false);

    console.log('\n✓ No stripe placeholders detected');
  });

  test('Zoom triggers async tile loading correctly', async ({ page }) => {
    const asyncLogs = [];
    page.on('console', msg => {
      if (msg.text().includes('[Async Tile]') || msg.text().includes('pending')) {
        asyncLogs.push(msg.text());
      }
    });

    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get initial state
    const beforeZoom = await page.evaluate(() => ({
      pendingJobs: window.tileStreamerRef?.pendingJobs?.size || 0,
      zoom: window.viewer?.viewport?.getZoom() || 0
    }));

    console.log('\n=== BEFORE ZOOM ===');
    console.log('Zoom level:', beforeZoom.zoom.toFixed(3));
    console.log('Pending jobs:', beforeZoom.pendingJobs);

    // Zoom in to trigger high-res tile requests
    await page.evaluate(() => {
      window.viewer.viewport.zoomTo(3.0, null, true);
    });

    // Brief wait to catch any pending jobs mid-flight
    await page.waitForTimeout(500);

    const duringZoom = await page.evaluate(() => ({
      pendingJobs: window.tileStreamerRef?.pendingJobs?.size || 0,
      zoom: window.viewer?.viewport?.getZoom() || 0
    }));

    console.log('\n=== DURING ZOOM (500ms) ===');
    console.log('Zoom level:', duringZoom.zoom.toFixed(3));
    console.log('Pending jobs:', duringZoom.pendingJobs);

    // Wait for tiles to complete
    await page.waitForTimeout(3000);

    const afterZoom = await page.evaluate(() => ({
      pendingJobs: window.tileStreamerRef?.pendingJobs?.size || 0,
      zoom: window.viewer?.viewport?.getZoom() || 0
    }));

    console.log('\n=== AFTER ZOOM (3s) ===');
    console.log('Zoom level:', afterZoom.zoom.toFixed(3));
    console.log('Pending jobs:', afterZoom.pendingJobs);

    // Take screenshot
    await page.screenshot({ path: 'test-results/async-tile-zoomed.png' });

    // After settling, pending jobs should be 0
    expect(afterZoom.pendingJobs).toBe(0);

    // Log any async tile activity
    if (asyncLogs.length > 0) {
      console.log('\n=== ASYNC TILE LOGS ===');
      asyncLogs.slice(-10).forEach(log => console.log(' ', log));
    }

    console.log('\n✓ Zoom tile loading completed successfully');
  });

  test('OSD config uses downloadTileStart with getTileUrl for cache keys', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Check that the tile source uses the async pattern
    // Note: getTileUrl is REQUIRED by OSD for cache key generation, even with downloadTileStart
    const configCheck = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      if (!ts) return { error: 'No tileStreamerRef' };

      const config = ts.getOSDConfig();
      return {
        hasDownloadTileStart: typeof config.downloadTileStart === 'function',
        hasDownloadTileAbort: typeof config.downloadTileAbort === 'function',
        hasGetTileUrl: typeof config.getTileUrl === 'function',
        hasCacheHandlers: typeof config.createTileCache === 'function' &&
                          typeof config.destroyTileCache === 'function' &&
                          typeof config.getTileCacheData === 'function' &&
                          typeof config.getTileCacheDataAsContext2D === 'function',
        // Verify getTileUrl returns cache key format (not data URL)
        tileUrlSample: config.getTileUrl(0, 0, 0)
      };
    });

    console.log('\n=== OSD CONFIG CHECK ===');
    console.log('Has downloadTileStart:', configCheck.hasDownloadTileStart);
    console.log('Has downloadTileAbort:', configCheck.hasDownloadTileAbort);
    console.log('Has getTileUrl (cache key):', configCheck.hasGetTileUrl);
    console.log('Has cache handlers:', configCheck.hasCacheHandlers);
    console.log('Sample cache key:', configCheck.tileUrlSample);

    // Should have async methods
    expect(configCheck.hasDownloadTileStart).toBe(true);
    expect(configCheck.hasDownloadTileAbort).toBe(true);
    expect(configCheck.hasCacheHandlers).toBe(true);

    // Should have getTileUrl for cache key generation (required by OSD)
    expect(configCheck.hasGetTileUrl).toBe(true);
    // Verify it returns a cache key format, not a data URL
    expect(configCheck.tileUrlSample).toMatch(/^tile:\/\//);
    expect(configCheck.tileUrlSample).not.toMatch(/^data:/);

    console.log('\n✓ OSD config uses async pattern with cache keys correctly');
  });

});
