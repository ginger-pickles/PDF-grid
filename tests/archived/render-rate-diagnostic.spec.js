/**
 * Render Rate Diagnostic Test
 *
 * Investigates why render rate doesn't settle to zero
 * Checks for continuous background rendering and rate calculation issues
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

// Helper: Get render rate
async function getRenderRate(page) {
  const renderRateText = await page.locator('text=/Render Rate:.*$/').first().textContent();
  const fullMatch = renderRateText.match(/Full:\s*([\d.]+)\s*tiles\/sec/);
  const fallbackMatch = renderRateText.match(/Fallback:\s*([\d.]+)\s*tiles\/sec/);

  return {
    full: fullMatch ? parseFloat(fullMatch[1]) : 0,
    fallback: fallbackMatch ? parseFloat(fallbackMatch[1]) : 0,
    total: (fullMatch ? parseFloat(fullMatch[1]) : 0) + (fallbackMatch ? parseFloat(fallbackMatch[1]) : 0),
    text: renderRateText
  };
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

// Helper: Get cumulative render stats
async function getCumulativeStats(page) {
  return await page.evaluate(() => {
    if (window.tileStreamerRef && window.tileStreamerRef.stats) {
      return {
        tilesRenderedFull: window.tileStreamerRef.stats.tilesRenderedFull,
        tilesRenderedFallback: window.tileStreamerRef.stats.tilesRenderedFallback,
        fullRendersInWindow: window.tileStreamerRef.stats.fullRendersInWindow,
        fallbackRendersInWindow: window.tileStreamerRef.stats.fallbackRendersInWindow,
        renderWindowStart: window.tileStreamerRef.stats.renderWindowStart,
        fullRenderRate: window.tileStreamerRef.stats.fullRenderRate,
        fallbackRenderRate: window.tileStreamerRef.stats.fallbackRenderRate
      };
    }
    return null;
  });
}

test.describe('Render Rate Diagnostic', () => {

  test.beforeEach(async ({ page }) => {
    await page.goto('http://localhost:8000/index.html?debug=1');
    await page.waitForLoadState('domcontentloaded');
  });

  test('DIAGNOSTIC: Track render rate over extended period', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-2.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    console.log('\n=== RENDER RATE DIAGNOSTIC ===\n');

    // Track for 30 seconds
    const samples = [];
    for (let i = 0; i < 30; i++) {
      const rate = await getRenderRate(page);
      const bgStatus = await getBackgroundStatus(page);
      const cumulativeStats = await getCumulativeStats(page);

      samples.push({
        time: i,
        displayedRate: rate.total,
        bgRunning: bgStatus?.isRunning,
        bgLevel: bgStatus?.currentLevel,
        bgPercent: bgStatus?.percentComplete,
        cumulativeFull: cumulativeStats?.tilesRenderedFull,
        cumulativeFallback: cumulativeStats?.tilesRenderedFallback,
        windowFull: cumulativeStats?.fullRendersInWindow,
        windowFallback: cumulativeStats?.fallbackRendersInWindow,
        internalRateFull: cumulativeStats?.fullRenderRate?.toFixed(1),
        internalRateFallback: cumulativeStats?.fallbackRenderRate?.toFixed(1)
      });

      console.log(`[${i}s] Rate: ${rate.total.toFixed(1)} tiles/sec | BG: ${bgStatus?.isRunning ? 'RUNNING' : 'STOPPED'} L${bgStatus?.currentLevel} (${bgStatus?.percentComplete}%) | Cumulative: Full=${cumulativeStats?.tilesRenderedFull} Fallback=${cumulativeStats?.tilesRenderedFallback}`);

      await page.waitForTimeout(1000);
    }

    console.log('\n=== ANALYSIS ===\n');

    // Check if rate ever reaches zero
    const minRate = Math.min(...samples.map(s => s.displayedRate));
    const maxRate = Math.max(...samples.map(s => s.displayedRate));
    const avgRate = samples.reduce((sum, s) => sum + s.displayedRate, 0) / samples.length;

    console.log(`Min rate: ${minRate.toFixed(1)} tiles/sec`);
    console.log(`Max rate: ${maxRate.toFixed(1)} tiles/sec`);
    console.log(`Avg rate: ${avgRate.toFixed(1)} tiles/sec`);

    // Check if background rendering ever completes
    const bgCompleted = samples.some(s => !s.bgRunning || s.bgPercent === '100');
    console.log(`Background rendering completed: ${bgCompleted ? 'YES' : 'NO'}`);

    // Check if cumulative count keeps growing
    const firstCumulative = samples[5]?.cumulativeFull + samples[5]?.cumulativeFallback;
    const lastCumulative = samples[samples.length - 1]?.cumulativeFull + samples[samples.length - 1]?.cumulativeFallback;
    const cumulativeGrowth = lastCumulative - firstCumulative;

    console.log(`Cumulative tiles rendered (after initial load): ${cumulativeGrowth}`);
    console.log(`(First: ${firstCumulative}, Last: ${lastCumulative})`);

    // Identify the issue
    if (minRate > 5) {
      console.log('\n⚠ ISSUE: Rate never drops below 5 tiles/sec');
      console.log('   Possible causes:');
      console.log('   - Background rendering never completes');
      console.log('   - Continuous re-rendering of tiles');
      console.log('   - Rate calculation not resetting properly');
    }

    if (!bgCompleted) {
      console.log('\n⚠ ISSUE: Background rendering never completed in 30 seconds');
      console.log('   This explains continuous rendering');
    }

    if (cumulativeGrowth > 100) {
      console.log(`\n⚠ ISSUE: ${cumulativeGrowth} tiles rendered after initial load`);
      console.log('   This indicates ongoing rendering activity');
    }

    console.log('\n=== SAMPLES (last 10) ===\n');
    console.table(samples.slice(-10));

    console.log('\n=== END DIAGNOSTIC ===\n');
  });

  test('DIAGNOSTIC: Check if rate resets after window expires', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-2.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    // Wait for initial load
    await page.waitForTimeout(3000);

    console.log('\n=== RATE WINDOW DIAGNOSTIC ===\n');

    // Sample stats rapidly to see window behavior
    const rapidSamples = [];
    for (let i = 0; i < 15; i++) {
      const stats = await getCumulativeStats(page);
      const now = Date.now();
      const windowAge = now - stats.renderWindowStart;

      rapidSamples.push({
        time: i * 100,
        windowAge: windowAge,
        windowFull: stats.fullRendersInWindow,
        windowFallback: stats.fallbackRendersInWindow,
        rateFull: stats.fullRenderRate,
        rateFallback: stats.fallbackRenderRate,
        windowReset: windowAge < 200 // Window was recently reset
      });

      console.log(`[${i * 100}ms] Window age: ${windowAge}ms | In window: Full=${stats.fullRendersInWindow} Fallback=${stats.fallbackRendersInWindow} | Rates: Full=${stats.fullRenderRate.toFixed(1)} Fallback=${stats.fallbackRenderRate.toFixed(1)}`);

      await page.waitForTimeout(100);
    }

    console.log('\n=== WINDOW BEHAVIOR ===\n');

    // Check if window ever resets
    const windowResets = rapidSamples.filter(s => s.windowReset).length;
    console.log(`Window resets detected: ${windowResets}`);

    // Check if rates update when window expires
    const rateChanges = rapidSamples.filter((s, i) =>
      i > 0 && (s.rateFull !== rapidSamples[i-1].rateFull || s.rateFallback !== rapidSamples[i-1].rateFallback)
    ).length;
    console.log(`Rate changes detected: ${rateChanges}`);

    console.log('\n=== END WINDOW DIAGNOSTIC ===\n');
  });

  test('DIAGNOSTIC: Stop background rendering and verify rate drops to zero', async ({ page }) => {
    const pdfPath = path.resolve(__dirname, '../demo/demo-2.pdf');
    await page.setInputFiles('input[type="file"]', pdfPath);

    await page.waitForTimeout(3000);

    console.log('\n=== MANUAL STOP TEST ===\n');

    const rateBefore = await getRenderRate(page);
    const bgBefore = await getBackgroundStatus(page);
    console.log(`Before stop: Rate=${rateBefore.total.toFixed(1)} tiles/sec, BG=${bgBefore?.isRunning ? 'RUNNING' : 'STOPPED'}`);

    // Manually stop background rendering
    await page.evaluate(() => {
      if (window.tileStreamerRef && window.tileStreamerRef.stopBackgroundRendering) {
        window.tileStreamerRef.stopBackgroundRendering();
      }
    });

    console.log('Stopped background rendering manually');

    // Wait and check if rate drops to zero
    await page.waitForTimeout(2000);

    const rateAfter = await getRenderRate(page);
    const bgAfter = await getBackgroundStatus(page);
    console.log(`After stop: Rate=${rateAfter.total.toFixed(1)} tiles/sec, BG=${bgAfter?.isRunning ? 'RUNNING' : 'STOPPED'}`);

    // Continue monitoring
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(1000);
      const rate = await getRenderRate(page);
      console.log(`[${i + 3}s after stop] Rate=${rate.total.toFixed(1)} tiles/sec`);
    }

    const finalRate = await getRenderRate(page);

    if (finalRate.total > 0) {
      console.log('\n⚠ PROBLEM: Rate did not drop to zero even after stopping background rendering');
      console.log('   This suggests either:');
      console.log('   1. Rate calculation bug (not resetting properly)');
      console.log('   2. Other rendering activity besides background rendering');
    } else {
      console.log('\n✓ Rate correctly dropped to zero after stopping background rendering');
    }

    console.log('\n=== END MANUAL STOP TEST ===\n');
  });

});
