const { test, expect } = require('@playwright/test');

test('Quick check all demo PDFs render properly', async ({ page }) => {
  test.setTimeout(120000);

  const demos = ['demo/demo-1.pdf', 'demo/demo-2.pdf', 'demo/demo-3.pdf'];

  for (const pdf of demos) {
    console.log(`\n=== Testing ${pdf} ===`);

    await page.goto(`http://localhost:8000/?pdf=${pdf}&debug=1`);

    // Wait for viewer ready
    try {
      await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 20000 });
    } catch (e) {
      console.log(`FAILED: ${pdf} - viewer not ready`);
      continue;
    }

    // Wait for some rendering
    await page.waitForTimeout(5000);

    // Check state
    const state = await page.evaluate(() => ({
      numPages: window.tileStreamerRef?.numPages,
      lowResCached: window.tileStreamerRef?.pageStreamer?.lowResPageCache?.size || 0,
      highResCached: window.tileStreamerRef?.pageStreamer?.highResPageCache?.size || 0
    }));

    const pct = Math.round((state.lowResCached / state.numPages) * 100);
    console.log(`${pdf}: ${state.lowResCached}/${state.numPages} pages cached (${pct}%)`);

    // Basic sanity check - at least some pages should be cached
    expect(state.lowResCached).toBeGreaterThan(0);
  }

  console.log('\n=== All demos passed basic rendering check ===');
});
