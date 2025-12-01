/**
 * Core Functionality Tests
 *
 * Minimal test suite for verifying basic app operation.
 * Tests observable behavior, not internal implementation details.
 */
const { test, expect } = require('@playwright/test');

test.describe('Core Functionality', () => {

  test('PDF loads without console errors', async ({ page }) => {
    const errors = [];

    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    page.on('pageerror', err => {
      errors.push(`[PAGE ERROR] ${err.message}`);
    });

    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Allow initial render to complete
    await page.waitForTimeout(2000);

    if (errors.length > 0) {
      console.log('Errors found:');
      errors.forEach(e => console.log('  ', e));
    }

    expect(errors.length).toBe(0);
  });

  test('Viewer initializes with required components', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    const state = await page.evaluate(() => ({
      hasViewer: !!window.viewer,
      hasTileStreamer: !!window.tileStreamerRef,
      hasViewport: !!window.viewer?.viewport,
      hasWorld: !!window.viewer?.world,
      itemCount: window.viewer?.world?.getItemCount() || 0,
      numPages: window.tileStreamerRef?.numPages || 0,
    }));

    console.log('Viewer state:', state);

    expect(state.hasViewer).toBe(true);
    expect(state.hasTileStreamer).toBe(true);
    expect(state.hasViewport).toBe(true);
    expect(state.itemCount).toBeGreaterThan(0);
    expect(state.numPages).toBeGreaterThan(0);
  });

  test('Canvas renders visible content (not blank)', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(3000); // Allow tiles to render

    const canvasCheck = await page.evaluate(() => {
      const canvas = document.querySelector('.openseadragon-canvas canvas');
      if (!canvas) return { error: 'No canvas found' };

      const ctx = canvas.getContext('2d');
      const w = canvas.width;
      const h = canvas.height;

      // Sample center region
      const sampleSize = 100;
      const startX = Math.floor(w / 2 - sampleSize / 2);
      const startY = Math.floor(h / 2 - sampleSize / 2);
      const data = ctx.getImageData(startX, startY, sampleSize, sampleSize).data;

      // Count non-black, non-transparent pixels (actual content)
      let contentPixels = 0;
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        // Consider anything with alpha > 0 and not pure black as content
        if (a > 0 && (r > 10 || g > 10 || b > 10)) {
          contentPixels++;
        }
      }

      const totalPixels = sampleSize * sampleSize;
      return {
        canvasSize: `${w}x${h}`,
        contentPixels,
        totalPixels,
        percentContent: ((contentPixels / totalPixels) * 100).toFixed(1)
      };
    });

    console.log('Canvas check:', canvasCheck);

    if (canvasCheck.error) {
      throw new Error(canvasCheck.error);
    }

    // At least 10% of sampled area should have content
    expect(parseFloat(canvasCheck.percentContent)).toBeGreaterThan(10);
  });

  test('Zoom and pan controls work', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Get initial state
    const initial = await page.evaluate(() => ({
      zoom: window.viewer.viewport.getZoom(),
      center: window.viewer.viewport.getCenter()
    }));

    console.log('Initial:', { zoom: initial.zoom.toFixed(3), center: `(${initial.center.x.toFixed(3)}, ${initial.center.y.toFixed(3)})` });

    // Zoom in
    await page.evaluate((initialZoom) => {
      window.viewer.viewport.zoomTo(initialZoom * 2, null, true);
    }, initial.zoom);
    await page.waitForTimeout(500);

    const afterZoom = await page.evaluate(() => ({
      zoom: window.viewer.viewport.getZoom()
    }));

    console.log('After zoom:', afterZoom.zoom.toFixed(3));
    expect(afterZoom.zoom).toBeGreaterThan(initial.zoom);

    // Pan
    await page.evaluate(() => {
      window.viewer.viewport.panTo(new OpenSeadragon.Point(0.3, 0.3), true);
    });
    await page.waitForTimeout(500);

    const afterPan = await page.evaluate(() => ({
      center: window.viewer.viewport.getCenter()
    }));

    console.log('After pan:', `(${afterPan.center.x.toFixed(3)}, ${afterPan.center.y.toFixed(3)})`);

    // Verify pan moved the center (within tolerance)
    expect(Math.abs(afterPan.center.x - 0.3)).toBeLessThan(0.15);
  });

  test('All demo PDFs load successfully', async ({ page }) => {
    test.setTimeout(120000);

    const demos = ['demo/demo-1.pdf', 'demo/demo-2.pdf', 'demo/demo-3.pdf'];

    for (const pdf of demos) {
      console.log(`\nTesting ${pdf}...`);

      await page.goto(`http://localhost:8000?pdf=${pdf}`);

      // Wait for viewer ready
      const ready = await page.waitForFunction(
        () => window.viewerReady === true,
        { timeout: 30000 }
      ).then(() => true).catch(() => false);

      expect(ready).toBe(true);

      const state = await page.evaluate(() => ({
        numPages: window.tileStreamerRef?.numPages || 0,
        hasContent: !!window.viewer?.world?.getItemAt(0)
      }));

      console.log(`  ${pdf}: ${state.numPages} pages, hasContent: ${state.hasContent}`);
      expect(state.numPages).toBeGreaterThan(0);
      expect(state.hasContent).toBe(true);
    }
  });

});
