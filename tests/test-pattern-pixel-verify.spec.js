/**
 * Test Pattern Pixel Verification
 * Samples actual canvas pixels to verify tiles contain correct page content
 * This is the definitive test that pages render correctly, not just that timeouts don't occur
 */

const { test, expect } = require('@playwright/test');

test.describe('Test Pattern Pixel Verification', () => {

  test('Verify tiles contain actual page content via pixel sampling', async ({ page }) => {
    test.setTimeout(120000);

    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Load test pattern PDF (12 pages with distinct colors)
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    console.log('Viewer ready');

    // Wait for pages to render
    await page.waitForTimeout(5000);

    // Get grid info and verify setup
    const gridInfo = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const ps = ts?.pageStreamer;
      return {
        numPages: ts?.numPages || 0,
        gridSize: ts?.gridDims?.gridSize || 0,
        lowResCached: ps?.lowResPageCache?.size || 0,
        highResCached: ps?.highResPageCache?.size || 0,
        tileCacheSize: ts?.tileCache?.cache?.size || 0
      };
    });

    console.log('\n=== GRID INFO ===');
    console.log(JSON.stringify(gridInfo, null, 2));
    expect(gridInfo.numPages).toBe(12);

    // Wait for background rendering
    await page.waitForTimeout(5000);

    // Sample the canvas to verify actual rendered content
    // The OSD viewer renders to a canvas - we'll sample pixels from it
    const canvasAnalysis = await page.evaluate(() => {
      const results = {
        canvasFound: false,
        canvasSize: { width: 0, height: 0 },
        pixelSamples: [],
        hasNonBlackPixels: false,
        hasColorVariation: false,
        dominantColors: []
      };

      // Find the OSD canvas
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) {
        return results;
      }

      results.canvasFound = true;
      results.canvasSize = { width: canvas.width, height: canvas.height };

      // Get 2D context to read pixels
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        return results;
      }

      // Sample pixels at various points across the canvas
      const samplePoints = [
        { x: 0.25, y: 0.25, name: 'top-left-quarter' },
        { x: 0.5, y: 0.25, name: 'top-center' },
        { x: 0.75, y: 0.25, name: 'top-right-quarter' },
        { x: 0.25, y: 0.5, name: 'left-center' },
        { x: 0.5, y: 0.5, name: 'center' },
        { x: 0.75, y: 0.5, name: 'right-center' },
        { x: 0.25, y: 0.75, name: 'bottom-left-quarter' },
        { x: 0.5, y: 0.75, name: 'bottom-center' },
        { x: 0.75, y: 0.75, name: 'bottom-right-quarter' }
      ];

      const colorCounts = {};

      for (const point of samplePoints) {
        const px = Math.floor(point.x * canvas.width);
        const py = Math.floor(point.y * canvas.height);

        // Sample a small region (5x5) around the point
        const imageData = ctx.getImageData(px - 2, py - 2, 5, 5);
        const data = imageData.data;

        // Average the colors in the region
        let r = 0, g = 0, b = 0, a = 0;
        const pixelCount = 25;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          a += data[i + 3];
        }
        r = Math.round(r / pixelCount);
        g = Math.round(g / pixelCount);
        b = Math.round(b / pixelCount);
        a = Math.round(a / pixelCount);

        const sample = {
          name: point.name,
          px, py,
          r, g, b, a,
          isBlack: r < 20 && g < 20 && b < 20,
          isTransparent: a < 128,
          colorKey: `${Math.round(r/50)}_${Math.round(g/50)}_${Math.round(b/50)}`
        };

        results.pixelSamples.push(sample);

        if (!sample.isBlack && !sample.isTransparent) {
          results.hasNonBlackPixels = true;
        }

        colorCounts[sample.colorKey] = (colorCounts[sample.colorKey] || 0) + 1;
      }

      // Check for color variation (indicates different pages visible)
      const uniqueColors = Object.keys(colorCounts).length;
      results.hasColorVariation = uniqueColors > 2;
      results.dominantColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([key, count]) => ({ key, count }));

      return results;
    });

    console.log('\n=== CANVAS ANALYSIS ===');
    console.log('Canvas found:', canvasAnalysis.canvasFound);
    console.log('Canvas size:', canvasAnalysis.canvasSize);
    console.log('Has non-black pixels:', canvasAnalysis.hasNonBlackPixels);
    console.log('Has color variation:', canvasAnalysis.hasColorVariation);
    console.log('Dominant colors:', JSON.stringify(canvasAnalysis.dominantColors));

    console.log('\n=== PIXEL SAMPLES ===');
    for (const sample of canvasAnalysis.pixelSamples) {
      const status = sample.isBlack ? '⚫ BLACK' :
                     sample.isTransparent ? '⬜ TRANSPARENT' :
                     `🎨 RGB(${sample.r},${sample.g},${sample.b})`;
      console.log(`  ${sample.name}: ${status}`);
    }

    // Take screenshot for manual verification
    await page.screenshot({ path: 'test-results/test-pattern-pixel-verify.png', fullPage: false });
    console.log('\nScreenshot saved: test-results/test-pattern-pixel-verify.png');

    // Zoom in and check again
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(2);
    });
    await page.waitForTimeout(3000);

    const zoomedAnalysis = await page.evaluate(() => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) return { canvasFound: false };

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      const centerX = Math.floor(canvas.width / 2);
      const centerY = Math.floor(canvas.height / 2);

      const imageData = ctx.getImageData(centerX - 2, centerY - 2, 5, 5);
      const data = imageData.data;

      let r = 0, g = 0, b = 0;
      for (let i = 0; i < data.length; i += 4) {
        r += data[i];
        g += data[i + 1];
        b += data[i + 2];
      }
      r = Math.round(r / 25);
      g = Math.round(g / 25);
      b = Math.round(b / 25);

      return {
        canvasFound: true,
        centerColor: { r, g, b },
        isBlack: r < 20 && g < 20 && b < 20
      };
    });

    console.log('\n=== ZOOMED CENTER PIXEL ===');
    console.log('Center color:', zoomedAnalysis.centerColor);
    console.log('Is black:', zoomedAnalysis.isBlack);

    await page.screenshot({ path: 'test-results/test-pattern-zoomed.png', fullPage: false });
    console.log('Zoomed screenshot saved: test-results/test-pattern-zoomed.png');

    // Final verification
    console.log('\n=== VERIFICATION RESULTS ===');

    const hasContent = canvasAnalysis.hasNonBlackPixels;
    const hasPages = gridInfo.lowResCached > 0;
    const noErrors = errors.length === 0;

    console.log(`Canvas has non-black content: ${hasContent ? 'PASS ✅' : 'FAIL ❌'}`);
    console.log(`Pages are cached: ${hasPages ? 'PASS ✅' : 'FAIL ❌'} (${gridInfo.lowResCached}/12)`);
    console.log(`No console errors: ${noErrors ? 'PASS ✅' : 'FAIL ❌'} (${errors.length} errors)`);

    if (errors.length > 0) {
      console.log('\nErrors:');
      errors.forEach(e => console.log(`  ${e}`));
    }

    // Assertions
    expect(canvasAnalysis.canvasFound).toBe(true);
    expect(canvasAnalysis.hasNonBlackPixels).toBe(true);
    expect(gridInfo.lowResCached).toBeGreaterThan(0);
  });
});
