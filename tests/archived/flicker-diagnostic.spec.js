const { test, expect } = require('@playwright/test');

test('flicker diagnostic - marie-neurath.pdf (scaled back)', async ({ page }) => {
  test.setTimeout(90000);

  const logs = {
    resets: [],
    redraws: [],
    recreations: [],
    pageRenders: [],
    timeouts: [],
    errors: []
  };

  page.on('console', msg => {
    const text = msg.text();

    if (text.includes('TiledImage reset')) {
      logs.resets.push(text);
    }
    if (text.includes('forceRedraw') || text.includes('Forcing tile redraw')) {
      logs.redraws.push(text);
    }
    if (text.includes('TiledImage recreat') || text.includes('Recreating TiledImage')) {
      logs.recreations.push(text);
    }
    if (text.includes('RENDERED') || text.includes('[PageStreamer]')) {
      logs.pageRenders.push(text);
    }
    if (text.includes('TIMEOUT')) {
      logs.timeouts.push(text);
    }
    if (msg.type() === 'error') {
      logs.errors.push(text);
    }
  });

  // Load marie-neurath.pdf
  await page.goto('http://localhost:8000/?pdf=marie-neurath.pdf&debug=1');

  // Wait for initial load
  await page.waitForTimeout(5000);

  // Check initial state
  const initialState = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const ps = ts?.pageStreamer;
    return {
      hasTileStreamer: !!ts,
      hasPageStreamer: !!ps,
      lowResCached: ps?.lowResPageCache?.size || 0,
      highResCached: ps?.highResPageCache?.size || 0,
      numPages: ts?.numPages || 0
    };
  });

  console.log('\n=== INITIAL STATE (5s) ===');
  console.log(JSON.stringify(initialState, null, 2));

  // Wait for background rendering with reduced batch size
  await page.waitForTimeout(20000);

  // Zoom in to trigger on-demand rendering
  console.log('\n=== ZOOMING IN ===');
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.zoomBy(2);
      }
    });
    await page.waitForTimeout(2000);
  }

  // Wait for on-demand renders
  await page.waitForTimeout(10000);

  // Summary
  console.log('\n=== SCALED-BACK FLICKER DIAGNOSTIC SUMMARY ===');
  console.log(`TiledImage resets: ${logs.resets.length}`);
  console.log(`forceRedraw calls: ${logs.redraws.length}`);
  console.log(`TiledImage recreations: ${logs.recreations.length}`);
  console.log(`PageStreamer TIMEOUTS: ${logs.timeouts.length}`);
  console.log(`Errors: ${logs.errors.length}`);

  if (logs.timeouts.length > 0) {
    console.log('\n=== TIMEOUT DETAILS ===');
    logs.timeouts.forEach(t => console.log(`  ${t}`));
  }

  if (logs.recreations.length > 0) {
    console.log('\n=== RECREATION DETAILS ===');
    logs.recreations.forEach(r => console.log(`  ${r}`));
  }

  if (logs.resets.length > 0) {
    console.log('\n=== RESET DETAILS ===');
    logs.resets.slice(0, 5).forEach(r => console.log(`  ${r}`));
    if (logs.resets.length > 5) {
      console.log(`  ... and ${logs.resets.length - 5} more`);
    }
  }

  if (logs.errors.length > 0) {
    console.log('\n=== ERRORS ===');
    logs.errors.forEach(e => console.log(`  ${e}`));
  }

  // Final state
  const finalState = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const ps = ts?.pageStreamer;
    return {
      lowResCached: ps?.lowResPageCache?.size || 0,
      highResCached: ps?.highResPageCache?.size || 0,
      tileCacheSize: ts?.tileCache?.cache?.size || 0,
      renderingInProgress: ps?.renderingInProgress?.size || 0
    };
  });

  console.log('\n=== FINAL STATE ===');
  console.log(JSON.stringify(finalState, null, 2));

  // Check improvements
  console.log('\n=== EXPECTED IMPROVEMENTS ===');
  console.log(`- Timeouts should be 0 (was 24 with 10s timeout)`);
  console.log(`- Resets should be 0 (disabled _scheduleReset)`);
  console.log(`- Recreations should be reduced (only final recreation kept)`);

  expect(logs.timeouts.length).toBe(0);
});
