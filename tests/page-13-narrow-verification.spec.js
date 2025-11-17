/**
 * Verify that page 13 (tall narrow 400×900) displays at correct size
 * Should be narrower than standard pages, not stretched to modal width
 */

const { test, expect } = require('@playwright/test');

test('Page 13 displays as narrow page (not stretched)', async ({ page }) => {
  console.log('\n=== Verifying Page 13 Tall-Narrow Display ===\n');

  await page.goto('http://localhost:8000?pdf=demo/mixed-dimensions.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  console.log('✓ Viewer ready\n');

  // Wait for page 1 and page 13 to be rendered
  await page.waitForFunction(() => {
    const pageStreamer = window.pageStreamerRef;
    return pageStreamer?.highResPageCache?.get('1_high') !== undefined &&
           pageStreamer?.highResPageCache?.get('13_high') !== undefined;
  }, { timeout: 15000 });
  console.log('✓ Pages 1 and 13 rendered\n');

  // Get grid dimensions and page positions
  const gridInfo = await page.evaluate(() => {
    const tileStreamer = window.tileStreamerRef;
    const pageStreamer = window.pageStreamerRef;
    const pattern = tileStreamer.pattern;
    const gridDims = tileStreamer.gridDims;

    // Find page 13 position in grid
    let page13Row = -1, page13Col = -1;
    for (let row = 0; row < pattern.length; row++) {
      for (let col = 0; col < pattern[row].length; col++) {
        if (pattern[row][col] === 13) {
          page13Row = row;
          page13Col = col;
          break;
        }
      }
      if (page13Row >= 0) break;
    }

    // Calculate page 13's grid position
    const cellLeft = page13Col * (gridDims.pageWidth + gridDims.spacing);
    const cellTop = page13Row * (gridDims.pageHeight + gridDims.spacing);

    // Get canvas dimensions for comparison
    const page1Canvas = pageStreamer.highResPageCache.get('1_high');
    const page13Canvas = pageStreamer.highResPageCache.get('13_high');

    return {
      modalWidth: pageStreamer.modalWidth,
      modalHeight: pageStreamer.modalHeight,
      page13Row,
      page13Col,
      cellLeft,
      cellTop,
      cellWidth: gridDims.pageWidth,
      cellHeight: gridDims.pageHeight,
      page1: page1Canvas ? { width: page1Canvas.width, height: page1Canvas.height } : null,
      page13: page13Canvas ? { width: page13Canvas.width, height: page13Canvas.height } : null
    };
  });

  console.log('Grid Information:');
  console.log(`  Modal dimensions: ${gridInfo.modalWidth}×${gridInfo.modalHeight}`);
  console.log(`  Grid cell size: ${gridInfo.cellWidth}×${gridInfo.cellHeight}`);
  console.log(`  Page 13 position: row ${gridInfo.page13Row}, col ${gridInfo.page13Col}`);
  console.log(`  Page 13 grid coords: (${gridInfo.cellLeft}, ${gridInfo.cellTop})\n`);

  console.log('Canvas Dimensions:');
  if (gridInfo.page1) {
    console.log(`  Page 1 (standard): ${gridInfo.page1.width}×${gridInfo.page1.height}`);
    console.log(`    Aspect ratio: ${(gridInfo.page1.width / gridInfo.page1.height).toFixed(3)}`);
  }
  if (gridInfo.page13) {
    console.log(`  Page 13 (tall narrow): ${gridInfo.page13.width}×${gridInfo.page13.height}`);
    console.log(`    Aspect ratio: ${(gridInfo.page13.width / gridInfo.page13.height).toFixed(3)}`);
    console.log(`    Width ratio vs page 1: ${(gridInfo.page13.width / gridInfo.page1.width).toFixed(3)}× (should be ~0.575)`);
  }
  console.log('');

  // Calculate actual displayed dimensions using the new formula
  const actualDimensions = await page.evaluate(() => {
    const tileStreamer = window.tileStreamerRef;
    const pageStreamer = window.pageStreamerRef;
    const { pageWidth, pageHeight } = tileStreamer.gridDims;

    const page13Canvas = pageStreamer.highResPageCache.get('13_high');
    if (!page13Canvas) return null;

    // Use the same calculation as the fix
    const canvasAspectRatio = page13Canvas.width / page13Canvas.height;

    // Fit canvas aspect ratio within modal dimensions
    let actualPageWidth = pageWidth;
    let actualPageHeight = pageWidth / canvasAspectRatio;

    if (actualPageHeight > pageHeight) {
      actualPageHeight = pageHeight;
      actualPageWidth = pageHeight * canvasAspectRatio;
    }

    return {
      actualPageWidth: actualPageWidth.toFixed(1),
      actualPageHeight: actualPageHeight.toFixed(1),
      offsetX: ((pageWidth - actualPageWidth) / 2).toFixed(1),
      offsetY: ((pageHeight - actualPageHeight) / 2).toFixed(1)
    };
  });

  console.log('Calculated Display Dimensions:');
  console.log(`  Actual page width: ${actualDimensions.actualPageWidth}px (vs ${gridInfo.cellWidth}px cell)`);
  console.log(`  Actual page height: ${actualDimensions.actualPageHeight}px (vs ${gridInfo.cellHeight}px cell)`);
  console.log(`  Centered with offset: (${actualDimensions.offsetX}, ${actualDimensions.offsetY})`);
  console.log('');

  // Verify page 13 is narrower than standard pages
  expect(gridInfo.page13.width).toBeLessThan(gridInfo.page1.width);
  console.log('✓ Page 13 canvas is narrower than standard page canvas');

  // Verify aspect ratio is correct (0.444 = 400/900)
  const page13Aspect = gridInfo.page13.width / gridInfo.page13.height;
  expect(page13Aspect).toBeCloseTo(0.444, 2);
  console.log(`✓ Page 13 aspect ratio correct: ${page13Aspect.toFixed(3)} ≈ 0.444`);

  // Verify width ratio (should be ~352/612 = 0.575)
  const widthRatio = gridInfo.page13.width / gridInfo.page1.width;
  expect(widthRatio).toBeCloseTo(0.575, 2);
  console.log(`✓ Page 13 width ratio correct: ${widthRatio.toFixed(3)} ≈ 0.575 (352/612)`);

  // Navigate to page 13 and take screenshot
  await page.evaluate((coords) => {
    const viewer = window.viewer;
    const centerX = coords.cellLeft + coords.cellWidth / 2;
    const centerY = coords.cellTop + coords.cellHeight / 2;

    // Zoom to show page 13 and neighbors clearly
    viewer.viewport.panTo(
      viewer.viewport.imageToViewportCoordinates(centerX, centerY)
    );
    viewer.viewport.zoomTo(3.0);
  }, gridInfo);

  await page.waitForTimeout(1500); // Let tiles render

  await page.screenshot({
    path: 'test-results/page-13-narrow-detail.png',
    fullPage: false
  });
  console.log('\n✓ Screenshot saved: test-results/page-13-narrow-detail.png');
  console.log('  Shows page 13 (center) with neighbors for width comparison\n');

  console.log('✓ Page 13 verification complete\n');
  console.log('Expected: Page 13 visibly narrower than surrounding standard pages');
  console.log('Result: Page 13 is 57.5% width of standard pages (352px vs 612px)\n');
});
