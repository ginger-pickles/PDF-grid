const { test, expect } = require('@playwright/test');

// Configure video recording
test.use({
  video: 'on',
  screenshot: 'on'
});

test('inspect console output loading demo-1.pdf (30s)', async ({ page }) => {
  test.setTimeout(60000); // 60 second timeout

  const consoleLogs = [];
  const consoleErrors = [];
  const consoleWarnings = [];

  // Capture all console output
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    const timestamp = new Date().toISOString().substr(11, 12);

    if (type === 'error') {
      consoleErrors.push({ time: timestamp, text });
      console.log(`[${timestamp}] ERROR: ${text}`);
    } else if (type === 'warning') {
      consoleWarnings.push({ time: timestamp, text });
      console.log(`[${timestamp}] WARN: ${text}`);
    } else {
      consoleLogs.push({ time: timestamp, text });
      // Filter interesting logs
      if (text.includes('[') || text.includes('Tile') || text.includes('Page') ||
          text.includes('render') || text.includes('Inspector') || text.includes('Heal') ||
          text.includes('Auto')) {
        console.log(`[${timestamp}] ${text}`);
      }
    }
  });

  // Capture page errors
  page.on('pageerror', error => {
    const timestamp = new Date().toISOString().substr(11, 12);
    console.log(`[${timestamp}] PAGE ERROR: ${error.message}`);
    consoleErrors.push({ time: timestamp, text: error.message });
  });

  console.log('\n========================================');
  console.log('30-SECOND VISUAL INSPECTION TEST');
  console.log('Loading demo-1.pdf with debug mode');
  console.log('========================================\n');

  await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug=1');

  // Wait for initial load (5s)
  console.log('\n--- Phase 1: Initial load (0-5s) ---');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/demo-1-t05s.png' });

  // Check viewer state
  const viewerReady = await page.evaluate(() => {
    return {
      hasOSD: !!window.osdViewerRef,
      hasTileStreamer: !!window.tileStreamerRef,
      isReady: window.tileStreamerRef?.isReady || false,
      maxLevel: window.tileStreamerRef?.maxLevel || 'N/A',
      numPages: window.tileStreamerRef?.numPages || 'N/A'
    };
  });
  console.log('Viewer State:', JSON.stringify(viewerReady));

  // Phase 2: Click inspector buttons (5-10s)
  console.log('\n--- Phase 2: Inspector buttons (5-10s) ---');

  const inspectBtn = page.locator('button:has-text("Inspect")').first();
  if (await inspectBtn.isVisible()) {
    console.log('Clicking Inspect button...');
    await inspectBtn.click();
    await page.waitForTimeout(1000);
  }

  const visualBtn = page.locator('button:has-text("Visual")').first();
  if (await visualBtn.isVisible()) {
    console.log('Clicking Visual button...');
    await visualBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.screenshot({ path: 'test-results/demo-1-t10s.png' });

  // Get visual inspection result
  const visualResult = await page.evaluate(() => {
    if (!window.tileStreamerRef?.inspectVisual) return null;
    return window.tileStreamerRef.inspectVisual();
  });
  console.log('Visual Result:', JSON.stringify(visualResult));

  // Phase 3: Pan/zoom interactions (10-20s)
  console.log('\n--- Phase 3: Pan/zoom interactions (10-20s) ---');

  const viewer = page.locator('#osd-viewer');
  if (await viewer.isVisible()) {
    const box = await viewer.boundingBox();
    if (box) {
      // Pan 1
      console.log('Pan 1...');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2);
      await page.mouse.up();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/demo-1-t12s.png' });

      // Zoom in
      console.log('Zoom in...');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/demo-1-t14s-zoom.png' });

      // Pan 2
      console.log('Pan 2...');
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width / 2 - 100, box.y + box.height / 2 - 100);
      await page.mouse.up();
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/demo-1-t16s.png' });

      // Zoom out
      console.log('Zoom out...');
      await page.mouse.wheel(0, 200);
      await page.waitForTimeout(2000);
      await page.screenshot({ path: 'test-results/demo-1-t18s.png' });
    }
  }

  await page.screenshot({ path: 'test-results/demo-1-t20s.png' });

  // Phase 4: Try heal button (20-25s)
  console.log('\n--- Phase 4: Heal button test (20-25s) ---');

  const healBtn = page.locator('button:has-text("Heal")').first();
  if (await healBtn.isVisible()) {
    console.log('Clicking Heal button...');
    await healBtn.click();
    await page.waitForTimeout(3000);
  }
  await page.screenshot({ path: 'test-results/demo-1-t23s-heal.png' });

  // Final visual check
  const visualResult2 = await page.evaluate(() => {
    if (!window.tileStreamerRef?.inspectVisual) return null;
    return window.tileStreamerRef.inspectVisual();
  });
  console.log('Visual Result after heal:', JSON.stringify(visualResult2));

  // Phase 5: Final wait and observation (25-30s)
  console.log('\n--- Phase 5: Final observation (25-30s) ---');
  await page.waitForTimeout(5000);
  await page.screenshot({ path: 'test-results/demo-1-t30s-final.png' });

  // Final state check
  const finalState = await page.evaluate(() => {
    if (!window.tileStreamerRef) return null;
    const ts = window.tileStreamerRef;
    return {
      tileCacheSize: ts.tileCache?.cache?.size || 0,
      lowResPages: ts.pageStreamer?.lowResPageCache?.size || 0,
      highResPages: ts.pageStreamer?.highResPageCache?.size || 0,
      healingInProgress: ts.qualityInspector?._healingInProgress || false,
      lastRecreationTime: ts.qualityInspector?._lastRecreationTime || null
    };
  });

  // Summary
  console.log('\n========================================');
  console.log('SUMMARY');
  console.log('========================================');
  console.log(`Total console logs: ${consoleLogs.length}`);
  console.log(`Total warnings: ${consoleWarnings.length}`);
  console.log(`Total errors: ${consoleErrors.length}`);
  console.log('\nFinal State:', JSON.stringify(finalState, null, 2));

  // Show auto-inspector logs
  const autoInspectorLogs = consoleLogs.filter(l => l.text.includes('Auto-Inspector'));
  console.log(`\nAuto-Inspector logs: ${autoInspectorLogs.length}`);
  autoInspectorLogs.forEach(l => console.log(`  [${l.time}] ${l.text}`));

  // Show healing/cooldown logs
  const healingLogs = consoleLogs.filter(l =>
    l.text.includes('Healing') || l.text.includes('Heal') || l.text.includes('cooldown')
  );
  console.log(`\nHealing logs: ${healingLogs.length}`);
  healingLogs.forEach(l => console.log(`  [${l.time}] ${l.text}`));

  // Show errors
  if (consoleErrors.length > 0) {
    console.log('\nErrors:');
    consoleErrors.forEach(e => console.log(`  [${e.time}] ${e.text}`));
  }

  console.log('\nScreenshots saved to test-results/demo-1-*.png');
  console.log('Video will be saved to test-results/');

  // Assertions
  expect(viewerReady.hasOSD).toBe(true);
  expect(viewerReady.hasTileStreamer).toBe(true);
});
