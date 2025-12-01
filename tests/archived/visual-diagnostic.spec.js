/**
 * Visual Diagnostic Test
 * Examines rendering at different zoom levels
 */

const { test, expect } = require('@playwright/test');

test('Diagnose rendering at different zoom levels', async ({ page }) => {
  const logs = [];
  page.on('console', msg => {
    if (msg.type() === 'log' || msg.type() === 'error') {
      logs.push('[' + msg.type() + '] ' + msg.text());
    }
  });

  // Load demo-1.pdf (smaller, faster)
  await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');

  // Wait for viewer to be ready
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

  // Wait for initial rendering
  await page.waitForTimeout(3000);

  // Get diagnostics at home zoom
  const homeStats = await page.evaluate(() => {
    const diag = window.__PDFGridDiagnostics;
    const viewer = window.viewer;
    const stats = diag?.getCacheStats?.() || {};

    return {
      zoom: viewer?.viewport?.getZoom() || 'N/A',
      worldItems: viewer?.world?.getItemCount() || 0,
      cacheStats: stats,
      viewerReady: window.viewerReady,
      hasTileSource: !!window.tileStreamerRef
    };
  });

  console.log('\n=== HOME ZOOM STATE ===');
  console.log('Zoom level:', homeStats.zoom);
  console.log('World items:', homeStats.worldItems);
  console.log('Cache stats:', JSON.stringify(homeStats.cacheStats));
  console.log('Viewer ready:', homeStats.viewerReady);
  console.log('Has tile source:', homeStats.hasTileSource);

  // Take screenshot at home zoom
  await page.screenshot({ path: 'test-results/diagnostic-home.png' });

  // Zoom in to 2x
  await page.evaluate(() => {
    window.viewer.viewport.zoomTo(2.0, null, true);
  });
  await page.waitForTimeout(2000);

  const zoom2Stats = await page.evaluate(() => {
    const diag = window.__PDFGridDiagnostics;
    return {
      zoom: window.viewer?.viewport?.getZoom() || 'N/A',
      cacheStats: diag?.getCacheStats?.() || {}
    };
  });

  console.log('\n=== ZOOM 2x STATE ===');
  console.log('Zoom level:', zoom2Stats.zoom);
  console.log('Cache stats:', JSON.stringify(zoom2Stats.cacheStats));

  await page.screenshot({ path: 'test-results/diagnostic-zoom2.png' });

  // Zoom in more to 5x
  await page.evaluate(() => {
    window.viewer.viewport.zoomTo(5.0, null, true);
  });
  await page.waitForTimeout(2000);

  const zoom5Stats = await page.evaluate(() => {
    const diag = window.__PDFGridDiagnostics;
    return {
      zoom: window.viewer?.viewport?.getZoom() || 'N/A',
      cacheStats: diag?.getCacheStats?.() || {}
    };
  });

  console.log('\n=== ZOOM 5x STATE ===');
  console.log('Zoom level:', zoom5Stats.zoom);
  console.log('Cache stats:', JSON.stringify(zoom5Stats.cacheStats));

  await page.screenshot({ path: 'test-results/diagnostic-zoom5.png' });

  // Print recent console logs
  console.log('\n=== CONSOLE LOGS (last 20) ===');
  logs.slice(-20).forEach(l => console.log(l));

  // Basic assertion - viewer should be ready
  expect(homeStats.viewerReady).toBe(true);
});
