/**
 * Verify canvas sizes directly to check if smart scaling occurred
 */

const { test, expect } = require('@playwright/test');

test('Verify canvas dimensions for mixed-size PDF', async ({ page }) => {
  console.log('\n=== Verifying Canvas Dimensions ===\n');

  await page.goto('http://localhost:8000?pdf=demo/mixed-dimensions.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

  // Get canvas dimensions for all pages
  const canvasDimensions = await page.evaluate(() => {
    const pageStreamer = window.pageStreamerRef;
    const results = [];

    // Check low-res cache
    for (let i = 1; i <= 10; i++) {
      const key = `${i}_low`;
      const canvas = pageStreamer.lowResPageCache.get(key);
      if (canvas) {
        results.push({
          page: i,
          resolution: 'low',
          width: canvas.width,
          height: canvas.height
        });
      }
    }

    // Check high-res cache
    for (let i = 1; i <= 10; i++) {
      const key = `${i}_high`;
      const canvas = pageStreamer.highResPageCache.get(key);
      if (canvas) {
        results.push({
          page: i,
          resolution: 'high',
          width: canvas.width,
          height: canvas.height
        });
      }
    }

    return {
      results,
      modalWidth: pageStreamer.modalWidth,
      modalHeight: pageStreamer.modalHeight
    };
  });

  console.log(`Modal dimensions: ${canvasDimensions.modalWidth}×${canvasDimensions.modalHeight}\n`);
  console.log('Canvas Dimensions:');

  // Expected dimensions at scale 1.0 (high-res) for modal 612×792:
  // - Standard pages (612×792): 612×792
  // - Page 6 (1224×792): should be scaled to ~612×396 (maintaining aspect ratio)
  // - Page 9 (792×792): should be scaled to ~612×612 (maintaining aspect ratio)

  const highRes = canvasDimensions.results.filter(r => r.resolution === 'high');
  highRes.forEach(r => {
    console.log(`  Page ${r.page} (high-res): ${r.width}×${r.height}`);
  });

  // Find pages 6 and 9
  const page6 = highRes.find(r => r.page === 6);
  const page9 = highRes.find(r => r.page === 9);
  const page1 = highRes.find(r => r.page === 1);

  console.log('\nAnalysis:');
  if (page1) {
    console.log(`  Page 1 (standard): ${page1.width}×${page1.height}`);
  }
  if (page6) {
    console.log(`  Page 6 (fold-out): ${page6.width}×${page6.height}`);
    const scaleFactor = page6.width / 1224;
    console.log(`    Scale factor: ${scaleFactor.toFixed(3)}× (should be ~0.5 to fit 612px width)`);
  }
  if (page9) {
    console.log(`  Page 9 (square): ${page9.width}×${page9.height}`);
    const scaleFactor = page9.width / 792;
    console.log(`    Scale factor: ${scaleFactor.toFixed(3)}× (should be ~0.77 to fit 612px width)`);
  }

  console.log('\n');
});
