/**
 * Comprehensive test for modal dimension detection
 * Tests with uniform PDF (demo-1) and mixed-dimension PDF (to be created)
 */

const { test, expect } = require('@playwright/test');

test('Modal detection with uniform PDF', async ({ page }) => {
  console.log('\n=== Modal Detection: Uniform PDF (demo-1.pdf) ===\n');

  const logs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[Modal Detection]') || text.includes('[Smart Scaling]')) {
      logs.push(text);
      console.log(text);
    }
  });

  await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

  // Wait for viewer
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  console.log('\n✓ Viewer ready\n');

  // Get modal detection results
  const result = await page.evaluate(() => {
    const pageStreamer = window.pageStreamerRef;
    const tileStreamer = window.tileStreamerRef;

    return {
      modalWidth: pageStreamer?.modalWidth,
      modalHeight: pageStreamer?.modalHeight,
      numPages: pageStreamer?.pdfDoc?.numPages,
      lowResCached: pageStreamer?.lowResPageCache?.size,
      highResCached: pageStreamer?.highResPageCache?.size,
      gridDimsWidth: tileStreamer?.gridDims?.pageWidth,
      gridDimsHeight: tileStreamer?.gridDims?.pageHeight,
    };
  });

  console.log('Results:');
  console.log(`  Modal dimensions: ${result.modalWidth}×${result.modalHeight}`);
  console.log(`  Grid dimensions: ${result.gridDimsWidth}×${result.gridDimsHeight}`);
  console.log(`  PDF pages: ${result.numPages}`);
  console.log(`  Low-res cached: ${result.lowResCached}/${result.numPages}`);
  console.log(`  High-res cached: ${result.highResCached}/${result.numPages}\n`);

  // Verify modal dimensions detected
  expect(result.modalWidth).toBeGreaterThan(0);
  expect(result.modalHeight).toBeGreaterThan(0);

  // Verify grid uses modal dimensions
  expect(result.gridDimsWidth).toBe(result.modalWidth);
  expect(result.gridDimsHeight).toBe(result.modalHeight);

  // For uniform PDF, no smart scaling should occur
  const scalingLogs = logs.filter(log => log.includes('[Smart Scaling]'));
  console.log(`Smart scaling events: ${scalingLogs.length}`);
  expect(scalingLogs.length).toBe(0); // Uniform PDF = no scaling needed

  console.log('✓ Modal detection working correctly for uniform PDF\n');
});
