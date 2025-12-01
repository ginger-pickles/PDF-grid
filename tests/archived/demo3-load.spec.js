const { test, expect } = require('@playwright/test');

test.describe('Demo-3 PDF Load Test', () => {
  test('load demo-3.pdf and render for 60 seconds', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes

    console.log('\n=== Loading demo/demo-3.pdf ===\n');

    // Load the PDF
    await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf&debug=1', {
      waitUntil: 'networkidle'
    });

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.osdViewerRef !== undefined, { timeout: 10000 });
    console.log('Viewer initialized');

    // Get PDF info from actual global refs
    const pdfInfo = await page.evaluate(() => {
      return {
        numPages: window.pageStreamerRef?.pdfDoc?.numPages || 0,
        hasPageStreamer: window.pageStreamerRef !== undefined,
        hasTileStreamer: window.tileStreamerRef !== undefined
      };
    });

    console.log(`PDF has ${pdfInfo.numPages} pages`);
    console.log(`PageStreamer initialized: ${pdfInfo.hasPageStreamer}`);
    console.log(`TileStreamer initialized: ${pdfInfo.hasTileStreamer}`);
    expect(pdfInfo.numPages).toBeGreaterThan(0);

    // Let it render for 60 seconds while external script monitors memory
    console.log('Rendering for 60 seconds...');
    await page.waitForTimeout(60000);

    // Check final state
    const finalStats = await page.evaluate(() => {
      const lowResCache = window.pageStreamerRef?.decodedImageCache?.cache?.size || 0;
      const highResCache = window.pageStreamerRef?.highResImageCache?.cache?.size || 0;
      return {
        lowResCache,
        highResCache,
        totalCached: lowResCache + highResCache
      };
    });

    console.log(`\nFinal stats:`);
    console.log(`  Low-res cache: ${finalStats.lowResCache} images`);
    console.log(`  High-res cache: ${finalStats.highResCache} images`);
    console.log(`  Total cached: ${finalStats.totalCached} images`);

    // Don't fail the test - the goal is to measure memory, not verify caching
    console.log('\n✓ Test complete - Memory test ran for 60 seconds\n');
  });
});
