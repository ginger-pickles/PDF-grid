/**
 * L0 Tile Examination Test
 * Directly examines the L0 tile content to verify page rendering
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');

test('Examine L0 tile content', async ({ page }) => {
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
  await page.waitForTimeout(3000);

  // Force L0 tile generation and extract the actual tile image
  const tileData = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const gridDims = ts.gridDims;

    // Get L0 scale
    const l0Scale = Math.pow(2, 0 - ts.maxLevel);

    // Calculate expected positions of page 1 on the L0 tile
    // Page 1 is at row 2, col 0 in a 5x5 staggered pattern (0-indexed from top-left visible)
    // Actually need to find it in the pattern
    let page1Row = -1, page1Col = -1;
    for (let r = 0; r < ts.pattern.length; r++) {
      for (let c = 0; c < ts.pattern[r].length; c++) {
        if (ts.pattern[r][c] === 1) {
          page1Row = r;
          page1Col = c;
          break;
        }
      }
      if (page1Row >= 0) break;
    }

    // Calculate page 1 position in grid coordinates
    const page1Left = page1Col * (gridDims.pageWidth + gridDims.spacing);
    const page1Top = page1Row * (gridDims.pageHeight + gridDims.spacing);

    // Position on L0 tile (in tile pixels)
    const page1LeftOnTile = page1Left * l0Scale;
    const page1TopOnTile = page1Top * l0Scale;
    const pageWidthOnTile = gridDims.pageWidth * l0Scale;
    const pageHeightOnTile = gridDims.pageHeight * l0Scale;

    // Now regenerate the L0 tile and get its data URL
    const tileGenerator = ts.tileGenerator;
    const dataUrl = tileGenerator.generateTile(0, 0, 0);

    return {
      l0Scale,
      maxLevel: ts.maxLevel,
      tileSize: ts.tileWidth,
      gridDims: {
        pageWidth: gridDims.pageWidth,
        pageHeight: gridDims.pageHeight,
        totalWidth: gridDims.totalWidth,
        totalHeight: gridDims.totalHeight,
        spacing: gridDims.spacing,
      },
      page1: {
        row: page1Row,
        col: page1Col,
        gridLeft: page1Left,
        gridTop: page1Top,
        tileLeft: page1LeftOnTile,
        tileTop: page1TopOnTile,
        tileWidth: pageWidthOnTile,
        tileHeight: pageHeightOnTile,
      },
      dataUrl: dataUrl,
      dataUrlLength: dataUrl?.length || 0,
    };
  });

  console.log('\n=== L0 TILE EXAMINATION ===');
  console.log('Max level:', tileData.maxLevel);
  console.log('L0 scale:', tileData.l0Scale.toExponential(4));
  console.log('Tile size:', tileData.tileSize, 'px');
  console.log('\nGrid dimensions:');
  console.log('  Page:', tileData.gridDims.pageWidth, '×', tileData.gridDims.pageHeight);
  console.log('  Total:', tileData.gridDims.totalWidth, '×', tileData.gridDims.totalHeight);
  console.log('  Spacing:', tileData.gridDims.spacing);
  console.log('\nPage 1 position:');
  console.log('  Pattern location: row', tileData.page1.row, ', col', tileData.page1.col);
  console.log('  Grid coords:', tileData.page1.gridLeft, ',', tileData.page1.gridTop);
  console.log('  On L0 tile:', tileData.page1.tileLeft.toFixed(1), ',', tileData.page1.tileTop.toFixed(1));
  console.log('  Size on L0 tile:', tileData.page1.tileWidth.toFixed(1), '×', tileData.page1.tileHeight.toFixed(1), 'px');
  console.log('\nData URL length:', tileData.dataUrlLength);

  // Save the L0 tile as an image
  if (tileData.dataUrl && tileData.dataUrl.startsWith('data:image')) {
    const base64Data = tileData.dataUrl.split(',')[1];
    const buffer = Buffer.from(base64Data, 'base64');
    fs.writeFileSync('test-results/l0-tile-raw.jpg', buffer);
    console.log('\nSaved: test-results/l0-tile-raw.jpg (the actual L0 tile image)');
  }

  // Also get info about what canvases are being used
  const canvasInfo = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    const pageStreamer = ts.pageStreamer;

    // Get low-res canvas for page 1
    const lowResCanvas = pageStreamer.lowResPageCache.get('1_low');
    // Get high-res canvas for page 1
    const highResCanvas = pageStreamer.highResPageCache.get('1_high');

    return {
      lowRes: lowResCanvas ? {
        width: lowResCanvas.width,
        height: lowResCanvas.height,
      } : null,
      highRes: highResCanvas ? {
        width: highResCanvas.width,
        height: highResCanvas.height,
      } : null,
      lowResScale: window.CONFIG?.PDF_LOWRES_SCALE,
      highResScale: window.CONFIG?.PDF_RENDER_SCALE,
    };
  });

  console.log('\n=== PAGE CANVAS INFO ===');
  console.log('Low-res scale:', canvasInfo.lowResScale);
  console.log('High-res scale:', canvasInfo.highResScale);
  if (canvasInfo.lowRes) {
    console.log('Low-res page 1 canvas:', canvasInfo.lowRes.width, '×', canvasInfo.lowRes.height, 'px');
  } else {
    console.log('Low-res page 1: NOT CACHED');
  }
  if (canvasInfo.highRes) {
    console.log('High-res page 1 canvas:', canvasInfo.highRes.width, '×', canvasInfo.highRes.height, 'px');
  } else {
    console.log('High-res page 1: NOT CACHED');
  }

  // Calculate expected canvas sizes
  const expectedHighResWidth = tileData.gridDims.pageWidth; // Should equal grid pageWidth
  const expectedLowResWidth = Math.round(tileData.gridDims.pageWidth * (canvasInfo.lowResScale / canvasInfo.highResScale));

  console.log('\nExpected canvas widths:');
  console.log('  High-res:', expectedHighResWidth, 'px');
  console.log('  Low-res:', expectedLowResWidth, 'px');

  // The key calculation: canvasToGridRatio
  if (canvasInfo.lowRes) {
    const canvasToGridRatio = canvasInfo.lowRes.width / tileData.gridDims.pageWidth;
    console.log('\ncanvasToGridRatio (low-res):', canvasToGridRatio.toFixed(4));
    console.log('  (should be', (canvasInfo.lowResScale / canvasInfo.highResScale).toFixed(4), ')');
  }

  expect(tileData.dataUrlLength).toBeGreaterThan(1000); // Should have actual image data
});
