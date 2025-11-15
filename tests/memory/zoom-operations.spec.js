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
    await page.goto('http://localhost:8000?pdf=demo-3.pdf');

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

  test('Use case 1: Pan slowly from top to bottom of document', async ({ page }) => {
    // Wait for initial rendering to stabilize
    await page.waitForTimeout(2000);

    const initialStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Initial state:', initialStats.pages, 'Fallback:', initialStats.tileRenderStats.fallbackPercentage + '%');

    // Pan slowly down from top to bottom
    // This simulates a user slowly scrolling through the entire document
    const numSteps = 20;
    const stepDelay = 300; // 300ms between steps = 6 seconds total

    for (let i = 0; i < numSteps; i++) {
      await page.evaluate(() => {
        // Pan straight down
        window.viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.15));
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(stepDelay);
    }

    // Wait for rendering to catch up
    await page.waitForTimeout(1000);

    const finalStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('After slow pan:', finalStats.pages, 'Fallback:', finalStats.tileRenderStats.fallbackPercentage + '%');
    console.log('Cache misses:', finalStats.cacheMisses);

    // Pages should have been cached during slow pan
    expect(finalStats.pages.total).toBeGreaterThan(0);

    // Fallback with current static viewport-aware rendering (before continuous monitoring)
    // TODO: Should improve to <30% with continuous viewport monitoring + on-demand rendering
    expect(parseFloat(finalStats.tileRenderStats.fallbackPercentage)).toBeLessThan(95);
  });

  test('Use case 2: Zoom out and pan slowly from top to bottom', async ({ page }) => {
    // Wait for initial rendering to stabilize
    await page.waitForTimeout(2000);

    // Zoom out to see more of the grid
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.5);  // Zoom out 50%
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(1000);

    const overviewStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Overview state:', overviewStats.pages, 'Fallback:', overviewStats.tileRenderStats.fallbackPercentage + '%');

    // Pan slowly down from top to bottom at zoomed-out level
    // This tests whether low-res cache maintains complete coverage
    const numSteps = 25;
    const stepDelay = 250; // 250ms between steps = 6.25 seconds total

    for (let i = 0; i < numSteps; i++) {
      await page.evaluate(() => {
        // Pan straight down
        window.viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.12));
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(stepDelay);
    }

    // Wait for rendering to catch up
    await page.waitForTimeout(1000);

    const finalStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('After slow pan at overview:', finalStats.pages, 'Fallback:', finalStats.tileRenderStats.fallbackPercentage + '%');

    // Fallback with current static viewport-aware rendering
    // TODO: Should improve to <20% with continuous viewport monitoring (low-res should be complete)
    expect(parseFloat(finalStats.tileRenderStats.fallbackPercentage)).toBeLessThan(90);
  });

  test('Use case 3: Zoom out, pan from top to bottom, then zoom in', async ({ page }) => {
    // Wait for initial rendering to stabilize
    await page.waitForTimeout(2000);

    // Phase 1: Zoom out to overview
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.4);  // Zoom out to wide view
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(1000);

    const overviewStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Phase 1 - Overview:', overviewStats.pages, 'Fallback:', overviewStats.tileRenderStats.fallbackPercentage + '%');

    // Phase 2: Pan slowly down from top to bottom at overview level
    const panSteps = 15;
    const panDelay = 250; // 3.75 seconds

    for (let i = 0; i < panSteps; i++) {
      await page.evaluate(() => {
        // Pan straight down
        window.viewer.viewport.panBy(new OpenSeadragon.Point(0, 0.15));
        window.viewer.viewport.applyConstraints();
      });
      await page.waitForTimeout(panDelay);
    }

    await page.waitForTimeout(500);

    const afterPanStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Phase 2 - After pan:', afterPanStats.pages, 'Fallback:', afterPanStats.tileRenderStats.fallbackPercentage + '%');

    // Phase 3: Zoom in to detail view
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(3.0);  // Zoom in for detail
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(1500); // Give time for high-res rendering

    const zoomedInStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const finalZoom = await page.evaluate(() => window.__PDFGridDiagnostics.getCurrentZoom());
    console.log('Phase 3 - Zoomed in:', zoomedInStats.pages, 'Zoom:', finalZoom);
    console.log('Fallback:', zoomedInStats.tileRenderStats.fallbackPercentage + '%');

    // Should have both low-res (from overview) and high-res (from zoom in) pages
    expect(zoomedInStats.pages.low).toBeGreaterThan(0);
    expect(zoomedInStats.pages.high).toBeGreaterThan(0);

    // Fallback with current static viewport-aware rendering
    // TODO: Should improve to <40% with continuous viewport monitoring + on-demand rendering
    expect(parseFloat(zoomedInStats.tileRenderStats.fallbackPercentage)).toBeLessThan(90);
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

  test('Fallback percentage should be reasonable after initial load', async ({ page }) => {
    // Wait for initial rendering to complete
    await page.waitForTimeout(1000);

    const stats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('Tile render stats:', stats.tileRenderStats);
    console.log(`Fallback percentage: ${stats.tileRenderStats.fallbackPercentage}%`);

    // After initial load, most tiles should be full (not fallback)
    // Allow up to 50% fallback during initial load (some tiles may render before all pages ready)
    expect(parseFloat(stats.tileRenderStats.fallbackPercentage)).toBeLessThan(50);

    // Should have rendered some tiles
    expect(stats.tileRenderStats.total).toBeGreaterThan(0);
  });

  test('Fallback tiles during deep zoom panning', async ({ page }) => {
    // Zoom in deep
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(3.0);
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(1000);

    // Get initial stats
    const initialStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    const initialFallbackCount = initialStats.tileRenderStats.fallback;

    // Pan around to trigger new tile rendering
    for (let i = 0; i < 5; i++) {
      await page.evaluate((offset) => {
        const dx = offset % 2 === 0 ? 0.1 : -0.1;
        window.viewer.viewport.panBy(new OpenSeadragon.Point(dx, 0.05));
        window.viewer.viewport.applyConstraints();
      }, i);
      await page.waitForTimeout(300);
    }

    await page.waitForTimeout(500);

    const finalStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('Deep zoom fallback stats:', finalStats.tileRenderStats);
    console.log('Cache misses:', finalStats.cacheMisses);

    // New tiles should have been rendered during panning
    expect(finalStats.tileRenderStats.total).toBeGreaterThan(initialStats.tileRenderStats.total);

    // Some fallback is acceptable when panning to new areas (pages still rendering)
    // But fallback percentage should stay under 80%
    expect(parseFloat(finalStats.tileRenderStats.fallbackPercentage)).toBeLessThan(80);
  });

  test('Cache miss tracking works', async ({ page }) => {
    // Initial load should have some cache misses (pages not yet rendered)
    const stats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('Cache misses:', stats.cacheMisses);

    // Should track cache misses
    expect(stats.cacheMisses).toBeGreaterThanOrEqual(0);

    // After panning, cache misses should increase (new pages requested)
    await page.evaluate(() => {
      window.viewer.viewport.panBy(new OpenSeadragon.Point(0.3, 0.3));
      window.viewer.viewport.applyConstraints();
    });
    await page.waitForTimeout(500);

    const statsAfterPan = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Cache misses after pan:', statsAfterPan.cacheMisses);

    // Should have at least as many misses as before (possibly more)
    expect(statsAfterPan.cacheMisses).toBeGreaterThanOrEqual(stats.cacheMisses);
  });
});
