/**
 * Visual Tests - Blank Tile Detection
 *
 * Tests that detect blank or incomplete tiles by examining pixel data
 * at various zoom levels, especially at broad zoom where cache thrashing
 * is most likely to cause problems.
 */

const { test, expect } = require('@playwright/test');

test.describe('Blank tile detection', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to app with demo PDF
    await page.goto('http://localhost:8000?pdf=demo-3.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 10000 }
    );

    // Wait for initial rendering
    await page.waitForTimeout(3000);
  });

  test('L0 minimap tile should have minimal blank pixels', async ({ page }) => {
    // Zoom all the way out to L0 (minimap level)
    await page.evaluate(() => {
      window.viewer.viewport.goHome();
    });
    await page.waitForTimeout(2000);

    // Allow time for on-demand rendering and tile refresh
    await page.waitForTimeout(3000);

    // Analyze L0 tile pixel data
    const blankAnalysis = await page.evaluate(() => {
      // Get the viewer's tile cache
      const tiledImage = window.viewer.world.getItemAt(0);

      // Find all loaded tiles
      const loadedTiles = [];
      tiledImage._lastDrawn.forEach(tile => {
        if (tile.loaded && tile.cacheImageRecord) {
          loadedTiles.push({
            level: tile.level,
            x: tile.x,
            y: tile.y,
            url: tile.url
          });
        }
      });

      // Find L0 tile
      const l0Tile = loadedTiles.find(t => t.level === 0);

      if (!l0Tile) {
        return {
          found: false,
          error: 'L0 tile not found',
          loadedTiles: loadedTiles.map(t => `L${t.level}_${t.x}_${t.y}`)
        };
      }

      // Get the actual tile from the cache
      const tile = tiledImage._lastDrawn.find(t =>
        t.level === 0 && t.loaded && t.cacheImageRecord
      );

      if (!tile || !tile.cacheImageRecord) {
        return {
          found: true,
          error: 'L0 tile found but not loaded',
          tile: l0Tile
        };
      }

      // Get canvas from cache
      const canvas = tile.cacheImageRecord.getImage();
      const ctx = canvas.getContext('2d');
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const pixels = imageData.data;

      // Count blank (white) pixels
      let blankPixels = 0;
      let totalPixels = pixels.length / 4;

      for (let i = 0; i < pixels.length; i += 4) {
        const r = pixels[i];
        const g = pixels[i + 1];
        const b = pixels[i + 2];

        // Consider pixel blank if it's pure white (255,255,255)
        if (r === 255 && g === 255 && b === 255) {
          blankPixels++;
        }
      }

      const blankPercentage = (blankPixels / totalPixels) * 100;

      return {
        found: true,
        canvasSize: `${canvas.width}x${canvas.height}`,
        totalPixels,
        blankPixels,
        blankPercentage: blankPercentage.toFixed(2),
        tile: l0Tile
      };
    });

    console.log('L0 tile analysis:', JSON.stringify(blankAnalysis, null, 2));

    // L0 tile should be found
    expect(blankAnalysis.found).toBe(true);
    if (!blankAnalysis.found) {
      console.error('L0 tile not found. Loaded tiles:', blankAnalysis.loadedTiles);
    }

    // L0 tile should have <15% blank pixels
    // (allowing some margin for page spacing and borders)
    const blankPct = parseFloat(blankAnalysis.blankPercentage);
    expect(blankPct).toBeLessThan(15);
  });

  test('After panning at broad zoom, tiles should not be blank', async ({ page }) => {
    // Zoom to broad overview (L1 or L2)
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(0.5);  // Zoom out to overview
    });
    await page.waitForTimeout(1000);

    // Get initial stats
    const initialStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('Before pan:', initialStats.pages);

    // Pan around to trigger tile rendering
    for (let i = 0; i < 5; i++) {
      await page.evaluate((step) => {
        const dx = step % 2 === 0 ? 0.15 : -0.15;
        window.viewer.viewport.panBy(new OpenSeadragon.Point(dx, 0.1));
      }, i);
      await page.waitForTimeout(800);
    }

    // Wait for on-demand rendering to complete and tiles to refresh
    await page.waitForTimeout(3000);

    // Get final stats
    const finalStats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());
    console.log('After pan:', finalStats.pages);
    console.log('On-demand renders:', finalStats.onDemandRenders);
    console.log('On-demand hits:', finalStats.onDemandHits);

    // All on-demand renders should have completed
    expect(finalStats.onDemandHits).toBe(finalStats.onDemandRenders);

    // Fallback should be reasonable after waiting for renders
    expect(parseFloat(finalStats.tileRenderStats.fallbackPercentage)).toBeLessThan(70);
  });

  test('Deep zoom should not have blank tiles after waiting', async ({ page }) => {
    // Zoom in deep
    await page.evaluate(() => {
      window.viewer.viewport.zoomBy(3.0);
    });
    await page.waitForTimeout(2000);

    // Wait for on-demand rendering to complete
    await page.waitForTimeout(3000);

    const stats = await page.evaluate(() => window.__PDFGridDiagnostics.getCacheStats());

    console.log('Deep zoom stats:', {
      pages: stats.pages,
      fallback: stats.tileRenderStats.fallbackPercentage + '%',
      onDemand: `${stats.onDemandHits}/${stats.onDemandRenders}`
    });

    // After waiting, most on-demand renders should have completed
    const completionRate = stats.onDemandHits / Math.max(stats.onDemandRenders, 1);
    expect(completionRate).toBeGreaterThan(0.8); // At least 80% completion

    // Fallback should be low after waiting for renders
    expect(parseFloat(stats.tileRenderStats.fallbackPercentage)).toBeLessThan(50);
  });
});
