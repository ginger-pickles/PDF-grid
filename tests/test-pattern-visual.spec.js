// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Feedback-Control Visual Test
 *
 * Uses the test pattern PDF as the TRUTH SIGNAL:
 * 1. Render PDF page directly with PDF.js → reference (truth)
 * 2. Capture what viewer displays → measurement
 * 3. Compare → error signal
 *
 * The test pattern IS the specification - no hardcoded expectations.
 */

test.describe('Visual Verification', () => {

  test('Feedback-control: compare viewer output against PDF reference', async ({ page }) => {

    // === HELPERS ===
    function rgbToHsv(r, g, b) {
      r /= 255; g /= 255; b /= 255;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const d = max - min;
      let h = 0, s = max === 0 ? 0 : d / max, v = max;
      if (d !== 0) {
        switch (max) {
          case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
          case g: h = ((b - r) / d + 2) / 6; break;
          case b: h = ((r - g) / d + 4) / 6; break;
        }
      }
      return { h: h * 360, s, v };
    }

    function colorDistance(rgb1, rgb2) {
      // Euclidean distance in RGB space (0-441 range)
      const dr = rgb1.r - rgb2.r;
      const dg = rgb1.g - rgb2.g;
      const db = rgb1.b - rgb2.b;
      return Math.sqrt(dr*dr + dg*dg + db*db);
    }

    // === SETUP ===
    console.log('\n========== FEEDBACK-CONTROL VISUAL TEST ==========\n');

    await page.goto('http://localhost:8000/?pdf=demo/test-pattern.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => {
      return window.viewer?.world?.getItemCount() > 0;
    }, { timeout: 15000 });

    // Wait for tiles to load
    await page.waitForFunction(() => {
      return (window.tileStreamerRef?.pendingJobs?.size || 0) === 0;
    }, { timeout: 10000 });
    await page.waitForTimeout(500);

    // Get canvas info
    const canvasSize = await page.evaluate(() => {
      const c = document.querySelector('.openseadragon-canvas canvas');
      return c ? { w: c.width, h: c.height } : { w: 0, h: 0 };
    });
    console.log(`Viewer canvas: ${canvasSize.w}x${canvasSize.h}`);

    // === PHASE 1: GENERATE TRUTH SIGNAL ===
    // Render a single PDF page directly using PDF.js as reference
    console.log('\n=== PHASE 1: GENERATE TRUTH SIGNAL ===');
    console.log('Rendering PDF page directly with PDF.js as reference...\n');

    const testPageNum = 1; // Use page 1 (30° hue - orange/red) - top-left of grid

    // Debug: Check the scale configuration
    const scaleInfo = await page.evaluate(() => {
      return {
        PDF_RENDER_SCALE: CONFIG.PDF_RENDER_SCALE,
        PDF_LOWRES_SCALE: CONFIG.PDF_LOWRES_SCALE,
        gridDims: window.tileStreamerRef?.gridDims,
        lowResPageSize: window.pageStreamerRef?.lowResPageCache?.size || 0,
        highResPageSize: window.pageStreamerRef?.highResPageCache?.size || 0,
      };
    });
    console.log(`\nScale config: render=${scaleInfo.PDF_RENDER_SCALE}x, lowres=${scaleInfo.PDF_LOWRES_SCALE}x`);
    console.log(`Grid pageWidth: ${scaleInfo.gridDims?.pageWidth}, pageHeight: ${scaleInfo.gridDims?.pageHeight}`);
    console.log(`Cached pages: lowRes=${scaleInfo.lowResPageSize}, highRes=${scaleInfo.highResPageSize}`);

    const truthData = await page.evaluate(async (pageNum) => {
      // Get the PDF document
      const pdfDoc = window.pdfDoc;
      if (!pdfDoc) throw new Error('PDF not loaded');

      // Render page to a reference canvas
      const pdfPage = await pdfDoc.getPage(pageNum);
      const scale = 1.0; // Use same scale as CONFIG.PDF_RENDER_SCALE
      const viewport = pdfPage.getViewport({ scale });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d');

      await pdfPage.render({
        canvasContext: ctx,
        viewport: viewport
      }).promise;

      // Sample center only - the large black page number is a solid area
      // that won't blend at low resolution (unlike striped patterns)
      const samplePoints = [
        { name: 'center', nx: 0.5, ny: 0.5 },  // Center - should show black page number
      ];

      // Sample colors from reference canvas
      const samples = [];
      for (const sp of samplePoints) {
        const x = Math.floor(sp.nx * canvas.width);
        const y = Math.floor(sp.ny * canvas.height);
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        samples.push({
          name: sp.name,
          nx: sp.nx,
          ny: sp.ny,
          rgb: { r: pixel[0], g: pixel[1], b: pixel[2] }
        });
      }

      // Cleanup
      if (pdfPage.cleanup) pdfPage.cleanup();

      return {
        pageNum,
        width: canvas.width,
        height: canvas.height,
        samples
      };
    }, testPageNum);

    console.log(`Truth signal: Page ${truthData.pageNum}, ${truthData.width}x${truthData.height}px`);
    console.log('Reference samples:');
    for (const s of truthData.samples) {
      const hsv = rgbToHsv(s.rgb.r, s.rgb.g, s.rgb.b);
      console.log(`  ${s.name.padEnd(8)}: RGB(${s.rgb.r},${s.rgb.g},${s.rgb.b}) → H=${hsv.h.toFixed(0)}° S=${hsv.s.toFixed(2)} V=${hsv.v.toFixed(2)}`);
    }

    // === PHASE 2: CAPTURE MEASUREMENT SIGNAL ===
    // Position viewer to show the test page, then sample same points
    console.log('\n=== PHASE 2: CAPTURE MEASUREMENT SIGNAL ===');
    console.log('Positioning viewer on test page and sampling...\n');

    // Get page position in viewport coordinates
    const pageInfo = await page.evaluate((pageNum) => {
      const ts = window.tileStreamerRef;
      const gridDims = ts.gridDims;
      const pattern = ts.pattern;
      const scale = 1 / gridDims.totalWidth;
      const cellWidth = gridDims.pageWidth + gridDims.spacing;
      const cellHeight = gridDims.pageHeight + gridDims.spacing;

      // Find page position
      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < pattern[row].length; col++) {
          if (pattern[row][col] === pageNum) {
            const x = (col * cellWidth + cellWidth / 2) * scale;
            const y = (row * cellHeight + cellHeight / 2) * scale;
            const w = gridDims.pageWidth * scale;
            const h = gridDims.pageHeight * scale;
            return { row, col, x, y, w, h, left: x - w/2, top: y - h/2 };
          }
        }
      }
      return null;
    }, testPageNum);

    if (!pageInfo) {
      throw new Error(`Page ${testPageNum} not found in grid`);
    }

    console.log(`Page ${testPageNum} at row ${pageInfo.row}, col ${pageInfo.col}`);
    console.log(`Viewport coords: center=(${pageInfo.x.toFixed(3)}, ${pageInfo.y.toFixed(3)}), size=${pageInfo.w.toFixed(4)}x${pageInfo.h.toFixed(4)}`);

    // Debug: Check actual page canvas dimensions at different resolutions
    const pageCanvasInfo = await page.evaluate((pageNum) => {
      const ps = window.pageStreamerRef;
      const lowCanvas = ps.getDecodedPage(pageNum, 'low');
      const highCanvas = ps.getDecodedPage(pageNum, 'high');
      const gridDims = window.tileStreamerRef.gridDims;

      return {
        lowRes: lowCanvas ? { w: lowCanvas.width, h: lowCanvas.height } : null,
        highRes: highCanvas ? { w: highCanvas.width, h: highCanvas.height } : null,
        gridPageWidth: gridDims.pageWidth,
        gridPageHeight: gridDims.pageHeight,
        lowRatio: lowCanvas ? lowCanvas.width / gridDims.pageWidth : null,
        highRatio: highCanvas ? highCanvas.width / gridDims.pageWidth : null,
      };
    }, testPageNum);
    console.log(`Page ${testPageNum} canvas sizes:`);
    console.log(`  Low-res:  ${pageCanvasInfo.lowRes?.w}x${pageCanvasInfo.lowRes?.h} (ratio: ${pageCanvasInfo.lowRatio?.toFixed(4)})`);
    console.log(`  High-res: ${pageCanvasInfo.highRes?.w}x${pageCanvasInfo.highRes?.h} (ratio: ${pageCanvasInfo.highRatio?.toFixed(4)})`);
    console.log(`  Grid:     ${pageCanvasInfo.gridPageWidth}x${pageCanvasInfo.gridPageHeight}`);

    // Debug: Sample the actual low-res canvas content directly
    const lowResCanvasSamples = await page.evaluate((pageNum) => {
      const ps = window.pageStreamerRef;
      const lowCanvas = ps.getDecodedPage(pageNum, 'low');
      if (!lowCanvas) return null;

      // Create a temp canvas to draw and sample from the Image
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = lowCanvas.width;
      tempCanvas.height = lowCanvas.height;
      const ctx = tempCanvas.getContext('2d');
      ctx.drawImage(lowCanvas, 0, 0);

      // Sample at same positions as main test
      const samples = [];
      const positions = [
        { name: 'center', x: 0.5, y: 0.5 },
      ];
      for (const pos of positions) {
        const px = Math.floor(pos.x * tempCanvas.width);
        const py = Math.floor(pos.y * tempCanvas.height);
        const data = ctx.getImageData(px, py, 1, 1).data;
        samples.push({ name: pos.name, px, py, r: data[0], g: data[1], b: data[2] });
      }
      return { width: tempCanvas.width, height: tempCanvas.height, samples };
    }, testPageNum);

    if (lowResCanvasSamples) {
      console.log(`\nLow-res canvas direct samples (${lowResCanvasSamples.width}x${lowResCanvasSamples.height}):`);
      for (const s of lowResCanvasSamples.samples) {
        console.log(`  ${s.name.padEnd(8)} (${s.px},${s.py}): RGB(${s.r},${s.g},${s.b})`);
      }
    }

    // Direct tile test - generate a tile at maxLevel and sample it
    const directTileTest = await page.evaluate(async (pageNum) => {
      const ts = window.tileStreamerRef;
      const { pageWidth, pageHeight, spacing, totalWidth, totalHeight } = ts.gridDims;
      const pattern = ts.pattern;

      // Find page position in pattern
      let pageRow = -1, pageCol = -1;
      for (let r = 0; r < pattern.length; r++) {
        for (let c = 0; c < pattern[r].length; c++) {
          if (pattern[r][c] === pageNum) {
            pageRow = r;
            pageCol = c;
            break;
          }
        }
        if (pageRow >= 0) break;
      }

      if (pageRow < 0) return { error: 'Page not found' };

      // Calculate page bounds in grid coords
      const halfSpacing = spacing / 2;
      const pageLeft = pageCol * (pageWidth + spacing) + halfSpacing;
      const pageTop = pageRow * (pageHeight + spacing) + halfSpacing;

      // Generate a tile at maxLevel covering this page's center
      const level = ts.maxLevel;
      const bounds = ts.tileGenerator._getTileBounds(level, 0, 0);
      const tileWidthAtLevel = bounds.width;
      const tileHeightAtLevel = bounds.height;

      // Tile index covering page center
      const tileCenterX = Math.floor((pageLeft + pageWidth / 2) / tileWidthAtLevel);
      const tileCenterY = Math.floor((pageTop + pageHeight / 2) / tileHeightAtLevel);

      // Generate the tile
      const tileDataUrl = ts.generateTile(level, tileCenterX, tileCenterY);

      // Load and sample the tile
      return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0);

          // Sample at corners and center
          const positions = [
            { name: 'TL', x: 0.08, y: 0.08 },
            { name: 'TR', x: 0.92, y: 0.08 },
            { name: 'BL', x: 0.08, y: 0.92 },
            { name: 'BR', x: 0.92, y: 0.92 },
            { name: 'center', x: 0.5, y: 0.5 },
          ];
          const samples = {};
          for (const pos of positions) {
            const px = Math.floor(pos.x * canvas.width);
            const py = Math.floor(pos.y * canvas.height);
            const data = ctx.getImageData(px, py, 1, 1).data;
            samples[pos.name] = { px, py, r: data[0], g: data[1], b: data[2] };
          }

          resolve({
            level, tileX: tileCenterX, tileY: tileCenterY,
            tileSize: `${canvas.width}x${canvas.height}`,
            pageRow, pageCol, samples,
            tileWidthAtLevel, pageLeft, pageTop, pageWidth, pageHeight
          });
        };
        img.onerror = () => resolve({ error: 'Failed to load tile image' });
        img.src = tileDataUrl;
      });
    }, testPageNum);

    if (directTileTest.error) {
      console.log(`\nDirect tile test error: ${directTileTest.error}`);
    } else {
      console.log(`\nDirect tile test (L${directTileTest.level}, tile ${directTileTest.tileX},${directTileTest.tileY}):`);
      console.log(`  Tile size: ${directTileTest.tileSize}`);
      console.log(`  Page ${testPageNum} at grid (${directTileTest.pageRow}, ${directTileTest.pageCol})`);
      console.log(`  Grid coords: pageLeft=${directTileTest.pageLeft.toFixed(0)}, pageTop=${directTileTest.pageTop.toFixed(0)}`);
      console.log(`  Tile width at level: ${directTileTest.tileWidthAtLevel.toFixed(0)}`);
      for (const [name, s] of Object.entries(directTileTest.samples)) {
        console.log(`  ${name.padEnd(8)} (${s.px},${s.py}): RGB(${s.r},${s.g},${s.b})`);
      }
    }

    // Enable debug logging for page 11 tile rendering
    await page.evaluate(() => {
      window.__DEBUG_PAGE11_TILES = true;
      // Clear tile cache to force regeneration with debug logging
      if (window.tileStreamerRef?.tileCache) {
        window.tileStreamerRef.tileCache.clear();
        console.log('[DEBUG] Cleared tile cache to force regeneration');
      }
    });

    // Zoom and pan to show the page (40% viewport width - fits full page)
    await page.evaluate((pi) => {
      const targetZoom = 0.4 / pi.w;
      window.viewer.viewport.zoomTo(targetZoom, null, true);
      window.viewer.viewport.panTo(new OpenSeadragon.Point(pi.x, pi.y), true);
      // Force OSD to redraw which will request new tiles
      window.viewer.forceRedraw();
    }, pageInfo);

    // Wait for tiles
    await page.waitForFunction(() => {
      return (window.tileStreamerRef?.pendingJobs?.size || 0) === 0;
    }, { timeout: 10000 });
    await page.waitForTimeout(500);

    // Debug: What level is OSD using?
    const osdLevelInfo = await page.evaluate(() => {
      const viewer = window.viewer;
      const tiledImage = viewer.world.getItemAt(0);
      const viewport = viewer.viewport;

      // Get viewport zoom
      const viewportZoom = viewport.getZoom();

      // Get tiles currently loaded
      const loadedTiles = [];
      if (tiledImage?._tilesLoading !== undefined) {
        // Get level from tiles matrix if available
        const coverage = tiledImage.coverage;
        if (coverage) {
          for (let level = 0; level <= 10; level++) {
            if (coverage[level]) {
              const tileCount = Object.keys(coverage[level]).length;
              if (tileCount > 0) {
                loadedTiles.push({ level, count: tileCount });
              }
            }
          }
        }
      }

      // Try to get the level OSD is currently using
      const lastDrawnLevel = tiledImage?._lastDrawn?.map(t => t.level) || [];
      const uniqueLevels = [...new Set(lastDrawnLevel)].sort();

      return {
        viewportZoom,
        maxLevel: window.tileStreamerRef?.maxLevel,
        tileWidth: window.tileStreamerRef?.tileWidth,
        gridTotalWidth: window.tileStreamerRef?.gridDims?.totalWidth,
        loadedTiles,
        lastDrawnLevels: uniqueLevels,
        tiledImageBounds: tiledImage?.getBounds?.()
      };
    });

    console.log('\n=== OSD LEVEL DIAGNOSTICS ===');
    console.log(`Viewport zoom: ${osdLevelInfo.viewportZoom?.toFixed(2)}`);
    console.log(`Max level: ${osdLevelInfo.maxLevel}`);
    console.log(`Tile width: ${osdLevelInfo.tileWidth?.toFixed(0)}`);
    console.log(`Grid total width: ${osdLevelInfo.gridTotalWidth}`);
    console.log(`Last drawn levels: ${osdLevelInfo.lastDrawnLevels?.join(', ') || 'none'}`);
    console.log(`Loaded tiles by level:`, osdLevelInfo.loadedTiles);

    await page.screenshot({ path: 'test-results/phase1-single-page.png' });

    // Sample measurement signal at same normalized positions
    const measurementData = await page.evaluate((args) => {
      const { pageInfo, samplePoints } = args;
      const viewer = window.viewer;
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      const container = document.querySelector('.openseadragon-container');
      const ctx = canvas.getContext('2d');

      const scaleX = canvas.width / container.clientWidth;
      const scaleY = canvas.height / container.clientHeight;

      // Get actual viewport bounds from OSD
      const viewportBounds = viewer.viewport.getBounds();

      const samples = [];
      for (const sp of samplePoints) {
        // Convert normalized page coords to viewport coords
        const vpX = pageInfo.left + sp.nx * pageInfo.w;
        const vpY = pageInfo.top + sp.ny * pageInfo.h;

        // Convert viewport coords to canvas pixel coords
        const point = viewer.viewport.viewportToViewerElementCoordinates(
          new OpenSeadragon.Point(vpX, vpY)
        );
        const canvasX = Math.floor(point.x * scaleX);
        const canvasY = Math.floor(point.y * scaleY);

        // Sample pixel
        let rgb = { r: 0, g: 0, b: 0 };
        if (canvasX >= 0 && canvasX < canvas.width && canvasY >= 0 && canvasY < canvas.height) {
          const pixel = ctx.getImageData(canvasX, canvasY, 1, 1).data;
          rgb = { r: pixel[0], g: pixel[1], b: pixel[2] };
        }

        samples.push({
          name: sp.name,
          nx: sp.nx,
          ny: sp.ny,
          rgb,
          canvasX,
          canvasY
        });
      }

      return {
        samples,
        canvasWidth: canvas.width,
        canvasHeight: canvas.height,
        viewportBounds: {
          x: viewportBounds.x,
          y: viewportBounds.y,
          width: viewportBounds.width,
          height: viewportBounds.height
        },
        scaleX,
        scaleY
      };
    }, {
      pageInfo,
      samplePoints: truthData.samples.map(s => ({ name: s.name, nx: s.nx, ny: s.ny }))
    });

    console.log('Measurement samples:');
    for (const s of measurementData.samples) {
      const hsv = rgbToHsv(s.rgb.r, s.rgb.g, s.rgb.b);
      console.log(`  ${s.name.padEnd(8)}: canvas(${s.canvasX},${s.canvasY}) RGB(${s.rgb.r},${s.rgb.g},${s.rgb.b}) → H=${hsv.h.toFixed(0)}° S=${hsv.s.toFixed(2)} V=${hsv.v.toFixed(2)}`);
    }

    // Debug: Also log the viewport bounds being used
    console.log(`\nPage bounds in viewport: left=${pageInfo.left.toFixed(4)}, top=${pageInfo.top.toFixed(4)}, w=${pageInfo.w.toFixed(4)}, h=${pageInfo.h.toFixed(4)}`);
    console.log(`Viewer canvas size: ${measurementData.canvasWidth}x${measurementData.canvasHeight}`);
    console.log(`OSD viewport bounds: x=${measurementData.viewportBounds.x.toFixed(4)}, y=${measurementData.viewportBounds.y.toFixed(4)}, w=${measurementData.viewportBounds.width.toFixed(4)}, h=${measurementData.viewportBounds.height.toFixed(4)}`);
    console.log(`Scale factors: x=${measurementData.scaleX.toFixed(4)}, y=${measurementData.scaleY.toFixed(4)}`);

    // === PHASE 3: CALCULATE ERROR SIGNAL ===
    // Compare truth (PDF direct) with OSD canvas output
    console.log('\n=== PHASE 3: ERROR SIGNAL (Truth vs OSD Canvas) ===\n');

    const errors = [];
    let totalError = 0;
    const TOLERANCE = 100; // Tolerance for color matching

    for (let i = 0; i < truthData.samples.length; i++) {
      const truth = truthData.samples[i];
      const meas = measurementData.samples.find(s => s.name === truth.name);

      if (!meas) {
        console.log(`  ${truth.name.padEnd(8)}: SKIP (no OSD sample)`);
        continue;
      }

      const measRgb = meas.rgb;
      const dist = colorDistance(truth.rgb, measRgb);
      const match = dist < TOLERANCE;
      totalError += dist;

      errors.push({
        name: truth.name,
        truth: truth.rgb,
        measured: measRgb,
        distance: dist,
        match
      });

      const status = match ? '✓ MATCH' : `✗ ERROR`;
      console.log(`  ${truth.name.padEnd(8)}: distance=${dist.toFixed(1).padStart(6)} ${status}`);
      if (!match) {
        console.log(`             truth:    RGB(${truth.rgb.r},${truth.rgb.g},${truth.rgb.b})`);
        console.log(`             measured: RGB(${measRgb.r},${measRgb.g},${measRgb.b})`);
      }
    }

    const matchCount = errors.filter(e => e.match).length;
    const avgError = errors.length > 0 ? totalError / errors.length : 0;

    console.log(`\n=== ERROR SUMMARY ===`);
    console.log(`Matches: ${matchCount}/${errors.length}`);
    console.log(`Average color distance: ${avgError.toFixed(1)}`);
    console.log(`Total error: ${totalError.toFixed(1)}`);

    // === PHASE 4: GRID OVERVIEW ===
    console.log('\n=== PHASE 4: GRID OVERVIEW ===');

    // Zoom out to show grid
    await page.evaluate(() => {
      window.viewer.viewport.zoomTo(1.5);
      window.viewer.viewport.panTo({ x: 0.5, y: 0.65 });
    });
    await page.waitForTimeout(500);
    await page.waitForFunction(() => {
      return (window.tileStreamerRef?.pendingJobs?.size || 0) === 0;
    }, { timeout: 10000 });
    await page.screenshot({ path: 'test-results/phase2-grid-overview.png' });

    // Sample grid for distinct page hues
    const gridSamples = await page.evaluate(() => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      const ctx = canvas.getContext('2d');
      const hues = new Set();
      let coloredCount = 0;

      for (let row = 0; row < 6; row++) {
        for (let col = 0; col < 8; col++) {
          const x = Math.floor(canvas.width * (0.1 + col * 0.1));
          const y = Math.floor(canvas.height * (0.1 + row * 0.14));
          const pixel = ctx.getImageData(x, y, 1, 1).data;

          // Convert to HSV
          let r = pixel[0]/255, g = pixel[1]/255, b = pixel[2]/255;
          const max = Math.max(r, g, b), min = Math.min(r, g, b);
          const d = max - min;
          let h = 0, s = max === 0 ? 0 : d / max, v = max;
          if (d !== 0) {
            switch (max) {
              case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
              case g: h = ((b - r) / d + 2) / 6; break;
              case b: h = ((r - g) / d + 4) / 6; break;
            }
          }
          h *= 360;

          if (s > 0.15 && v > 0.3) {
            coloredCount++;
            const hueBand = Math.round(h / 30) * 30 % 360;
            hues.add(hueBand);
          }
        }
      }

      return { distinctHues: hues.size, coloredCount, hues: [...hues].sort((a,b) => a-b) };
    });

    console.log(`Distinct page hues visible: ${gridSamples.distinctHues}`);
    console.log(`Colored samples: ${gridSamples.coloredCount}/48`);
    console.log(`Hues found: ${gridSamples.hues.join('°, ')}°`);

    // === ASSERTIONS ===
    console.log('\n=== FINAL ASSERTIONS ===\n');

    // 1. At least 80% of sample points should match
    const matchRatio = matchCount / errors.length;
    console.log(`Match ratio: ${(matchRatio * 100).toFixed(0)}% (need ≥80%)`);
    expect(matchRatio).toBeGreaterThanOrEqual(0.8);
    console.log('✓ Match ratio OK');

    // 2. Average error should be below threshold
    console.log(`Average error: ${avgError.toFixed(1)} (need ≤${TOLERANCE})`);
    expect(avgError).toBeLessThanOrEqual(TOLERANCE);
    console.log('✓ Average error OK');

    // 3. Grid should show multiple distinct pages
    console.log(`Distinct hues: ${gridSamples.distinctHues} (need ≥3)`);
    expect(gridSamples.distinctHues).toBeGreaterThanOrEqual(3);
    console.log('✓ Grid diversity OK');

    console.log('\n========== TEST PASSED ==========\n');
  });

});
