/**
 * Visual Performance Test
 *
 * Methodical test with pauses between operations to analyze:
 * - Missing pages
 * - Erroneous low-res tiles at high zoom
 * - Performance regressions
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');

test.setTimeout(90000);

test.describe('Visual Performance Test', () => {

  test('Methodical pan/zoom with pauses and screenshots', async ({ page }) => {
    console.log('\n=== VISUAL PERFORMANCE TEST ===\n');

    // Create output directory for screenshots
    const outputDir = 'test-results/visual-performance-screenshots';
    if (fs.existsSync(outputDir)) {
      // Clear previous screenshots
      fs.readdirSync(outputDir).forEach(file => {
        fs.unlinkSync(path.join(outputDir, file));
      });
    } else {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    let screenshotNum = 0;

    const takeScreenshot = async (label, description) => {
      screenshotNum++;
      const filename = `${String(screenshotNum).padStart(3, '0')}-${label}.png`;

      await page.screenshot({
        path: `${outputDir}/${filename}`,
        fullPage: false
      });

      const stats = await page.evaluate(() => {
        const drawFailures = window.__drawPageDebug?.failures || [];
        const recentFailures = drawFailures.slice(-10);

        return {
          memory: window.__PDFGridDiagnostics?.getMemoryStats(),
          cache: window.__PDFGridDiagnostics?.getCacheStats(),
          zoom: window.viewer?.viewport?.getZoom(),
          center: window.viewer?.viewport?.getCenter(),
          bounds: window.viewer?.viewport?.getBounds(),
          totalDrawFailures: drawFailures.length,
          recentDrawFailures: recentFailures.map(f => ({
            level: f.level,
            page: f.pageNum,
            res: f.resolution,
            reason: f.reason,
            highAvail: f.highAvail,
            lowAvail: f.lowAvail
          }))
        };
      });

      console.log(`\n[${screenshotNum}] ${description}`);
      console.log(`    File: ${filename}`);
      console.log(`    Zoom: ${stats.zoom?.toFixed(3)}`);
      console.log(`    Center: (${stats.center?.x.toFixed(3)}, ${stats.center?.y.toFixed(3)})`);
      console.log(`    Memory: ${stats.memory?.totalMB}MB (low-res: ${stats.memory?.lowResPageCacheMB}MB, high-res: ${stats.memory?.highResPageCacheMB}MB)`);
      console.log(`    Cache: ${stats.cache?.tiles} tiles, ${stats.cache?.pages?.total} pages (${stats.cache?.pages?.low} low, ${stats.cache?.pages?.high} high)`);
      console.log(`    Draw failures: ${stats.totalDrawFailures} total`);

      if (stats.recentDrawFailures.length > 0) {
        console.log(`    Recent failures (last ${stats.recentDrawFailures.length}):`);
        stats.recentDrawFailures.slice(0, 5).forEach((f, i) => {
          console.log(`      - L${f.level} p${f.page} ${f.res}: ${f.reason} (high:${f.highAvail}, low:${f.lowAvail})`);
        });
      }

      return stats;
    };

    // Helper: Take multiple screenshots during a pause
    const pauseWithScreenshots = async (durationMs, intervalMs, labelPrefix, description) => {
      const count = Math.floor(durationMs / intervalMs);
      console.log(`\n>>> PAUSE: ${description} (${durationMs}ms, ${count} screenshots)...`);

      for (let i = 0; i < count; i++) {
        await page.waitForTimeout(intervalMs);
        await takeScreenshot(`${labelPrefix}-pause${i+1}`, `${description} +${(i+1)*intervalMs}ms`);
      }
    };

    // STEP 1: Load initial view
    console.log('\n========================================');
    console.log('STEP 1: Load initial view');
    console.log('========================================');

    await page.goto('http://localhost:8000/?url=demo/demo-1.pdf&debug=true');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000); // Let initial rendering settle

    await takeScreenshot('01-initial-load', 'Initial view after load');

    // Capture initial load settling
    await pauseWithScreenshots(1000, 500, '02-load-settle', 'Initial load settling');

    // STEP 2: Pan down a few pages
    console.log('\n========================================');
    console.log('STEP 2: Pan down a few pages');
    console.log('========================================');

    // Pan down in increments
    for (let i = 1; i <= 3; i++) {
      await page.evaluate(() => {
        const center = window.viewer.viewport.getCenter();
        window.viewer.viewport.panTo(new OpenSeadragon.Point(center.x, center.y + 0.15));
      });
      await page.waitForTimeout(400); // Wait for tiles to start rendering
      await takeScreenshot(`03-pan-down-step${i}`, `Pan down step ${i}/3`);
      await page.waitForTimeout(400); // Additional settle time
      await takeScreenshot(`04-pan-down-step${i}-settled`, `Pan down step ${i}/3 settled`);
    }

    // PAUSE - capture rendering progress
    await pauseWithScreenshots(1500, 500, '05-after-pan', 'After pan down settle');

    // STEP 3: Zoom out to whole grid
    console.log('\n========================================');
    console.log('STEP 3: Zoom out to whole grid');
    console.log('========================================');

    await page.evaluate(() => {
      window.viewer.viewport.goHome();
    });
    await page.waitForTimeout(500);
    await takeScreenshot('06-zoom-whole-grid', 'Zoomed out to whole grid');

    // PAUSE - capture whole grid rendering
    await pauseWithScreenshots(2000, 500, '07-whole-grid', 'Whole grid rendering');

    // STEP 4: Zoom to mid zoom
    console.log('\n========================================');
    console.log('STEP 4: Zoom to mid zoom level');
    console.log('========================================');

    await page.evaluate(() => {
      // Pan to center first
      window.viewer.viewport.panTo(new OpenSeadragon.Point(0.5, 0.5));
      // Then zoom to mid level (about 5x)
      const currentZoom = window.viewer.viewport.getZoom();
      const homeZoom = window.viewer.viewport.getHomeZoom();
      const targetZoom = homeZoom * 5;
      window.viewer.viewport.zoomTo(targetZoom);
    });
    await page.waitForTimeout(500);
    await takeScreenshot('08-mid-zoom', 'Mid zoom level (~5x)');

    // PAUSE - capture mid-zoom rendering
    await pauseWithScreenshots(1500, 500, '09-mid-zoom', 'Mid zoom rendering');

    // STEP 5: Zoom deep to middle of grid
    console.log('\n========================================');
    console.log('STEP 5: Deep zoom to middle of grid');
    console.log('========================================');

    await page.evaluate(() => {
      // Ensure we're at center
      window.viewer.viewport.panTo(new OpenSeadragon.Point(0.5, 0.5));
      // Deep zoom (about 20x)
      const homeZoom = window.viewer.viewport.getHomeZoom();
      const targetZoom = homeZoom * 20;
      window.viewer.viewport.zoomTo(targetZoom);
    });
    await page.waitForTimeout(500);
    await takeScreenshot('10-deep-zoom', 'Deep zoom to center (~20x)');

    // PAUSE - capture deep zoom high-res rendering (longer pause for high-res tiles)
    await pauseWithScreenshots(3000, 500, '11-deep-zoom', 'Deep zoom high-res rendering');

    // STEP 6: Pan at deep zoom
    console.log('\n========================================');
    console.log('STEP 6: Pan at deep zoom');
    console.log('========================================');

    // Pan right
    await page.evaluate(() => {
      const center = window.viewer.viewport.getCenter();
      window.viewer.viewport.panTo(new OpenSeadragon.Point(center.x + 0.1, center.y));
    });
    await page.waitForTimeout(400);
    await takeScreenshot('12-deep-pan-right', 'Deep zoom pan right');
    await page.waitForTimeout(400);
    await takeScreenshot('13-deep-pan-right-settled', 'Deep zoom pan right settled');

    // Pan down
    await page.evaluate(() => {
      const center = window.viewer.viewport.getCenter();
      window.viewer.viewport.panTo(new OpenSeadragon.Point(center.x, center.y + 0.1));
    });
    await page.waitForTimeout(400);
    await takeScreenshot('14-deep-pan-down', 'Deep zoom pan down');
    await page.waitForTimeout(400);
    await takeScreenshot('15-deep-pan-down-settled', 'Deep zoom pan down settled');

    // PAUSE - final rendering settle
    const finalStats = await pauseWithScreenshots(1500, 500, '16-final', 'Final rendering settle');

    // STEP 7: Analysis
    console.log('\n========================================');
    console.log('ANALYSIS');
    console.log('========================================');

    // Check for potential issues
    const analysis = await page.evaluate(() => {
      const drawFailures = window.__drawPageDebug?.failures || [];

      // Group failures by type
      const failuresByReason = {};
      drawFailures.forEach(f => {
        const key = f.reason;
        if (!failuresByReason[key]) failuresByReason[key] = 0;
        failuresByReason[key]++;
      });

      // Check for low-res tiles at high zoom (potential issue)
      const deepZoomLowResFailures = drawFailures.filter(f =>
        f.level >= 4 && f.resolution === 'low' && f.reason === 'no_canvas'
      );

      // Check cache stats
      const cache = window.__PDFGridDiagnostics?.getCacheStats();
      const memory = window.__PDFGridDiagnostics?.getMemoryStats();

      return {
        totalDrawFailures: drawFailures.length,
        failuresByReason,
        deepZoomLowResFailures: deepZoomLowResFailures.length,
        cache,
        memory,
        potentialIssues: []
      };
    });

    console.log('\nDraw Failure Breakdown:');
    console.log(`  Total failures: ${analysis.totalDrawFailures}`);
    Object.entries(analysis.failuresByReason).forEach(([reason, count]) => {
      console.log(`    - ${reason}: ${count}`);
    });

    if (analysis.deepZoomLowResFailures > 0) {
      console.log(`\n⚠️  WARNING: ${analysis.deepZoomLowResFailures} low-res tile requests at deep zoom (L4+)`);
      console.log('    This may indicate using low-res tiles where high-res should be used.');
    }

    console.log('\nCache Status:');
    console.log(`  Pages: ${analysis.cache?.pages?.total} total (${analysis.cache?.pages?.low} low-res, ${analysis.cache?.pages?.high} high-res)`);
    console.log(`  Tiles: ${analysis.cache?.tiles}`);
    console.log(`  Fallback renders: ${analysis.cache?.tileRenderStats?.fallbackPercentage}%`);

    console.log('\nMemory Status:');
    console.log(`  Total: ${analysis.memory?.totalMB}MB`);
    console.log(`  Low-res pages: ${analysis.memory?.lowResPageCacheMB}MB`);
    console.log(`  High-res pages: ${analysis.memory?.highResPageCacheMB}MB`);
    console.log(`  Tiles: ${analysis.memory?.tileCacheMB}MB`);

    // Create summary
    const summary = {
      totalScreenshots: screenshotNum,
      steps: [
        'Initial load',
        'Pan down 3 steps',
        'Zoom to whole grid',
        'Zoom to mid level',
        'Deep zoom to center',
        'Pan at deep zoom'
      ],
      finalStats: analysis,
      screenshotDirectory: outputDir
    };

    fs.writeFileSync(
      `${outputDir}/test-summary.json`,
      JSON.stringify(summary, null, 2)
    );

    console.log(`\n========================================`);
    console.log(`✅ TEST COMPLETE`);
    console.log(`========================================`);
    console.log(`Screenshots: ${screenshotNum} total`);
    console.log(`Location: ${outputDir}/`);
    console.log(`Summary: ${outputDir}/test-summary.json`);
    console.log('========================================\n');

    // Test assertions
    expect(screenshotNum).toBeGreaterThan(0);
    expect(analysis.memory?.totalMB).toBeLessThan(500); // Should stay under 500MB for demo PDF
  });

});
