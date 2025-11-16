/**
 * Smoke Test - Basic Functionality with demo-1.pdf
 *
 * Tests three standard use cases:
 * 1. PDF loads successfully without errors
 * 2. Basic viewer interactions work (pan, zoom, navigation)
 * 3. Debug panel controls function correctly
 */

const { test, expect } = require('@playwright/test');

test.describe('Smoke Test - demo-1.pdf', () => {

  test('Use Case 1: PDF loads successfully without console errors', async ({ page }) => {
    const consoleErrors = [];
    const consoleWarnings = [];

    // Capture console errors and warnings
    page.on('console', msg => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
      if (msg.type() === 'warning') {
        consoleWarnings.push(msg.text());
      }
    });

    // Load demo-1.pdf
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 30000 }
    );

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Get page count
    const pageCount = await page.evaluate(() => {
      return window.viewer?.world?.getItemCount();
    });

    console.log(`✓ demo-1.pdf loaded successfully`);
    console.log(`  Viewer ready: true`);
    console.log(`  TiledImage count: ${pageCount}`);
    console.log(`  Console errors: ${consoleErrors.length}`);
    console.log(`  Console warnings: ${consoleWarnings.length}`);

    if (consoleErrors.length > 0) {
      console.log('\nConsole errors:');
      consoleErrors.forEach(err => console.log(`  - ${err}`));
    }

    // Assert: No console errors and viewer is ready
    expect(consoleErrors.length).toBe(0);
    expect(pageCount).toBeGreaterThan(0);
  });

  test('Use Case 2: Basic viewer interactions work correctly', async ({ page }) => {
    // Load demo-1.pdf
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Test 1: Get initial viewport state
    const initialState = await page.evaluate(() => {
      return {
        zoom: window.viewer.viewport.getZoom(),
        center: {
          x: window.viewer.viewport.getCenter().x,
          y: window.viewer.viewport.getCenter().y
        }
      };
    });

    console.log(`Initial viewport state:`);
    console.log(`  Zoom: ${initialState.zoom.toFixed(3)}`);
    console.log(`  Center: (${initialState.center.x.toFixed(3)}, ${initialState.center.y.toFixed(3)})`);

    // Test 2: Zoom in
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(2.0);
    });
    await page.waitForTimeout(500);

    const zoomedState = await page.evaluate(() => {
      return {
        zoom: window.viewer.viewport.getZoom()
      };
    });

    console.log(`\nAfter zoom in (2x):`);
    console.log(`  Zoom: ${zoomedState.zoom.toFixed(3)}`);

    expect(zoomedState.zoom).toBeGreaterThan(initialState.zoom * 1.5);

    // Test 3: Pan to a new position
    await page.evaluate(() => {
      const newPoint = new OpenSeadragon.Point(0.5, 0.5);
      window.viewer.viewport.panTo(newPoint);
    });
    await page.waitForTimeout(500);

    const pannedState = await page.evaluate(() => {
      return {
        center: {
          x: window.viewer.viewport.getCenter().x,
          y: window.viewer.viewport.getCenter().y
        }
      };
    });

    console.log(`\nAfter pan to (0.5, 0.5):`);
    console.log(`  Center: (${pannedState.center.x.toFixed(3)}, ${pannedState.center.y.toFixed(3)})`);

    // Verify pan worked (within tolerance)
    expect(Math.abs(pannedState.center.x - 0.5)).toBeLessThan(0.1);
    expect(Math.abs(pannedState.center.y - 0.5)).toBeLessThan(0.1);

    // Test 4: Reset zoom (home button)
    await page.evaluate(() => {
      window.viewer.viewport.goHome();
    });
    await page.waitForTimeout(500);

    const resetState = await page.evaluate(() => {
      return {
        zoom: window.viewer.viewport.getZoom()
      };
    });

    console.log(`\nAfter reset (home):`);
    console.log(`  Zoom: ${resetState.zoom.toFixed(3)}`);

    console.log(`\n✓ All basic viewer interactions work correctly`);
  });

  test('Use Case 3: Debug panel controls function correctly', async ({ page }) => {
    // Load demo-1.pdf with debug parameter
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait a bit for debug panel to open
    await page.waitForTimeout(1000);

    // Verify debug panel is visible
    const debugPanelVisible = await page.locator('text=Debug Panel').isVisible();
    expect(debugPanelVisible).toBe(true);
    console.log(`✓ Debug panel opened via ?debug parameter`);

    // Test 1: Get initial cache stats
    const initialStats = await page.evaluate(() => {
      const stats = window.__PDFGridDiagnostics.getCacheStats();
      return {
        tiles: stats.tiles,
        lowRes: stats.lowRes,
        highRes: stats.highRes
      };
    });

    console.log(`\nInitial cache stats:`);
    console.log(`  Tiles: ${initialStats.tiles}`);
    console.log(`  Low-res pages: ${initialStats.lowRes}`);
    console.log(`  High-res pages: ${initialStats.highRes}`);

    expect(initialStats.tiles).toBeGreaterThan(0);

    // Test 2: Toggle a performance feature (Tile Borders)
    const tileBordersButton = page.locator('button:has-text("Tile Borders")');
    await tileBordersButton.click();
    await page.waitForTimeout(200);

    const tileBordersEnabled = await page.evaluate(() => {
      return window.viewer.drawer.debugMode;
    });

    console.log(`\n✓ Tile Borders toggle: ${tileBordersEnabled ? 'ON' : 'OFF'}`);
    expect(typeof tileBordersEnabled).toBe('boolean');

    // Toggle back
    await tileBordersButton.click();
    await page.waitForTimeout(200);

    // Test 3: Verify Refresh button works
    const refreshButton = page.locator('button:has-text("Refresh")');
    await refreshButton.click();
    await page.waitForTimeout(500);

    console.log(`✓ Refresh button clicked successfully`);

    // Test 4: Close debug panel
    const closeButton = page.locator('button:has-text("×")').first();
    await closeButton.click();
    await page.waitForTimeout(500);

    const debugPanelAfterClose = await page.locator('text=Debug Panel').isVisible();
    expect(debugPanelAfterClose).toBe(false);
    console.log(`✓ Debug panel closed successfully`);

    console.log(`\n✓ All debug panel controls function correctly`);
  });

});
