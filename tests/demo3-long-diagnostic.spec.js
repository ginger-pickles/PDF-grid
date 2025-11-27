// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Long-running diagnostic test for demo-3.pdf tile duplication
 * Runs for 30+ seconds capturing detailed tile generation info
 */
test.describe('Demo-3 Long Diagnostic', () => {
  test('monitor tile generation for 30 seconds', async ({ page }) => {
    test.setTimeout(120000); // 2 minute timeout

    // Collect all console messages
    const consoleLogs = [];
    page.on('console', msg => {
      consoleLogs.push({ type: msg.type(), text: msg.text() });
    });

    // Navigate to a large PDF with debug mode
    await page.goto('http://localhost:8000/?url=https://archive.org/download/marie-neurath-machines-which-seem-to-think/Marie%20Neurath%20-%20Machines%20Which%20Seem%20To%20Think.pdf&debug=1');

    // Wait for PDF to start loading
    await page.waitForTimeout(3000);

    // Enable verbose logging and tile labels
    await page.evaluate(() => {
      if (window.CONFIG) {
        window.CONFIG.VERBOSE_LOGGING = true;
      }
    });

    // Click tile labels button if available
    const tileLabelBtn = page.locator('button:has-text("Tile Labels")');
    if (await tileLabelBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await tileLabelBtn.click();
    }

    console.log('=== Starting 30 second monitoring ===');

    // Inject diagnostic hook into tile generation
    await page.evaluate(() => {
      if (!window.tileStreamer) {
        console.log('No tileStreamer found yet');
        return;
      }

      // Store original generateTile
      const tg = window.tileStreamer.tileGenerator;
      if (!tg) {
        console.log('No tileGenerator found');
        return;
      }

      const originalGenerateTile = tg.generateTile.bind(tg);

      // Track tile generation
      window.__tileGenLog = [];

      tg.generateTile = function(level, x, y) {
        const ts = this.tileStreamer;
        const scale = Math.pow(2, level - ts.maxLevel);
        const tileWidthInGrid = ts.tileWidth / scale;
        const tileHeightInGrid = ts.tileHeight / scale;
        const tileLeft = x * tileWidthInGrid;
        const tileTop = y * tileHeightInGrid;

        // Call original
        const result = originalGenerateTile(level, x, y);

        // Log details for L7 tiles
        if (level === 7) {
          const { pageWidth, pageHeight, spacing } = ts.gridDims;
          const cellWidth = pageWidth + spacing;
          const cellHeight = pageHeight + spacing;
          const posInCellX = Math.floor((tileLeft % cellWidth) / tileWidthInGrid);
          const posInCellY = Math.floor((tileTop % cellHeight) / tileHeightInGrid);

          // Get fingerprint
          const fingerprint = `${level}_?_${posInCellX}_${posInCellY}`;

          window.__tileGenLog.push({
            level, x, y,
            tileLeft, tileTop,
            tileWidthInGrid, tileHeightInGrid,
            cellWidth, cellHeight,
            posInCellX, posInCellY,
            cached: result !== null && ts.tileCache.has(`${level}_${posInCellX}_${posInCellY}`),
            resultNull: result === null,
            timestamp: Date.now()
          });

          // Log every 10th tile to avoid spam
          if (window.__tileGenLog.length % 10 === 0) {
            console.log(`[TileGen] L${level} (${x},${y}) tileLeft=${tileLeft.toFixed(0)} posInCell=(${posInCellX},${posInCellY})`);
          }
        }

        return result;
      };

      console.log('Tile generation diagnostic hook installed');
    });

    // Take periodic screenshots and log state
    for (let i = 0; i < 6; i++) {
      await page.waitForTimeout(5000);

      const elapsed = (i + 1) * 5;
      console.log(`\n=== ${elapsed} seconds elapsed ===`);

      // Get current state
      const state = await page.evaluate(() => {
        const result = {
          tileGenCount: window.__tileGenLog?.length || 0,
          pagesCached: 0,
          tilesCached: 0,
          recentTiles: []
        };

        if (window.tileStreamer) {
          const ts = window.tileStreamer;
          result.pagesCached = ts.pageStreamer?._getPageCache('low')?.size || 0;
          result.tilesCached = ts.tileCache?.cache?.size || 0;

          // Get last 5 tile generations
          if (window.__tileGenLog && window.__tileGenLog.length > 0) {
            result.recentTiles = window.__tileGenLog.slice(-5).map(t => ({
              pos: `(${t.x},${t.y})`,
              tileLeft: Math.round(t.tileLeft),
              posInCell: `(${t.posInCellX},${t.posInCellY})`,
              cached: t.cached
            }));
          }
        }

        return result;
      });

      console.log('State:', JSON.stringify(state, null, 2));

      // Screenshot
      await page.screenshot({
        path: `test-results/demo3-long-${elapsed}s.png`,
        fullPage: false
      });
    }

    // Final analysis - look for tiles with same posInCell but different (x,y)
    const analysis = await page.evaluate(() => {
      if (!window.__tileGenLog) return { error: 'No log' };

      const log = window.__tileGenLog;
      const byPosInCell = {};

      for (const entry of log) {
        const key = `${entry.posInCellX}_${entry.posInCellY}`;
        if (!byPosInCell[key]) byPosInCell[key] = [];
        byPosInCell[key].push({ x: entry.x, y: entry.y, tileLeft: entry.tileLeft });
      }

      // Find positions with multiple different (x,y) coordinates
      const duplicates = {};
      for (const [key, tiles] of Object.entries(byPosInCell)) {
        const uniqueCoords = new Set(tiles.map(t => `${t.x}_${t.y}`));
        if (uniqueCoords.size > 1) {
          duplicates[key] = tiles.slice(0, 5); // First 5 examples
        }
      }

      return {
        totalTiles: log.length,
        uniquePosInCell: Object.keys(byPosInCell).length,
        duplicatePositions: Object.keys(duplicates).length,
        examples: duplicates
      };
    });

    console.log('\n=== FINAL ANALYSIS ===');
    console.log('Total tiles generated:', analysis.totalTiles);
    console.log('Unique posInCell values:', analysis.uniquePosInCell);
    console.log('Positions with multiple (x,y) coords:', analysis.duplicatePositions);

    if (analysis.examples && Object.keys(analysis.examples).length > 0) {
      console.log('\nDUPLICATE EXAMPLES (same posInCell, different coords):');
      for (const [posInCell, tiles] of Object.entries(analysis.examples).slice(0, 3)) {
        console.log(`  posInCell=${posInCell}:`);
        for (const t of tiles) {
          console.log(`    (x=${t.x}, y=${t.y}) tileLeft=${t.tileLeft}`);
        }
      }
    }

    // Log relevant console messages
    const relevantLogs = consoleLogs.filter(l =>
      l.text.includes('TileGen') ||
      l.text.includes('INVALIDATE') ||
      l.text.includes('Ignoring') ||
      l.text.includes('diagnostic')
    );

    console.log('\n=== RELEVANT CONSOLE LOGS ===');
    for (const log of relevantLogs.slice(-20)) {
      console.log(`[${log.type}] ${log.text}`);
    }

    // The test passes if it completes - we're collecting diagnostic data
    expect(analysis.totalTiles).toBeGreaterThan(0);
  });
});
