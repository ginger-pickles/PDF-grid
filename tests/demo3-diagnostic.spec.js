const { test, expect } = require('@playwright/test');

test('demo-3.pdf diagnostic - first page not rendering, stalls at 38%', async ({ page }) => {
  test.setTimeout(120000);

  const consoleLogs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ type: msg.type(), text });
    // Log key events
    if (text.includes('Page') || text.includes('render') || text.includes('error') ||
        text.includes('Error') || text.includes('stall') || text.includes('timeout') ||
        text.includes('TiledImage') || text.includes('CacheManager') ||
        text.includes('%') || text.includes('progress')) {
      console.log(`[${msg.type()}] ${text}`);
    }
  });

  page.on('pageerror', error => {
    errors.push(error.message);
    console.log('[PAGE ERROR]', error.message);
  });

  console.log('=== Loading demo-3.pdf with debug mode ===');
  await page.goto('http://localhost:8000/?pdf=demo/demo-3.pdf&debug=1');

  // Wait for initial load
  console.log('Waiting for tileStreamerRef.maxLevel > 0...');
  try {
    await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 30000 });
    console.log('TileStreamer is ready!');
  } catch (e) {
    console.log('Timeout waiting for TileStreamer:', e.message);

    const state = await page.evaluate(() => ({
      hasTileStreamer: !!window.tileStreamerRef,
      hasPageStreamer: !!window.pageStreamerRef,
      hasOSD: !!window.osdViewerRef
    }));
    console.log('State at timeout:', JSON.stringify(state, null, 2));
  }

  // Get PDF info
  const pdfInfo = await page.evaluate(() => ({
    numPages: window.tileStreamerRef?.numPages,
    maxLevel: window.tileStreamerRef?.maxLevel,
    pdfDocExists: !!window.tileStreamerRef?.pageStreamer?.pdfDoc
  }));
  console.log('\n=== PDF Info ===');
  console.log(JSON.stringify(pdfInfo, null, 2));

  // Monitor progress over time
  console.log('\n=== Monitoring rendering progress ===');
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(2000);

    const state = await page.evaluate(() => {
      const ps = window.tileStreamerRef?.pageStreamer;
      return {
        lowResCached: ps?.lowResPageCache?.size || 0,
        highResCached: ps?.highResPageCache?.size || 0,
        renderingInProgress: ps?.renderingInProgress?.size || 0,
        currentlyRendering: ps?.renderingInProgress ? Array.from(ps.renderingInProgress.keys()).slice(0, 5) : [],
        numPages: window.tileStreamerRef?.numPages || 0
      };
    });

    const pct = state.numPages > 0 ? Math.round((state.lowResCached / state.numPages) * 100) : 0;
    console.log(`[T+${(i+1)*2}s] Progress: ${pct}% (${state.lowResCached}/${state.numPages} pages), highRes=${state.highResCached}, rendering=${state.renderingInProgress}, current=${JSON.stringify(state.currentlyRendering)}`);

    // Check if page 1 specifically is in cache
    const page1Status = await page.evaluate(() => {
      const ps = window.tileStreamerRef?.pageStreamer;
      return {
        page1LowRes: ps?.lowResPageCache?.has(1) || false,
        page1HighRes: ps?.highResPageCache?.has(1) || false,
        page1Rendering: ps?.renderingInProgress?.has('1-low') || ps?.renderingInProgress?.has('1-high') || false
      };
    });
    console.log(`  Page 1: lowRes=${page1Status.page1LowRes}, highRes=${page1Status.page1HighRes}, rendering=${page1Status.page1Rendering}`);

    // Stop if we reach the stall point or complete
    if (state.lowResCached === state.numPages) {
      console.log('All pages rendered!');
      break;
    }

    // Check for stall - same progress for 3 checks
    if (i >= 2 && pct === 38) {
      console.log('Detected 38% stall - investigating...');

      // Try to manually render page 1
      const manualResult = await page.evaluate(async () => {
        const ps = window.tileStreamerRef?.pageStreamer;
        if (!ps?.pdfDoc) return { error: 'No pdfDoc' };

        try {
          console.log('[Manual] Attempting to render page 1...');
          const result = await ps.renderPage(1, 'low');
          return { success: true, hasResult: !!result };
        } catch (e) {
          return { error: e.message, stack: e.stack };
        }
      });
      console.log('Manual page 1 render result:', JSON.stringify(manualResult));
    }
  }

  // Final state
  const finalState = await page.evaluate(() => {
    const ps = window.tileStreamerRef?.pageStreamer;
    const cachedPages = ps?.lowResPageCache ? Array.from(ps.lowResPageCache.keys()).sort((a,b) => a-b) : [];
    return {
      lowResCached: ps?.lowResPageCache?.size || 0,
      highResCached: ps?.highResPageCache?.size || 0,
      numPages: window.tileStreamerRef?.numPages || 0,
      cachedPageNumbers: cachedPages.slice(0, 20),
      missingFirstFew: [1,2,3,4,5].filter(p => !cachedPages.includes(p))
    };
  });
  console.log('\n=== Final State ===');
  console.log(JSON.stringify(finalState, null, 2));

  // Check for errors
  console.log('\n=== Errors collected ===');
  console.log(errors.length > 0 ? errors : 'No page errors');

  const consoleErrors = consoleLogs.filter(l => l.type === 'error');
  console.log('\n=== Console errors ===');
  consoleErrors.forEach(e => console.log(e.text));

  await page.screenshot({ path: 'test-results/demo3-diagnostic.png', fullPage: true });
});
