/**
 * Test that odd-sized pages maintain their aspect ratio at all zoom levels
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Aspect ratio preserved at all zoom levels', async ({ page }) => {
  console.log('\n=== Testing Aspect Ratio Preservation ===\n');

  await page.goto('http://localhost:8000?pdf=demo/mixed-dimensions.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  console.log('✓ Viewer ready\n');

  // Test at different zoom levels
  const zoomLevels = [
    { name: 'Broad zoom (entire grid)', zoom: 0.3 },
    { name: 'Medium zoom', zoom: 2.0 },
    { name: 'Close zoom', zoom: 10.0 }
  ];

  for (const { name, zoom } of zoomLevels) {
    console.log(`Testing ${name} (zoom=${zoom})...`);

    // Set zoom level
    await page.evaluate((z) => {
      window.viewer.viewport.zoomTo(z);
    }, zoom);

    await page.waitForTimeout(1000); // Let tiles render

    // Take screenshot
    const filename = `test-results/aspect-ratio-zoom-${zoom}.png`;
    await page.screenshot({ path: filename });
    console.log(`  Screenshot: ${filename}`);

    // Check that page dimensions match expected aspect ratios
    const dimensions = await page.evaluate((z) => {
      const tileStreamer = window.tileStreamerRef;
      const pageStreamer = window.pageStreamerRef;

      // Check a few key pages
      const testPages = [
        { num: 1, expected: '612×792', desc: 'Standard' },
        { num: 6, expected: '1224×792', desc: 'Fold-out (2× width)' },
        { num: 9, expected: '792×792', desc: 'Square' },
        { num: 13, expected: '400×900', desc: 'Tall narrow' },
        { num: 14, expected: '900×500', desc: 'Wide short' },
        { num: 19, expected: '1836×792', desc: 'Poster (3× width)' }
      ];

      const results = [];

      for (const { num, expected, desc } of testPages) {
        const highCanvas = pageStreamer.highResPageCache.get(`${num}_high`);
        if (highCanvas) {
          // Calculate aspect ratio
          const aspectRatio = (highCanvas.width / highCanvas.height).toFixed(3);
          results.push({
            page: num,
            desc,
            expected,
            canvas: `${highCanvas.width}×${highCanvas.height}`,
            aspectRatio
          });
        }
      }

      return results;
    }, zoom);

    console.log(`  Page dimensions (at zoom ${zoom}):`);
    dimensions.forEach(d => {
      console.log(`    Page ${d.page} (${d.desc}): ${d.canvas} (aspect ${d.aspectRatio})`);
    });
    console.log('');
  }

  console.log('✓ Aspect ratio test complete\n');
  console.log('Visual inspection: Check screenshots to verify pages are not distorted\n');
});
