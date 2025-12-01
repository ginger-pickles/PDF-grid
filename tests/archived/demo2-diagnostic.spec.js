const { test, expect } = require('@playwright/test');

test('demo-2.pdf diagnostic - why no pages rendering', async ({ page }) => {
  test.setTimeout(90000);

  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    console.log(`[${msg.type()}] ${text}`);
  });

  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('[PAGE ERROR]', error.message);
  });

  console.log('=== Loading demo-2.pdf with debug mode ===');
  await page.goto('http://localhost:8000/?pdf=demo/demo-2.pdf&debug=1');

  // Wait for viewer to be ready
  console.log('Waiting for tileStreamerRef.maxLevel > 0...');
  try {
    await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 20000 });
    console.log('TileStreamer is ready!');
  } catch (e) {
    console.log('Timeout waiting for TileStreamer:', e.message);

    // Check what state we're in
    const state = await page.evaluate(() => ({
      hasTileStreamer: !!window.tileStreamerRef,
      hasPageStreamer: !!window.pageStreamerRef,
      hasOSD: !!window.osdViewerRef,
      viewerElement: !!document.getElementById('openseadragon-viewer'),
      osdViewerElement: !!document.getElementById('osd-viewer')
    }));
    console.log('State at timeout:', JSON.stringify(state, null, 2));
    return;
  }

  // Check initial state
  const initialState = await page.evaluate(() => ({
    numPages: window.tileStreamerRef?.numPages,
    maxLevel: window.tileStreamerRef?.maxLevel,
    lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size || 0,
    highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size || 0,
    pdfDocExists: !!window.tileStreamerRef?.pageStreamer?.pdfDoc,
    pageStreamerExists: !!window.tileStreamerRef?.pageStreamer
  }));
  console.log('\n=== Initial State ===');
  console.log(JSON.stringify(initialState, null, 2));

  // Wait a bit for background rendering
  console.log('\nWaiting 5 seconds for background rendering...');
  await page.waitForTimeout(5000);

  // Check state again
  const afterWait = await page.evaluate(() => ({
    lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size || 0,
    highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size || 0,
    decodedCached: window.tileStreamerRef?.pageStreamer?.decodedImageCache?.size || 0,
    renderingInProgress: window.tileStreamerRef?.pageStreamer?.renderingInProgress?.size || 0
  }));
  console.log('\n=== After 5 seconds ===');
  console.log(JSON.stringify(afterWait, null, 2));

  // Try to manually render a page
  console.log('\n=== Manual renderPage test ===');
  const manualRender = await page.evaluate(async () => {
    const ps = window.tileStreamerRef?.pageStreamer;
    if (!ps) return { error: 'No pageStreamer' };
    if (!ps.pdfDoc) return { error: 'No pdfDoc on pageStreamer' };

    try {
      console.log('[Manual] Calling renderPage(1, "low")...');
      const result = await ps.renderPage(1, 'low');
      return {
        success: true,
        resultType: typeof result,
        isImage: result instanceof Image,
        hasResult: !!result
      };
    } catch (e) {
      return { error: e.message };
    }
  });
  console.log(JSON.stringify(manualRender, null, 2));

  // Check cache after manual render
  const afterManual = await page.evaluate(() => ({
    lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size || 0,
    highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size || 0
  }));
  console.log('\n=== After manual render ===');
  console.log(JSON.stringify(afterManual, null, 2));

  // Check if there are any errors
  console.log('\n=== Errors collected ===');
  console.log(errors.length > 0 ? errors : 'No page errors');

  // Check console for errors
  const consoleErrors = consoleLogs.filter(l => l.type === 'error');
  console.log('\n=== Console errors ===');
  console.log(consoleErrors.length > 0 ? consoleErrors : 'No console errors');

  await page.screenshot({ path: 'test-results/demo2-diagnostic.png' });
});
