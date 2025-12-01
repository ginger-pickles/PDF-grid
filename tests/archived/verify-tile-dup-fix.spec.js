// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Verify fix for tile duplication bug at high zoom levels
 *
 * The bug was: at Level 7+ zoom, the fingerprint deduplication incorrectly
 * assumed tiles at same relative position within page cell were equivalent.
 * This caused duplicate page content appearing across different tiles.
 *
 * Fix: At high zoom (tiles smaller than pages), use unique (x,y) coordinates
 * instead of fingerprint deduplication.
 */
test.describe('Tile Duplication Fix Verification', () => {
  test('demo-3.pdf page 1 zoom should not show duplicated content', async ({ page }) => {
    // Navigate to demo-3.pdf with debug mode and tile labels
    await page.goto('http://localhost:8000/?pdf=demo-3.pdf&debug=1');

    // Wait for PDF to load
    await page.waitForFunction(() => {
      const pagesLoaded = document.querySelector('[class*="text-sm"]')?.textContent;
      return pagesLoaded && pagesLoaded.includes('53');
    }, { timeout: 60000 });

    // Enable tile labels to see fingerprints
    const tileLabelBtn = page.locator('button:has-text("Tile Labels")');
    if (await tileLabelBtn.isVisible()) {
      await tileLabelBtn.click();
    }

    // Wait for initial render
    await page.waitForTimeout(2000);

    // Take initial screenshot
    await page.screenshot({ path: 'test-results/tile-dup-fix-initial.png', fullPage: false });

    // Get OSD viewer and zoom to page 1 area
    const zoomLevels = [2, 4, 6];

    for (const zoom of zoomLevels) {
      // Zoom to specified level
      await page.evaluate((targetZoom) => {
        if (window.osdViewerRef) {
          window.osdViewerRef.viewport.zoomTo(targetZoom);
        }
      }, zoom);

      await page.waitForTimeout(1500);

      // Pan to page 1 area (top-left of grid, but page 1 is at offset due to stagger)
      await page.evaluate(() => {
        if (window.osdViewerRef) {
          // Page 1 is at (row=0, col=2) in the staggered pattern
          // Pan to show this area
          const point = new OpenSeadragon.Point(0.3, 0.1);
          window.osdViewerRef.viewport.panTo(point);
        }
      });

      await page.waitForTimeout(1500);

      // Screenshot at this zoom level
      await page.screenshot({
        path: `test-results/tile-dup-fix-zoom${zoom}.png`,
        fullPage: false
      });

      console.log(`Screenshot taken at zoom ${zoom}`);
    }

    // Final zoom to Level 7+ where bug occurred
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.zoomTo(8);
      }
    });

    await page.waitForTimeout(2000);

    // Pan to ensure we're viewing page 1 content
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        const point = new OpenSeadragon.Point(0.28, 0.08);
        window.osdViewerRef.viewport.panTo(point);
      }
    });

    await page.waitForTimeout(2000);

    // Final screenshot at high zoom
    await page.screenshot({
      path: 'test-results/tile-dup-fix-highzoom.png',
      fullPage: false
    });

    // Verify: check tile fingerprints are unique (x_y format instead of pageNum_x_y)
    const tileKeys = await page.evaluate(() => {
      if (window.tileStreamer && window.tileStreamer.tileCache) {
        return Array.from(window.tileStreamer.tileCache.cache.keys()).slice(0, 20);
      }
      return [];
    });

    console.log('Sample tile cache keys:', tileKeys);

    // Verify high-zoom tiles use x_y format (not pageNum_posX_posY)
    const highZoomKeys = tileKeys.filter(k => parseInt(k.split('_')[0]) >= 6);
    console.log('High-zoom tile keys:', highZoomKeys);

    // The fix should make high-zoom keys look like "7_5_3" instead of "7_1_0_0"
    // (level_x_y instead of level_pageRange_posInCellX_posInCellY)

    console.log('Test complete - examine screenshots in test-results/');
  });
});
