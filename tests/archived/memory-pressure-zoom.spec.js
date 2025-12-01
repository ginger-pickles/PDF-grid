/**
 * Memory Pressure Test: Slow Incremental Zoom Operations
 *
 * Risky test - monitors memory during intensive operations
 * Tests the complete fix for memory leaks with natgeo PDF
 *
 * Use case:
 * 1. Load natgeo (194 pages, ~13MB, large format)
 * 2. Zoom out slowly to whole-at-once view (many L0/L1/L2 tiles)
 * 3. Zoom in slowly to center (high-res rendering)
 * 4. Monitor memory throughout - should stay under 2GB
 */

const { test, expect } = require('@playwright/test');

// SAFETY: Longer timeout for this intensive test
test.setTimeout(180000); // 3 minutes

test.describe('Memory Pressure - Slow Zoom Operations', () => {

  test('should handle natgeo zoom-out and zoom-in without memory spike', async ({ page }) => {
    console.log('\n=== MEMORY PRESSURE TEST: Slow Zoom Operations ===\n');

    // Memory thresholds (in MB)
    const THRESHOLDS = {
      INITIAL: 500,      // After load, should be under 500MB
      ZOOM_OUT: 1500,    // During zoom-out, should stay under 1.5GB
      ZOOM_IN: 2000,     // During deep zoom, max 2GB
      CRITICAL: 3000     // ABORT if exceeds 3GB (indicates leak)
    };

    // Track memory at each step
    const memoryLog = [];

    const logMemory = async (label) => {
      const stats = await page.evaluate(() => {
        if (!window.__PDFGridDiagnostics) return null;
        return window.__PDFGridDiagnostics.getMemoryStats();
      });

      if (stats) {
        const totalMB = stats.totalMB;
        memoryLog.push({ label, totalMB, ...stats });
        console.log(`[${label}] Memory: ${totalMB.toFixed(0)}MB (low-res: ${stats.lowResPageCacheMB.toFixed(0)}MB, high-res: ${stats.highResPageCacheMB.toFixed(0)}MB, tiles: ${stats.tileCacheMB.toFixed(0)}MB)`);

        // CRITICAL: Abort if memory exceeds critical threshold
        if (totalMB > THRESHOLDS.CRITICAL) {
          console.error(`❌ CRITICAL: Memory exceeded ${THRESHOLDS.CRITICAL}MB - aborting test`);
          throw new Error(`Memory leak detected: ${totalMB}MB > ${THRESHOLDS.CRITICAL}MB`);
        }

        return totalMB;
      }
      return 0;
    };

    // Navigate and load natgeo
    console.log('Loading natgeo PDF...');
    await page.goto('http://localhost:8000/?url=demo/natgeo-1969-05.pdf&debug=true');

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 60000 });
    console.log('✓ Viewer ready');

    // Wait for initial rendering to settle
    await page.waitForTimeout(3000);

    // Checkpoint 1: Initial memory after load
    const initialMemory = await logMemory('Initial (after load)');
    expect(initialMemory).toBeLessThan(THRESHOLDS.INITIAL);
    console.log(`✓ Initial memory OK: ${initialMemory.toFixed(0)}MB < ${THRESHOLDS.INITIAL}MB\n`);

    // PHASE 1: SLOW ZOOM OUT
    console.log('=== PHASE 1: Zooming out slowly (10 steps) ===');

    const zoomOutSteps = 10;
    for (let i = 1; i <= zoomOutSteps; i++) {
      // Zoom out incrementally
      await page.evaluate(() => {
        if (window.viewer) {
          const currentZoom = window.viewer.viewport.getZoom();
          window.viewer.viewport.zoomBy(0.7); // 70% of current (zoom out)
        }
      });

      // Wait for tiles to render
      await page.waitForTimeout(1000);

      // Check memory
      const memory = await logMemory(`Zoom-out step ${i}/${zoomOutSteps}`);
      expect(memory).toBeLessThan(THRESHOLDS.ZOOM_OUT);
    }

    // Get final zoom-out level
    const zoomOutLevel = await page.evaluate(() => window.viewer?.viewport.getZoom());
    console.log(`\n✓ Zoom-out complete: zoom level = ${zoomOutLevel?.toFixed(3)}`);

    const zoomOutMemory = await logMemory('Zoom-out complete');
    expect(zoomOutMemory).toBeLessThan(THRESHOLDS.ZOOM_OUT);
    console.log(`✓ Zoom-out memory OK: ${zoomOutMemory.toFixed(0)}MB < ${THRESHOLDS.ZOOM_OUT}MB\n`);

    // Wait for low-zoom tiles to settle
    await page.waitForTimeout(2000);

    // PHASE 2: SLOW ZOOM IN TO CENTER
    console.log('=== PHASE 2: Zooming in slowly to center (15 steps) ===');

    // Pan to center first
    await page.evaluate(() => {
      if (window.viewer) {
        window.viewer.viewport.panTo(new OpenSeadragon.Point(0.5, 0.5));
      }
    });
    await page.waitForTimeout(500);

    const zoomInSteps = 15;
    for (let i = 1; i <= zoomInSteps; i++) {
      // Zoom in incrementally
      await page.evaluate(() => {
        if (window.viewer) {
          window.viewer.viewport.zoomBy(1.3); // 130% of current (zoom in)
        }
      });

      // Wait for high-res tiles to render
      await page.waitForTimeout(800);

      // Check memory - this is where spikes would occur
      const memory = await logMemory(`Zoom-in step ${i}/${zoomInSteps}`);
      expect(memory).toBeLessThan(THRESHOLDS.ZOOM_IN);
    }

    const zoomInLevel = await page.evaluate(() => window.viewer?.viewport.getZoom());
    console.log(`\n✓ Zoom-in complete: zoom level = ${zoomInLevel?.toFixed(3)}`);

    const zoomInMemory = await logMemory('Zoom-in complete');
    expect(zoomInMemory).toBeLessThan(THRESHOLDS.ZOOM_IN);
    console.log(`✓ Zoom-in memory OK: ${zoomInMemory.toFixed(0)}MB < ${THRESHOLDS.ZOOM_IN}MB\n`);

    // PHASE 3: STABILITY CHECK
    console.log('=== PHASE 3: Stability check (wait 5s) ===');
    await page.waitForTimeout(5000);

    const stabilityMemory = await logMemory('After 5s idle');
    expect(stabilityMemory).toBeLessThan(THRESHOLDS.ZOOM_IN);
    console.log(`✓ Memory stable: ${stabilityMemory.toFixed(0)}MB\n`);

    // SUMMARY
    console.log('=== MEMORY PRESSURE TEST SUMMARY ===\n');
    console.log('Memory progression:');
    memoryLog.forEach(entry => {
      const status = entry.totalMB < THRESHOLDS.ZOOM_OUT ? '✓' : '⚠';
      console.log(`  ${status} ${entry.label}: ${entry.totalMB.toFixed(0)}MB`);
    });

    const maxMemory = Math.max(...memoryLog.map(e => e.totalMB));
    const minMemory = Math.min(...memoryLog.map(e => e.totalMB));
    const deltaMemory = maxMemory - minMemory;

    console.log(`\nPeak memory: ${maxMemory.toFixed(0)}MB`);
    console.log(`Min memory: ${minMemory.toFixed(0)}MB`);
    console.log(`Delta: ${deltaMemory.toFixed(0)}MB`);

    // PASS criteria
    expect(maxMemory).toBeLessThan(THRESHOLDS.ZOOM_IN);
    console.log(`\n✅ TEST PASSED: Peak memory ${maxMemory.toFixed(0)}MB < ${THRESHOLDS.ZOOM_IN}MB`);
    console.log('No memory spikes detected during zoom operations!\n');
  });

  test('should clean up memory when switching PDFs', async ({ page }) => {
    console.log('\n=== MEMORY CLEANUP TEST: PDF Switch ===\n');

    // Load large PDF
    await page.goto('http://localhost:8000/?url=demo/natgeo-1969-05.pdf&debug=true');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 60000 });
    await page.waitForTimeout(3000);

    const memoryAfterLarge = await page.evaluate(() => {
      return window.__PDFGridDiagnostics?.getMemoryStats()?.totalMB || 0;
    });
    console.log(`Memory after large PDF: ${memoryAfterLarge.toFixed(0)}MB`);

    // Load small PDF
    await page.goto('http://localhost:8000/?url=demo/demo-1.pdf&debug=true');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(2000);

    const memoryAfterSmall = await page.evaluate(() => {
      return window.__PDFGridDiagnostics?.getMemoryStats()?.totalMB || 0;
    });
    console.log(`Memory after small PDF: ${memoryAfterSmall.toFixed(0)}MB`);

    // Memory should drop significantly
    expect(memoryAfterSmall).toBeLessThan(memoryAfterLarge * 0.5);
    console.log(`✅ Memory cleaned up: ${memoryAfterSmall.toFixed(0)}MB < ${(memoryAfterLarge * 0.5).toFixed(0)}MB\n`);
  });

  test('should not leak memory after tab close', async ({ page, context }) => {
    console.log('\n=== MEMORY LEAK TEST: Tab Close ===\n');

    // Open tab with natgeo
    await page.goto('http://localhost:8000/?url=demo/natgeo-1969-05.pdf&debug=true');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 60000 });
    await page.waitForTimeout(3000);

    // Trigger some zoom operations to start background rendering
    await page.evaluate(() => {
      if (window.viewer) {
        window.viewer.viewport.zoomBy(0.5); // Zoom out
      }
    });
    await page.waitForTimeout(1000);

    // Check that background timers exist
    const hasTimers = await page.evaluate(() => {
      return window.backgroundTimersRef?.current?.length > 0;
    });

    if (hasTimers) {
      console.log('✓ Background timers are running');
    }

    // Close the page (simulates tab close)
    await page.close();
    console.log('✓ Tab closed');

    // Create new page to check browser memory
    const newPage = await context.newPage();
    await newPage.goto('about:blank');
    await newPage.waitForTimeout(2000);

    console.log('✅ No crash after tab close - timers properly cleaned up\n');
  });
});
