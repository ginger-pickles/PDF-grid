/**
 * Memory Monitoring Tests - Zoom Operations
 *
 * Tests PageCache and TileCache behavior during zoom in/out operations.
 * Goal: Detect memory leaks and unbounded cache growth.
 */

const { test, expect } = require('@playwright/test');

test.describe('Memory monitoring during zoom operations', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to app with demo PDF
    await page.goto('http://localhost:8000?pdf=demo-1.pdf');

    // Wait for PDF to load, viewer to be available, and diagnostics to be ready
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 10000 }
    );

    // Wait a bit more for initial rendering to complete
    await page.waitForTimeout(2000);
  });

  test('PageCache should be populated after initial load', async ({ page }) => {
    const stats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('Initial cache stats:', stats);

    // Should have some pages cached after initial render
    expect(stats.pages.total).toBeGreaterThan(0);

    // Should have some tiles cached
    expect(stats.tiles).toBeGreaterThan(0);
  });

  test('Memory estimate should be reasonable', async ({ page }) => {
    const memoryInfo = await page.evaluate(() => window.__PDFGridDiagnostics.getMemoryEstimate());

    console.log('Memory estimate:', memoryInfo);

    // For demo PDF, should be under 50MB
    expect(memoryInfo.estimatedMB).toBeLessThan(50);
  });

  test('Use case 1: Zoom out and pan after initial load', async ({ page }) => {
    // Get initial cache size
    const initialStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Initial pages:', initialStats.pages.total, 'Initial zoom:', await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom()));

    // Zoom out to see more of the grid (typical user workflow)
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.5);  // Zoom out 50%
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    // Pan around to explore the grid
    await page.evaluate(() => {
      const center = window.viewer.viewport.getCenter();
      window.viewer.viewport.panBy(new OpenSeadragon.Point(0.2, 0.2));
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    await page.evaluate(() => {
      window.viewer.viewport.panBy(new OpenSeadragon.Point(-0.3, 0.1));
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    const finalStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const finalZoom = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('After zoom out & pan - Pages:', finalStats.pages.total, 'Zoom:', finalZoom);

    // PageCache should have grown (more pages visible and rendered)
    expect(finalStats.pages.total).toBeGreaterThan(initialStats.pages.total);
  });

  test('Use case 2: Zoom in from overview and pan at mid zoom', async ({ page }) => {
    // Start by zooming out to overview
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.4);  // Zoom out to overview
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    const overviewStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Overview - Pages:', overviewStats.pages.total);

    // Now zoom in to mid-level detail
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(2.5);  // Zoom in for mid-level detail
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    // Pan around at mid zoom
    for (let i = 0; i < 3; i++) {
      await page.evaluate(() => {
        window.viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0.1));
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(300);
    }

    const midZoomStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const midZoom = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('Mid zoom & pan - Pages:', midZoomStats.pages.total, 'Zoom:', midZoom);

    // Should have cached pages from both overview and mid zoom
    expect(midZoomStats.pages.total).toBeGreaterThan(0);
  });

  test('Use case 3: Zoom in and pan at deep zoom', async ({ page }) => {
    // Zoom in to deep zoom level
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(3.0);  // Deep zoom for detail
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    const initialDeepStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Deep zoom - Pages:', initialDeepStats.pages.total);

    // Pan around at deep zoom (should trigger high-res tile rendering)
    for (let i = 0; i < 4; i++) {
      await page.evaluate((offset) => {
        const dx = offset % 2 === 0 ? 0.05 : -0.05;
        const dy = Math.floor(offset / 2) % 2 === 0 ? 0.05 : -0.05;
        window.viewer.viewport.panBy(new OpenSeadragon.Point(dx, dy));
        window.viewer.viewport.applyConstraints();
      }, i);
      await page.waitForTimeout(300);
    }

    const deepZoomStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const deepZoom = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    const memory = await page.evaluate(() => window.__PDFGridDiagnostics.getMemoryEstimate());
    console.log('Deep zoom & pan - Pages:', deepZoomStats.pages.total, 'Zoom:', deepZoom, 'Memory:', memory.estimatedMB + 'MB');

    // At deep zoom, should have high-res tiles cached
    expect(deepZoomStats.pages.high).toBeGreaterThan(0);
  });

  test('PageCache should not grow indefinitely', async ({ page }) => {
    const maxPages = 100; // PageCache LRU limit (CONFIG.PAGE_CACHE_MAX_SIZE)

    // Zoom out aggressively
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.viewer.viewport.zoomBy(0.7);
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(200);
    }

    // Zoom in and out randomly with panning
    for (let i = 0; i < 10; i++) {
      await page.evaluate((index) => {
        const zoomFactor = index % 2 === 0 ? 0.8 : 1.3;
        window.viewer.viewport.zoomBy(zoomFactor);
        window.viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0.1));
        window.viewer.viewport.applyConstraints();
      }, i);
      await page.waitForTimeout(200);
    }

    const stats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const memory = await page.evaluate(() => window.__PDFGridDiagnostics.getMemoryEstimate());

    console.log('After aggressive zoom - Pages:', stats.pages.total, 'Memory:', memory.estimatedMB + 'MB');

    // PageCache should respect LRU eviction limit
    expect(stats.pages.total).toBeLessThanOrEqual(maxPages);

    // Memory should stay reasonable (under 100MB for demo PDF with LRU)
    expect(memory.estimatedMB).toBeLessThan(100);
  });

  test('TileCache behavior during zoom', async ({ page }) => {
    // Get initial tile count
    const initialStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Initial tiles:', initialStats.tiles);

    // Zoom in multiple times to generate more tiles
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        window.viewer.viewport.zoomBy(1.5);
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(1000);

    const zoomedStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('After zoom in tiles:', zoomedStats.tiles);

    // TileCache should have limit (300)
    expect(zoomedStats.tiles).toBeLessThanOrEqual(300);
  });

  test('Cache clear functionality works', async ({ page }) => {
    // Let some caching happen
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.7);
      window.viewer.viewport.panBy(new OpenSeadragon.Point(0.1, 0.1));
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    const beforeClear = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    expect(beforeClear.pages.total).toBeGreaterThan(0);

    // Clear caches
    await page.evaluate(() => window.__PDFGridDiagnostics.clearCaches());

    // Check caches are cleared
    const afterClear = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('After clear:', afterClear);

    // Caches should be empty or very small
    expect(afterClear.pages.total).toBeLessThan(beforeClear.pages.total);
  });

  test('Current zoom level is trackable', async ({ page }) => {
    const initialZoom = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('Initial zoom:', initialZoom);

    // Zoom in using OpenSeadragon API
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(1.5);
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(300);

    const zoomedIn = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('After zoom in:', zoomedIn);

    expect(zoomedIn).toBeGreaterThan(initialZoom);

    // Zoom out
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.6);
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(300);

    const zoomedOut = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('After zoom out:', zoomedOut);

    expect(zoomedOut).toBeLessThan(zoomedIn);
  });
});
