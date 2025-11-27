// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Diagnostic test to capture tile drawing coordinates
 * This will show if src rectangles are actually different for tiles with different fingerprints
 */
test.describe('Tile Draw Diagnostic', () => {
  test('capture L7 tile drawing coordinates', async ({ page }) => {
    test.setTimeout(90000);

    // Collect console logs
    const drawLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[DrawPage]')) {
        drawLogs.push(text);
        console.log(text);
      }
    });

    // Navigate with debug mode
    await page.goto('http://localhost:8000/?pdf=demo-3.pdf&debug=1');

    // Wait for page to load
    await page.waitForTimeout(5000);

    // Enable verbose logging
    await page.evaluate(() => {
      if (window.CONFIG) {
        window.CONFIG.VERBOSE_LOGGING = true;
        console.log('VERBOSE_LOGGING enabled');
      }
    });

    // Enable tile labels
    const tileLabelBtn = page.locator('button:has-text("Tile Labels")');
    if (await tileLabelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tileLabelBtn.click();
    }

    // Wait for initial render
    await page.waitForTimeout(3000);

    // Zoom in to trigger L7 tiles
    for (let i = 0; i < 5; i++) {
      await page.evaluate(() => {
        if (window.osdViewerRef) {
          const currentZoom = window.osdViewerRef.viewport.getZoom();
          window.osdViewerRef.viewport.zoomTo(currentZoom * 1.5);
        }
      });
      await page.waitForTimeout(1500);
    }

    // Pan to an area with page 1
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.panTo(new OpenSeadragon.Point(0.2, 0.15));
      }
    });

    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/tile-draw-diag.png' });

    // Get current zoom level
    const zoomLevel = await page.evaluate(() => {
      return window.osdViewerRef?.viewport.getZoom() || 0;
    });
    console.log(`Final zoom level: ${zoomLevel}`);

    // Analyze draw logs - look for tiles with same page but different tileLeft
    console.log(`\n=== ANALYSIS: ${drawLogs.length} L7 draw operations ===`);

    // Parse logs
    const parsed = drawLogs.map(log => {
      const keyMatch = log.match(/key=(\S+)/);
      const pageMatch = log.match(/page=(\d+)/);
      const srcMatch = log.match(/src=\((\d+),(\d+),(\d+),(\d+)\)/);
      const tileLeftMatch = log.match(/tileLeft=(\d+)/);
      const pageLeftMatch = log.match(/pageLeft=(\d+)/);

      return {
        key: keyMatch?.[1],
        page: pageMatch?.[1],
        srcLeft: srcMatch?.[1],
        srcTop: srcMatch?.[2],
        tileLeft: tileLeftMatch?.[1],
        pageLeft: pageLeftMatch?.[1]
      };
    });

    // Group by page
    const byPage = {};
    for (const p of parsed) {
      if (!p.page) continue;
      if (!byPage[p.page]) byPage[p.page] = [];
      byPage[p.page].push(p);
    }

    // Look for same page with different keys but same srcLeft
    for (const [pageNum, entries] of Object.entries(byPage)) {
      const byKey = {};
      for (const e of entries) {
        if (!byKey[e.key]) byKey[e.key] = e;
      }

      const keys = Object.keys(byKey);
      if (keys.length > 1) {
        console.log(`\nPage ${pageNum} drawn with ${keys.length} different keys:`);
        for (const k of keys.slice(0, 5)) {
          const e = byKey[k];
          console.log(`  ${k}: srcLeft=${e.srcLeft} tileLeft=${e.tileLeft}`);
        }

        // Check if any have same srcLeft
        const srcLefts = keys.map(k => byKey[k].srcLeft);
        const uniqueSrcLefts = new Set(srcLefts);
        if (uniqueSrcLefts.size < keys.length) {
          console.log(`  WARNING: Some tiles have SAME srcLeft despite different keys!`);
        }
      }
    }

    // Test passes if we collected data
    expect(drawLogs.length).toBeGreaterThan(0);
  });
});
