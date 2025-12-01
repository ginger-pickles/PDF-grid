/**
 * Rendered Counter Test
 *
 * Examines the "Rendered" counter in debug mode to validate rendering efficiency.
 * The counter shows how many tiles have been rendered, which should correlate with:
 * - Viewport size (fewer tiles = better performance)
 * - Zoom level (higher zoom = more tiles needed)
 * - Background rendering progress (more rendered = closer to complete)
 *
 * Key metrics to validate:
 * - Initial render should only render viewport tiles (not entire document)
 * - Zooming should trigger appropriate tile re-rendering
 * - Background rendering should progressively increase counter
 * - Counter should not exceed total possible tiles significantly
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// Helper: Get rendered counter value from debug panel
// Format: "Rendered: Full: 123, Fallback: 45 (26.8%)"
async function getRenderedCount(page) {
  const renderedText = await page.locator('text=/Rendered:.*$/').first().textContent();
  const match = renderedText.match(/Rendered:\s*Full:\s*(\d+)/);
  return match ? parseInt(match[1], 10) : 0;
}

// Helper: Get total tiles at base level (L0)
// This represents the total grid cells at the lowest resolution
async function getTotalTiles(page) {
  return await page.evaluate(() => {
    if (!window.tileStreamerRef) return 0;

    const tileStreamer = window.tileStreamerRef;

    // Total tiles at L0 (base level, no scaling)
    const cols = tileStreamer.gridDims.cols;
    const rows = tileStreamer.gridDims.rows;

    return cols * rows;
  });
}

// Helper: Get cache stats from debug panel
async function getCacheStats(page) {
  return await page.evaluate(() => {
    if (window.tileStreamerRef && window.tileStreamerRef.tileCache) {
      return {
        size: window.tileStreamerRef.tileCache.cache.size,
        maxSize: window.tileStreamerRef.tileCache.maxSize,
        hits: window.tileStreamerRef.tileCache.hits,
        misses: window.tileStreamerRef.tileCache.misses,
        hitRate: window.tileStreamerRef.tileCache.hits /
                 (window.tileStreamerRef.tileCache.hits + window.tileStreamerRef.tileCache.misses)
      };
    }
    return null;
  });
}

// Helper: Get background rendering status
async function getBackgroundStatus(page) {
  return await page.evaluate(() => {
    if (typeof window.backgroundRenderingStatus === 'function') {
      return window.backgroundRenderingStatus();
    }
    return null;
  });
}

test.describe('Rendered Counter Analysis', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate with debug mode enabled
    await page.goto('http://localhost:8000/index.html?debug=1');
    await page.waitForLoadState('domcontentloaded');
  });

  test('should show rendered counter in debug mode', async ({ page }) => {
    // Upload a PDF
    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    // Wait for PDF to load
    await page.waitForTimeout(2000);

    // Verify rendered counter is visible
    const renderedElement = page.locator('text=/Rendered:.*$/').first();
    await expect(renderedElement).toBeVisible();

    const renderedCount = await getRenderedCount(page);
    console.log('Rendered tiles:', renderedCount);

    // Rendered count should be > 0 after loading
    expect(renderedCount).toBeGreaterThan(0);
  });

  test('CRITICAL: Initial render should only render viewport tiles', async ({ page }) => {
    // This tests the viewport-first optimization
    // Initial render should NOT render all tiles, only what's visible

    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    // Wait for initial render to complete
    await page.waitForTimeout(3000);

    const renderedCount = await getRenderedCount(page);
    const totalTiles = await getTotalTiles(page);

    console.log(`Initial render: ${renderedCount} / ${totalTiles} tiles (${(renderedCount/totalTiles*100).toFixed(1)}%)`);

    // CRITICAL: Initial render should be small fraction of total
    // At zoom level 0, should only render visible tiles
    // For a 48-page PDF in 7x7 grid, total tiles at L0 = 2304 (48x48)
    // But viewport should only show ~10-50 tiles depending on screen size

    // Assert: Rendered should be much less than total (< 5% for initial viewport)
    const renderRatio = renderedCount / totalTiles;
    expect(renderRatio).toBeLessThan(0.05); // Less than 5% initially rendered

    console.log(`✓ Viewport-first optimization working: Only ${(renderRatio * 100).toFixed(2)}% of tiles rendered initially`);
  });

  test('should track rendering progress as background rendering proceeds', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(2000);

    // Track rendered count over time
    const samples = [];
    for (let i = 0; i < 10; i++) {
      const renderedCount = await getRenderedCount(page);
      const bgStatus = await getBackgroundStatus(page);

      samples.push({
        time: i * 500,
        rendered: renderedCount,
        bgLevel: bgStatus?.currentLevel || 'N/A',
        bgProgress: bgStatus?.percentComplete || 'N/A'
      });

      await page.waitForTimeout(500);
    }

    console.log('\nRendered Counter Progress:');
    console.table(samples);

    // Verify rendered count increases over time (or stays same if complete)
    const firstSample = samples[0].rendered;
    const lastSample = samples[samples.length - 1].rendered;

    expect(lastSample).toBeGreaterThanOrEqual(firstSample);

    console.log(`✓ Rendered count progressed from ${firstSample} to ${lastSample} tiles`);
  });

  test('should correlate rendered count with cache size', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(3000);

    const renderedCount = await getRenderedCount(page);
    const cacheStats = await getCacheStats(page);

    console.log('\nRendered vs Cache:');
    console.log(`  Rendered tiles: ${renderedCount}`);
    console.log(`  Cached tiles:   ${cacheStats?.size || 'N/A'}`);
    console.log(`  Cache max:      ${cacheStats?.maxSize || 'N/A'}`);
    console.log(`  Cache hit rate: ${((cacheStats?.hitRate || 0) * 100).toFixed(1)}%`);

    // Rendered count should be <= cache size (all rendered tiles should be cached)
    if (cacheStats) {
      expect(cacheStats.size).toBeGreaterThanOrEqual(renderedCount * 0.8); // Allow some eviction
      console.log(`✓ Cache contains ${(cacheStats.size / renderedCount * 100).toFixed(1)}% of rendered tiles`);
    }
  });

  test('should increase rendered count when zooming', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(2000);

    const initialRendered = await getRenderedCount(page);
    console.log(`Initial rendered (L0): ${initialRendered}`);

    // Zoom in to L2
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.zoomTo(2.0, null, true);
      }
    });

    await page.waitForTimeout(1500);

    const afterZoomRendered = await getRenderedCount(page);
    console.log(`After zoom to L2: ${afterZoomRendered}`);

    // Zooming should require rendering more tiles at higher resolution
    expect(afterZoomRendered).toBeGreaterThan(initialRendered);

    console.log(`✓ Zoom increased rendered count by ${afterZoomRendered - initialRendered} tiles`);
  });

  test('CRITICAL: Rendered count should not exceed reasonable bounds', async ({ page }) => {
    // This test detects excessive re-rendering or rendering bugs

    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(3000);

    const renderedCount = await getRenderedCount(page);
    const totalTiles = await getTotalTiles(page);

    console.log(`\nRendering Bounds Check:`);
    console.log(`  Rendered: ${renderedCount}`);
    console.log(`  Total:    ${totalTiles}`);
    console.log(`  Ratio:    ${(renderedCount/totalTiles).toFixed(2)}x`);

    // Rendered should not exceed total tiles significantly
    // Some overhead is OK (re-rendering during zoom), but not excessive
    expect(renderedCount).toBeLessThan(totalTiles * 1.5); // Max 150% of total

    if (renderedCount > totalTiles) {
      console.warn(`⚠ Rendered count exceeds total tiles - possible re-rendering`);
    } else {
      console.log(`✓ Rendered count within reasonable bounds`);
    }
  });

  test('should measure rendering efficiency over full session', async ({ page }) => {
    // Comprehensive test: Load PDF, wait for background rendering, zoom around, check efficiency

    console.log('\n=== RENDERING EFFICIENCY SESSION ===\n');

    const pdfPath = path.resolve(__dirname, '../demo/demo-1.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(2000);

    // 1. Initial state
    const initial = {
      rendered: await getRenderedCount(page),
      cache: await getCacheStats(page),
      background: await getBackgroundStatus(page)
    };

    console.log('1. Initial State:');
    console.log(`   Rendered: ${initial.rendered}`);
    console.log(`   Cache: ${initial.cache?.size || 'N/A'} / ${initial.cache?.maxSize || 'N/A'}`);
    console.log(`   Background: Level ${initial.background?.currentLevel}, ${initial.background?.percentComplete}% complete`);

    // 2. After background rendering progresses
    await page.waitForTimeout(5000);

    const afterBg = {
      rendered: await getRenderedCount(page),
      cache: await getCacheStats(page),
      background: await getBackgroundStatus(page)
    };

    console.log('\n2. After Background Rendering:');
    console.log(`   Rendered: ${afterBg.rendered} (+${afterBg.rendered - initial.rendered})`);
    console.log(`   Cache: ${afterBg.cache?.size || 'N/A'} / ${afterBg.cache?.maxSize || 'N/A'}`);
    console.log(`   Background: Level ${afterBg.background?.currentLevel}, ${afterBg.background?.percentComplete}% complete`);

    // 3. After zoom
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.zoomTo(4.0, null, true);
      }
    });
    await page.waitForTimeout(1000);

    const afterZoom = {
      rendered: await getRenderedCount(page),
      cache: await getCacheStats(page)
    };

    console.log('\n3. After Zoom to L4:');
    console.log(`   Rendered: ${afterZoom.rendered} (+${afterZoom.rendered - afterBg.rendered})`);
    console.log(`   Cache: ${afterZoom.cache?.size || 'N/A'} / ${afterZoom.cache?.maxSize || 'N/A'}`);

    // 4. Final analysis
    const totalTiles = await getTotalTiles(page);

    console.log('\n4. Final Analysis:');
    console.log(`   Total possible tiles: ${totalTiles}`);
    console.log(`   Total rendered: ${afterZoom.rendered}`);
    console.log(`   Rendering efficiency: ${(afterZoom.rendered / totalTiles * 100).toFixed(1)}%`);
    console.log(`   Cache hit rate: ${(afterZoom.cache?.hitRate * 100 || 0).toFixed(1)}%`);

    // Assertions
    expect(afterBg.rendered).toBeGreaterThan(initial.rendered); // Background rendering worked
    expect(afterZoom.rendered).toBeGreaterThan(afterBg.rendered); // Zoom triggered rendering

    if (afterZoom.cache) {
      expect(afterZoom.cache.hitRate).toBeGreaterThan(0.3); // At least 30% cache hit rate
    }

    console.log('\n✓ Rendering efficiency session complete');
    console.log('=== END SESSION ===\n');
  });

});
