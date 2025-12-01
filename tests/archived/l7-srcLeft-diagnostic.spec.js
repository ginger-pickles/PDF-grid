// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Focused diagnostic to capture srcLeft values for L7 tiles
 * This will tell us if different tiles are getting the same srcLeft (the bug)
 */
test.describe('L7 srcLeft Diagnostic', () => {
  test('capture srcLeft values for L7 tiles on demo-3.pdf', async ({ page }) => {
    test.setTimeout(120000);

    // Collect [DrawPage] logs
    const drawLogs = [];
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('[DrawPage]')) {
        drawLogs.push(text);
      }
    });

    // Navigate with local PDF (marie-neurath.pdf is the heavy PDF that triggers the bug)
    await page.goto('http://localhost:8000/?pdf=marie-neurath.pdf&debug=1');

    // Wait for PDF to load
    await page.waitForTimeout(10000);

    // Enable verbose logging
    await page.evaluate(() => {
      if (window.CONFIG) {
        window.CONFIG.VERBOSE_LOGGING = true;
      }
    });

    // Enable tile labels
    const tileLabelBtn = page.locator('button:has-text("Tile Labels")');
    if (await tileLabelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tileLabelBtn.click();
    }

    // Get grid dimensions and calculate what zoom we need for L7
    const gridInfo = await page.evaluate(() => {
      const ts = window.tileStreamer;
      if (!ts) return null;
      return {
        maxLevel: ts.maxLevel,
        tileWidth: ts.tileWidth,
        tileHeight: ts.tileHeight,
        gridDims: ts.gridDims,
        pageWidth: ts.gridDims?.pageWidth,
        pageHeight: ts.gridDims?.pageHeight,
        cellWidth: ts.gridDims?.pageWidth + ts.gridDims?.spacing,
        spacing: ts.gridDims?.spacing
      };
    });
    console.log('Grid info:', JSON.stringify(gridInfo, null, 2));

    // Zoom in to reach L7 (or whatever maxLevel-1 is)
    const targetLevel = gridInfo ? Math.min(7, gridInfo.maxLevel) : 7;
    console.log(`Target level: ${targetLevel}`);

    // Zoom in aggressively
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        if (window.osdViewerRef) {
          const currentZoom = window.osdViewerRef.viewport.getZoom();
          window.osdViewerRef.viewport.zoomTo(currentZoom * 2);
        }
      });
      await page.waitForTimeout(1000);

      // Check current level
      const currentLevel = await page.evaluate(() => {
        if (!window.osdViewerRef || !window.tileStreamer) return -1;
        const zoom = window.osdViewerRef.viewport.getZoom();
        const level = Math.round(Math.log2(zoom) + window.tileStreamer.maxLevel);
        return Math.max(0, Math.min(level, window.tileStreamer.maxLevel));
      });
      console.log(`After zoom ${i+1}: level ${currentLevel}, zoom ${await page.evaluate(() => window.osdViewerRef?.viewport.getZoom())}`);

      if (currentLevel >= targetLevel) break;
    }

    // Pan to top-left area (where page 1 is)
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.panTo(new OpenSeadragon.Point(0.15, 0.15));
      }
    });

    // Wait for tiles to render
    await page.waitForTimeout(3000);

    // Take screenshot
    await page.screenshot({ path: 'test-results/l7-srcLeft-diag.png' });

    // Analyze collected logs
    console.log(`\n=== ${drawLogs.length} [DrawPage] logs collected ===\n`);

    // Parse logs to extract key values
    const parsed = drawLogs.map(log => {
      const keyMatch = log.match(/key=([\S]+)/);
      const pageMatch = log.match(/page=(\d+)/);
      const srcMatch = log.match(/src=\((\d+),(\d+),(\d+),(\d+)\)/);
      const tileLeftMatch = log.match(/tileLeft=(\d+)/);
      const pageLeftMatch = log.match(/pageLeft=(\d+)/);

      return {
        key: keyMatch?.[1],
        page: pageMatch?.[1],
        srcLeft: srcMatch?.[1],
        srcTop: srcMatch?.[2],
        srcWidth: srcMatch?.[3],
        srcHeight: srcMatch?.[4],
        tileLeft: tileLeftMatch?.[1],
        pageLeft: pageLeftMatch?.[1]
      };
    });

    // Group by page and look for tiles with same page but different keys
    const byPage = {};
    for (const p of parsed) {
      if (!p.page) continue;
      if (!byPage[p.page]) byPage[p.page] = [];
      byPage[p.page].push(p);
    }

    console.log('\n=== ANALYSIS BY PAGE ===\n');
    for (const [pageNum, entries] of Object.entries(byPage)) {
      // Get unique keys for this page
      const uniqueKeys = [...new Set(entries.map(e => e.key))];
      if (uniqueKeys.length > 1) {
        console.log(`Page ${pageNum} - ${uniqueKeys.length} different tile keys:`);

        // Show details for each unique key
        const byKey = {};
        for (const e of entries) {
          if (!byKey[e.key]) byKey[e.key] = e;
        }

        for (const key of uniqueKeys) {
          const e = byKey[key];
          console.log(`  ${key}: srcLeft=${e.srcLeft}, tileLeft=${e.tileLeft}, pageLeft=${e.pageLeft}`);
        }

        // Check for duplicate srcLeft values
        const srcLeftValues = uniqueKeys.map(k => byKey[k].srcLeft);
        const uniqueSrcLeft = [...new Set(srcLeftValues)];

        if (uniqueSrcLeft.length < uniqueKeys.length) {
          console.log(`  *** BUG DETECTED: ${uniqueKeys.length} keys but only ${uniqueSrcLeft.length} unique srcLeft values! ***`);
        }
      }
    }

    // Look for any tiles with different keys but same srcLeft
    const bySrcLeft = {};
    for (const p of parsed) {
      if (!p.srcLeft || !p.key) continue;
      const srcKey = `${p.page}_${p.srcLeft}_${p.srcTop}`;
      if (!bySrcLeft[srcKey]) bySrcLeft[srcKey] = [];
      bySrcLeft[srcKey].push(p);
    }

    console.log('\n=== TILES WITH SAME SRC POSITION ===\n');
    for (const [srcKey, tiles] of Object.entries(bySrcLeft)) {
      const uniqueKeys = [...new Set(tiles.map(t => t.key))];
      if (uniqueKeys.length > 1) {
        console.log(`Same src position ${srcKey} used by ${uniqueKeys.length} different tiles:`);
        for (const t of tiles) {
          console.log(`  ${t.key}: tileLeft=${t.tileLeft}`);
        }
      }
    }

    // Test passes if we collected data
    expect(drawLogs.length).toBeGreaterThan(0);
  });
});
