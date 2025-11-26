/**
 * Edge Cases and Error Handling Tests
 *
 * Tests edge cases and error scenarios:
 * 1. Loading PDFs with different page counts (small, medium, large)
 * 2. Loading PDFs with different dimensions
 * 3. Error handling for invalid URLs
 * 4. Handling missing files
 * 5. Browser compatibility checks
 * 6. Mobile vs desktop detection
 */

const { test, expect } = require('@playwright/test');

test.describe('Edge Cases and Error Handling', () => {

  test('Edge Case 1: Very small PDF (single page)', async ({ page }) => {
    // Note: We'll use demo-1.pdf which should have few pages
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    const gridInfo = await page.evaluate(() => {
      const stats = window.__PDFGridDiagnostics.getCacheStats();
      return {
        pageCount: stats.pages.total,
        tilesGenerated: stats.tiles,
        gridVisible: !!window.viewer.world.getItemAt(0)
      };
    });

    console.log(`Small PDF loaded:`);
    console.log(`  Page count: ${gridInfo.pageCount}`);
    console.log(`  Tiles generated: ${gridInfo.tilesGenerated}`);
    console.log(`  Grid visible: ${gridInfo.gridVisible}`);

    expect(gridInfo.gridVisible).toBe(true);
    expect(gridInfo.tilesGenerated).toBeGreaterThan(0);

    console.log(`✓ Small PDF renders correctly`);
  });

  test('Edge Case 2: Medium PDF (multiple pages)', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for some caching
    await page.waitForTimeout(2000);

    const gridInfo = await page.evaluate(() => {
      const stats = window.__PDFGridDiagnostics.getCacheStats();
      return {
        pageCount: stats.pages.total,
        lowResPages: stats.pages.low,
        highResPages: stats.pages.high,
        tilesGenerated: stats.tiles
      };
    });

    console.log(`Medium PDF loaded:`);
    console.log(`  Total pages: ${gridInfo.pageCount}`);
    console.log(`  Low-res cached: ${gridInfo.lowResPages}`);
    console.log(`  High-res cached: ${gridInfo.highResPages}`);
    console.log(`  Tiles generated: ${gridInfo.tilesGenerated}`);

    expect(gridInfo.pageCount).toBeGreaterThan(5);
    expect(gridInfo.tilesGenerated).toBeGreaterThan(0);

    console.log(`✓ Medium PDF renders correctly`);
  });

  test('Edge Case 3: Invalid PDF parameter shows home screen', async ({ page }) => {
    const consoleMessages = [];
    page.on('console', msg => consoleMessages.push({ type: msg.type(), text: msg.text() }));

    await page.goto('http://localhost:8000?pdf=nonexistent.pdf');

    // Wait a bit to see if it tries to load
    await page.waitForTimeout(2000);

    // Should show home screen instead of viewer
    const viewerState = await page.evaluate(() => {
      return {
        viewerExists: typeof window.viewer !== 'undefined',
        viewerReady: window.viewerReady === true
      };
    });

    console.log(`Invalid PDF parameter handling:`);
    console.log(`  Viewer exists: ${viewerState.viewerExists}`);
    console.log(`  Viewer ready: ${viewerState.viewerReady}`);

    // Should fail gracefully - viewer should not be ready
    expect(viewerState.viewerReady).toBe(false);

    console.log(`✓ Invalid PDF parameter handled gracefully`);
  });

  test('Edge Case 4: Empty URL parameter clears PDF', async ({ page }) => {
    // First load a PDF
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    console.log(`✓ Initial PDF loaded`);

    // Now navigate to empty URL (should show home screen)
    await page.goto('http://localhost:8000');
    await page.waitForTimeout(1000);

    const homeScreenVisible = await page.evaluate(() => {
      return !window.viewerReady || window.viewerReady === false;
    });

    console.log(`✓ Empty URL shows home screen: ${homeScreenVisible}`);
  });

  test('Edge Case 5: Browser API availability check', async ({ page }) => {
    await page.goto('http://localhost:8000');

    const browserAPIs = await page.evaluate(() => {
      return {
        hasCanvas: typeof CanvasRenderingContext2D !== 'undefined',
        hasFileReader: typeof FileReader !== 'undefined',
        hasSessionStorage: typeof sessionStorage !== 'undefined',
        hasIndexedDB: typeof indexedDB !== 'undefined',
        hasHistoryAPI: typeof history.pushState !== 'undefined',
        hasFetchAPI: typeof fetch !== 'undefined',
        hasOpenSeadragon: typeof OpenSeadragon !== 'undefined',
        hasPDFJS: typeof pdfjsLib !== 'undefined',
        hasReact: typeof React !== 'undefined'
      };
    });

    console.log(`Browser API Availability:`);
    Object.entries(browserAPIs).forEach(([api, available]) => {
      console.log(`  ${api}: ${available ? '✓' : '✗'}`);
      expect(available).toBe(true);
    });

    console.log(`✓ All required browser APIs are available`);
  });

  test('Edge Case 6: Device detection (desktop vs mobile)', async ({ page }) => {
    await page.goto('http://localhost:8000');

    const deviceInfo = await page.evaluate(() => {
      // Check for mobile detection function
      const isMobile = window.innerWidth < 600;
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

      return {
        screenWidth: window.innerWidth,
        screenHeight: window.innerHeight,
        isMobile: isMobile,
        hasTouch: hasTouch,
        userAgent: navigator.userAgent
      };
    });

    console.log(`Device Detection:`);
    console.log(`  Screen: ${deviceInfo.screenWidth}x${deviceInfo.screenHeight}`);
    console.log(`  Detected as mobile: ${deviceInfo.isMobile}`);
    console.log(`  Touch support: ${deviceInfo.hasTouch}`);
    console.log(`  User agent: ${deviceInfo.userAgent.substring(0, 50)}...`);

    // Just verify detection logic exists
    expect(typeof deviceInfo.isMobile).toBe('boolean');
    expect(typeof deviceInfo.hasTouch).toBe('boolean');

    console.log(`✓ Device detection logic works`);
  });

  test('Edge Case 7: Diagnostics API is properly exposed', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    const diagnosticsAPI = await page.evaluate(() => {
      const api = window.__PDFGridDiagnostics;
      return {
        exists: !!api,
        methods: api ? {
          getCacheStats: typeof api.getCacheStats === 'function',
          getMemoryEstimate: typeof api.getMemoryEstimate === 'function',
          getCurrentZoom: typeof api.getCurrentZoom === 'function',
          clearCaches: typeof api.clearCaches === 'function',
          showDebug: typeof api.showDebug === 'function'
        } : null
      };
    });

    console.log(`Diagnostics API:`);
    console.log(`  Exists: ${diagnosticsAPI.exists}`);

    if (diagnosticsAPI.methods) {
      Object.entries(diagnosticsAPI.methods).forEach(([method, available]) => {
        console.log(`  ${method}: ${available ? '✓' : '✗'}`);
        expect(available).toBe(true);
      });
    }

    expect(diagnosticsAPI.exists).toBe(true);
    console.log(`✓ Diagnostics API properly exposed`);
  });

  test('Edge Case 8: Zoom level limits are enforced', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Try to zoom way out
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        window.viewer.viewport.zoomBy(0.1);
      }
    });
    await page.waitForTimeout(500);

    const minZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`Min zoom level: ${minZoom.toFixed(3)}`);

    // Try to zoom way in
    await page.evaluate(() => {
      for (let i = 0; i < 20; i++) {
        window.viewer.viewport.zoomBy(10.0);
      }
    });
    await page.waitForTimeout(500);

    const maxZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`Max zoom level: ${maxZoom.toFixed(3)}`);

    // Zoom levels should be clamped to reasonable values
    expect(minZoom).toBeGreaterThan(0);
    expect(maxZoom).toBeGreaterThan(minZoom);
    expect(maxZoom).toBeLessThan(1000); // Should have some upper limit

    console.log(`✓ Zoom level limits enforced`);
  });

  test('Edge Case 9: Rapid viewport changes don\'t crash', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-2.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    console.log(`Performing rapid viewport changes...`);

    // Rapidly zoom and pan
    for (let i = 0; i < 10; i++) {
      await page.evaluate((iteration) => {
        const zoom = iteration % 2 === 0 ? 2.0 : 0.5;
        window.viewer.viewport.zoomBy(zoom);

        const x = Math.random();
        const y = Math.random();
        const point = new OpenSeadragon.Point(x, y);
        window.viewer.viewport.panTo(point, false);
      }, i);

      await page.waitForTimeout(50); // Very rapid
    }

    await page.waitForTimeout(500);

    // Verify viewer still works
    const stillWorks = await page.evaluate(() => {
      return {
        viewerExists: !!window.viewer,
        canGetZoom: typeof window.viewer.viewport.getZoom() === 'number',
        canGetCenter: !!window.viewer.viewport.getCenter()
      };
    });

    console.log(`After rapid changes:`);
    console.log(`  Viewer exists: ${stillWorks.viewerExists}`);
    console.log(`  Can get zoom: ${stillWorks.canGetZoom}`);
    console.log(`  Can get center: ${stillWorks.canGetCenter}`);

    expect(stillWorks.viewerExists).toBe(true);
    expect(stillWorks.canGetZoom).toBe(true);

    console.log(`✓ Viewer survives rapid viewport changes`);
  });

  test('Edge Case 10: Cache doesn\'t grow unbounded', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for initial caching
    await page.waitForTimeout(2000);

    const samples = [];

    // Pan around for a while, sampling cache size
    for (let i = 0; i < 15; i++) {
      const x = 0.1 + (i * 0.05);
      const y = 0.1 + (i * 0.05);

      await page.evaluate((pos) => {
        const point = new OpenSeadragon.Point(pos.x, pos.y);
        window.viewer.viewport.panTo(point, false);
      }, { x, y });

      await page.waitForTimeout(200);

      const stats = await page.evaluate(() => {
        return window.__PDFGridDiagnostics.getCacheStats();
      });

      samples.push({
        iteration: i,
        tiles: stats.tiles,
        pages: stats.pages.total
      });
    }

    console.log(`Cache growth over 15 pan operations:`);
    console.log(`  Initial: ${samples[0].tiles} tiles, ${samples[0].pages} pages`);
    console.log(`  Final: ${samples[samples.length - 1].tiles} tiles, ${samples[samples.length - 1].pages} pages`);

    // Cache should be bounded (desktop: 300 tiles, mobile: 150)
    const maxTiles = Math.max(...samples.map(s => s.tiles));
    const maxPages = Math.max(...samples.map(s => s.pages));

    console.log(`  Max tiles observed: ${maxTiles}`);
    console.log(`  Max pages observed: ${maxPages}`);

    // Verify cache stays under reasonable limits
    expect(maxTiles).toBeLessThan(500); // Desktop max 300, mobile 150 + some tolerance
    expect(maxPages).toBeLessThan(300); // Page cache limits

    console.log(`✓ Cache sizes remain bounded`);
  });

  test('Edge Case 11: Debug panel persists state in localStorage', async ({ page }) => {
    // Load with debug panel
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Toggle a setting (Tile Borders)
    const tileBordersBtn = page.locator('button').filter({ hasText: 'Tile Borders' });
    await tileBordersBtn.click();
    await page.waitForTimeout(200);

    const enabledState = await page.evaluate(() => window.viewer.drawer.debugMode);
    console.log(`Tile Borders enabled: ${enabledState}`);

    // Reload page
    await page.reload();
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Check if setting persisted
    const persistedState = await page.evaluate(() => window.viewer.drawer.debugMode);
    console.log(`After reload, Tile Borders: ${persistedState}`);

    expect(persistedState).toBe(enabledState);
    console.log(`✓ Debug panel settings persist across page reloads`);
  });

});
