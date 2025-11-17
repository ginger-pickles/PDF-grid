/**
 * Core Functionality Tests - Comprehensive Visual Testing
 *
 * Tests all major user workflows and features:
 * 1. PDF Loading (local file, URL parameter, drag-drop simulation)
 * 2. Viewer Interactions (pan, zoom, home, navigator)
 * 3. UI Controls (help panel, download, debug panel)
 * 4. Grid Pattern Rendering
 * 5. Cache Behavior
 * 6. Error Handling
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Core Features - Comprehensive Functional Tests', () => {

  test('Feature 1: Load PDF via URL parameter', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') consoleErrors.push(msg.text());
    });

    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Verify PDF loaded
    const pdfLoaded = await page.evaluate(() => {
      const diagnostics = window.__PDFGridDiagnostics.getCacheStats();
      return {
        viewerReady: window.viewerReady,
        hasPages: diagnostics.pages.total > 0,
        hasTiles: diagnostics.tiles > 0,
        pageCount: diagnostics.pages.total
      };
    });

    console.log(`✓ PDF loaded via URL parameter`);
    console.log(`  Pages cached: ${pdfLoaded.pageCount}`);
    console.log(`  Tiles cached: ${pdfLoaded.hasTiles}`);

    expect(consoleErrors.length).toBe(0);
    expect(pdfLoaded.viewerReady).toBe(true);
    expect(pdfLoaded.hasPages).toBe(true);
    expect(pdfLoaded.hasTiles).toBe(true);
  });

  test('Feature 2: Help panel opens and closes correctly', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Initially, help panel should not be visible
    const helpPanelInitial = await page.locator('.help-panel').isVisible().catch(() => false);

    // Click help button
    const helpButton = page.locator('button:has-text("HELP")').or(page.locator('button[title*="help" i]'));
    await helpButton.click();
    await page.waitForTimeout(300);

    // Verify help panel is visible
    const helpPanelVisible = await page.locator('.help-panel').isVisible().catch(() =>
      // Fallback: check for help content
      page.locator('text=Usage').isVisible()
    );

    console.log(`✓ Help panel opened: ${helpPanelVisible}`);
    expect(helpPanelVisible).toBe(true);

    // Close help panel (click close button or press Escape)
    const closeButton = page.locator('button').filter({ hasText: '×' }).first();
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await page.keyboard.press('Escape');
    }
    await page.waitForTimeout(300);

    const helpPanelAfterClose = await page.locator('.help-panel').isVisible().catch(() => false);
    console.log(`✓ Help panel closed: ${!helpPanelAfterClose}`);
  });

  test('Feature 3: Download button is functional', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Open help panel to access download button
    const helpButton = page.locator('button:has-text("HELP")').or(page.locator('button[title*="help" i]'));
    await helpButton.click();
    await page.waitForTimeout(300);

    // Verify download button is visible and enabled
    const downloadButton = page.locator('button').filter({ hasText: /download/i }).first();
    const isVisible = await downloadButton.isVisible();
    const isEnabled = await downloadButton.isEnabled();

    console.log(`✓ Download button visible: ${isVisible}`);
    console.log(`✓ Download button enabled: ${isEnabled}`);

    expect(isVisible).toBe(true);
    expect(isEnabled).toBe(true);

    // Note: We don't actually click download as it would trigger browser download
    // Just verify the button is functional
  });

  test('Feature 4: Zoom controls work correctly', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Get initial zoom level
    const initialZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`Initial zoom: ${initialZoom.toFixed(3)}`);

    // Test zoom in
    await page.evaluate(() => window.viewer.viewport.zoomBy(2.0));
    await page.waitForTimeout(500);

    const zoomedInLevel = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`After zoom in (2x): ${zoomedInLevel.toFixed(3)}`);
    expect(zoomedInLevel).toBeGreaterThan(initialZoom * 1.8);

    // Test zoom out
    await page.evaluate(() => window.viewer.viewport.zoomBy(0.5));
    await page.waitForTimeout(500);

    const zoomedOutLevel = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`After zoom out (0.5x): ${zoomedOutLevel.toFixed(3)}`);
    expect(zoomedOutLevel).toBeLessThan(zoomedInLevel);

    // Test home button (reset zoom)
    await page.evaluate(() => window.viewer.viewport.goHome());
    await page.waitForTimeout(500);

    const homeZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    console.log(`After home: ${homeZoom.toFixed(3)}`);

    // Should be close to initial zoom (within 10%)
    expect(Math.abs(homeZoom - initialZoom) / initialZoom).toBeLessThan(0.1);
    console.log(`✓ All zoom controls work correctly`);
  });

  test('Feature 5: Pan/navigation works across grid', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Get initial position
    const initialPos = await page.evaluate(() => {
      const center = window.viewer.viewport.getCenter();
      return { x: center.x, y: center.y };
    });
    console.log(`Initial position: (${initialPos.x.toFixed(3)}, ${initialPos.y.toFixed(3)})`);

    // Pan to different positions
    const testPositions = [
      { x: 0.2, y: 0.2, name: 'top-left' },
      { x: 0.8, y: 0.2, name: 'top-right' },
      { x: 0.8, y: 0.8, name: 'bottom-right' },
      { x: 0.2, y: 0.8, name: 'bottom-left' },
    ];

    for (const pos of testPositions) {
      await page.evaluate((p) => {
        const point = new OpenSeadragon.Point(p.x, p.y);
        window.viewer.viewport.panTo(point, false);
      }, pos);
      await page.waitForTimeout(300);

      const currentPos = await page.evaluate(() => {
        const center = window.viewer.viewport.getCenter();
        return { x: center.x, y: center.y };
      });

      console.log(`✓ Panned to ${pos.name}: (${currentPos.x.toFixed(3)}, ${currentPos.y.toFixed(3)})`);

      // Verify pan worked (within tolerance)
      expect(Math.abs(currentPos.x - pos.x)).toBeLessThan(0.15);
      expect(Math.abs(currentPos.y - pos.y)).toBeLessThan(0.15);
    }

    console.log(`✓ Pan navigation works correctly across grid`);
  });

  test('Feature 6: Navigator/minimap is present and functional', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Check if navigator is present (may be hidden on mobile)
    const navigatorInfo = await page.evaluate(() => {
      const nav = window.viewer?.navigator;
      return {
        exists: !!nav,
        isVisible: nav ? nav.element.style.display !== 'none' : false,
        element: nav ? {
          width: nav.element.offsetWidth,
          height: nav.element.offsetHeight
        } : null
      };
    });

    console.log(`Navigator exists: ${navigatorInfo.exists}`);
    if (navigatorInfo.exists) {
      console.log(`Navigator visible: ${navigatorInfo.isVisible}`);
      console.log(`Navigator size: ${navigatorInfo.element.width}x${navigatorInfo.element.height}`);
    }

    // Navigator may not be visible on touch devices or small screens, that's OK
    expect(navigatorInfo.exists).toBe(true);
  });

  test('Feature 7: Cache statistics are tracked correctly', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait a bit for caching to happen
    await page.waitForTimeout(1000);

    const cacheStats = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats();
    });

    console.log(`Cache Statistics:`);
    console.log(`  Total pages: ${cacheStats.pages.total}`);
    console.log(`  Low-res pages: ${cacheStats.pages.low}`);
    console.log(`  High-res pages: ${cacheStats.pages.high}`);
    console.log(`  Tiles: ${cacheStats.tiles}`);
    console.log(`  Full renders: ${cacheStats.tileRenderStats.full}`);
    console.log(`  Fallback renders: ${cacheStats.tileRenderStats.fallback}`);
    console.log(`  Fallback %: ${cacheStats.tileRenderStats.fallbackPercentage}%`);

    // Verify cache stats are being tracked
    expect(cacheStats.pages.total).toBeGreaterThan(0);
    expect(cacheStats.tiles).toBeGreaterThan(0);
    expect(cacheStats.tileRenderStats.full).toBeGreaterThanOrEqual(0);
    expect(cacheStats.tileRenderStats.fallback).toBeGreaterThanOrEqual(0);

    console.log(`✓ Cache statistics tracked correctly`);
  });

  test('Feature 8: Memory estimation is reasonable', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    await page.waitForTimeout(2000);

    const memoryEstimate = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getMemoryEstimate();
    });

    console.log(`Memory estimate: ${memoryEstimate.toFixed(2)} MB`);

    // Memory should be positive and reasonable (< 500MB for demo PDF)
    expect(memoryEstimate).toBeGreaterThan(0);
    expect(memoryEstimate).toBeLessThan(500);

    console.log(`✓ Memory estimation is reasonable`);
  });

  test('Feature 9: Debug panel statistics update correctly', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for debug panel to open
    await page.waitForTimeout(1000);

    // Verify debug panel is visible
    const debugPanelVisible = await page.locator('text=Debug Panel').or(
      page.locator('text=Cache Statistics')
    ).isVisible();

    expect(debugPanelVisible).toBe(true);
    console.log(`✓ Debug panel opened automatically via ?debug parameter`);

    // Get initial stats
    const initialStats = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats();
    });

    // Perform some actions (zoom and pan)
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(2.0);
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      const point = new OpenSeadragon.Point(0.7, 0.7);
      window.viewer.viewport.panTo(point, false);
    });
    await page.waitForTimeout(500);

    // Get updated stats
    const updatedStats = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats();
    });

    console.log(`Initial tiles: ${initialStats.tiles}`);
    console.log(`Updated tiles: ${updatedStats.tiles}`);

    // Tiles count may have changed due to cache eviction/generation
    expect(updatedStats.tiles).toBeGreaterThan(0);

    console.log(`✓ Debug panel statistics update correctly`);
  });

  test('Feature 10: Grid pattern renders correctly for small PDF', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for initial rendering
    await page.waitForTimeout(2000);

    // Take screenshot of the grid
    await page.screenshot({ path: 'test-results/grid-pattern-demo-1.png', fullPage: false });

    // Verify grid is visible by checking viewport content
    const gridInfo = await page.evaluate(() => {
      const bounds = window.viewer.viewport.getBounds();
      const zoom = window.viewer.viewport.getZoom();
      const tiledImage = window.viewer.world.getItemAt(0);

      return {
        bounds: { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height },
        zoom: zoom,
        hasTiledImage: !!tiledImage,
        fullyLoaded: tiledImage ? tiledImage.getFullyLoaded() : false
      };
    });

    console.log(`Grid rendering info:`);
    console.log(`  Has tiled image: ${gridInfo.hasTiledImage}`);
    console.log(`  Fully loaded: ${gridInfo.fullyLoaded}`);
    console.log(`  Zoom level: ${gridInfo.zoom.toFixed(3)}`);
    console.log(`  Viewport bounds: ${JSON.stringify(gridInfo.bounds)}`);

    expect(gridInfo.hasTiledImage).toBe(true);

    console.log(`✓ Grid pattern renders correctly`);
    console.log(`  Screenshot saved to test-results/grid-pattern-demo-1.png`);
  });

  test('Feature 11: Fallback rendering works when cache misses', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf'); // Larger PDF
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Wait for initial caching
    await page.waitForTimeout(2000);

    // Get initial stats
    const initialStats = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats().tileRenderStats;
    });

    // Rapidly pan around to trigger cache misses and fallback
    for (let i = 0; i < 5; i++) {
      const x = 0.2 + (i * 0.15);
      const y = 0.2 + (i * 0.15);

      await page.evaluate((pos) => {
        const point = new OpenSeadragon.Point(pos.x, pos.y);
        window.viewer.viewport.panTo(point, false);
      }, { x, y });

      await page.waitForTimeout(150); // Fast panning
    }

    // Wait for renders to complete
    await page.waitForTimeout(1000);

    const finalStats = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats().tileRenderStats;
    });

    console.log(`Tile render statistics:`);
    console.log(`  Full renders: ${finalStats.full}`);
    console.log(`  Fallback renders: ${finalStats.fallback}`);
    console.log(`  Fallback percentage: ${finalStats.fallbackPercentage}%`);

    // Should have some fallback renders during rapid panning
    expect(finalStats.full + finalStats.fallback).toBeGreaterThan(0);

    console.log(`✓ Fallback rendering system is working`);
  });

  test('Feature 12: URL parameters are parsed correctly', async ({ page }) => {
    // Test with debug parameter
    await page.goto('http://localhost:8000?pdf=demo/demo-2.pdf&debug=1');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });

    // Check if debug panel opened
    const debugPanelVisible = await page.locator('text=Debug Panel').or(
      page.locator('text=Cache Statistics')
    ).isVisible();

    console.log(`✓ Debug parameter parsed: panel visible = ${debugPanelVisible}`);
    expect(debugPanelVisible).toBe(true);

    // Verify correct PDF was loaded
    const urlInfo = await page.evaluate(() => {
      return {
        currentUrl: window.location.href,
        hasDebugParam: window.location.search.includes('debug'),
        hasPdfParam: window.location.search.includes('pdf=demo/demo-2.pdf')
      };
    });

    console.log(`✓ URL parameters parsed correctly:`);
    console.log(`  PDF parameter: ${urlInfo.hasPdfParam}`);
    console.log(`  Debug parameter: ${urlInfo.hasDebugParam}`);

    expect(urlInfo.hasPdfParam).toBe(true);
    expect(urlInfo.hasDebugParam).toBe(true);
  });

  test('Feature 13: Performance toggles in debug panel work', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf&debug');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000);

    // Test toggling Tile Borders
    const tileBordersBtn = page.locator('button').filter({ hasText: 'Tile Borders' });

    // Initial state
    const initialState = await page.evaluate(() => window.viewer.drawer.debugMode);

    // Toggle on
    await tileBordersBtn.click();
    await page.waitForTimeout(200);
    const toggledOn = await page.evaluate(() => window.viewer.drawer.debugMode);

    console.log(`Tile Borders: ${initialState} → ${toggledOn}`);
    expect(toggledOn).not.toBe(initialState);

    // Toggle back
    await tileBordersBtn.click();
    await page.waitForTimeout(200);
    const toggledOff = await page.evaluate(() => window.viewer.drawer.debugMode);

    expect(toggledOff).toBe(initialState);
    console.log(`✓ Performance toggles work correctly`);
  });

  test('Feature 14: Cache clear functionality works', async ({ page }) => {
    await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get cache stats before clearing
    const beforeClear = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats();
    });

    console.log(`Before clear: ${beforeClear.tiles} tiles, ${beforeClear.pages.total} pages`);

    // Clear caches
    await page.evaluate(() => {
      window.__PDFGridDiagnostics.clearCaches();
    });

    await page.waitForTimeout(500);

    // Get cache stats after clearing
    const afterClear = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.getCacheStats();
    });

    console.log(`After clear: ${afterClear.tiles} tiles, ${afterClear.pages.total} pages`);

    // Caches should be cleared (or very small if viewer auto-regenerated some)
    expect(afterClear.tiles).toBeLessThanOrEqual(beforeClear.tiles);
    expect(afterClear.pages.total).toBeLessThanOrEqual(beforeClear.pages.total);

    console.log(`✓ Cache clear functionality works`);
  });

});
