/**
 * Visual Refresh Diagnostic Test
 *
 * Purpose: Examine tile refresh behavior to guide reintroduction of targeted refresh mechanisms.
 * Tests at multiple zoom levels and states to identify where stale tiles persist.
 */

const { test, expect } = require('@playwright/test');

// Helper: Detect if pixel is part of the red stripe pattern (incomplete tile indicator)
function isStripePattern(r, g, b) {
  // Red stripe pattern is typically dark red/purple on dark background
  // The stripe pattern alternates between two colors
  const isDarkPurple = r > 20 && r < 80 && g < 60 && b > 40 && b < 80;
  const isRedish = r > 40 && r > g && r > b * 0.8;
  return isDarkPurple || isRedish;
}

// Helper: Sample canvas at multiple points
async function sampleCanvas(page, label) {
  return page.evaluate((label) => {
    const canvas = document.querySelector('.openseadragon-canvas canvas');
    if (!canvas) return { error: 'Canvas not found', label };

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { error: 'Context not available', label };

    const w = canvas.width;
    const h = canvas.height;

    // Sample at grid pattern - 5x5 points
    const samples = [];
    for (let yi = 1; yi <= 5; yi++) {
      for (let xi = 1; xi <= 5; xi++) {
        const x = Math.floor((xi / 6) * w);
        const y = Math.floor((yi / 6) * h);

        // Get 3x3 region average
        const imageData = ctx.getImageData(x - 1, y - 1, 3, 3);
        const data = imageData.data;

        let r = 0, g = 0, b = 0;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        r = Math.round(r / 9);
        g = Math.round(g / 9);
        b = Math.round(b / 9);

        samples.push({ x, y, r, g, b });
      }
    }

    // Classify samples
    let stripeCount = 0;
    let blackCount = 0;
    let whiteCount = 0;
    let colorCount = 0;

    for (const s of samples) {
      const isDarkPurple = s.r > 20 && s.r < 80 && s.g < 60 && s.b > 40 && s.b < 80;
      const isBlack = s.r < 15 && s.g < 15 && s.b < 15;
      const isWhite = s.r > 200 && s.g > 200 && s.b > 200;
      const isColor = (Math.abs(s.r - s.g) > 30 || Math.abs(s.g - s.b) > 30 || Math.abs(s.r - s.b) > 30);

      if (isDarkPurple) stripeCount++;
      else if (isBlack) blackCount++;
      else if (isWhite) whiteCount++;
      else if (isColor) colorCount++;
    }

    return {
      label,
      canvasSize: { width: w, height: h },
      totalSamples: samples.length,
      stripeCount,
      blackCount,
      whiteCount,
      colorCount,
      neutralCount: samples.length - stripeCount - blackCount - whiteCount - colorCount,
      samples: samples.slice(0, 5).map(s => `RGB(${s.r},${s.g},${s.b})`),
      hasStripePattern: stripeCount > samples.length * 0.3, // >30% stripe = incomplete
      hasContent: whiteCount > 0 || colorCount > 0 // white/color = likely page content
    };
  }, label);
}

test.describe('Visual Refresh Diagnostic', () => {

  test('Examine tile state at multiple zoom levels with test-pattern.pdf', async ({ page }) => {
    test.setTimeout(180000);

    const events = [];
    const logEvent = (msg) => {
      events.push(msg);
      console.log(msg);
    };

    // Track console events for refresh operations
    page.on('console', msg => {
      const text = msg.text();
      if (text.includes('reset') || text.includes('recreat') || text.includes('redraw') || text.includes('invalidat')) {
        logEvent(`[CONSOLE] ${text}`);
      }
    });

    logEvent('\n=== VISUAL REFRESH DIAGNOSTIC ===\n');

    // Load test-pattern.pdf
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');

    // Wait for viewer ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    logEvent('Viewer ready');

    // PHASE 1: Sample immediately after viewer ready (before background rendering completes)
    await page.waitForTimeout(1000);
    const phase1 = await sampleCanvas(page, 'Phase 1: Immediately after viewer ready');
    logEvent(`\n=== PHASE 1: INITIAL STATE (1s after ready) ===`);
    logEvent(`  Stripe pattern detected: ${phase1.hasStripePattern ? 'YES - INCOMPLETE TILES' : 'NO'}`);
    logEvent(`  Content detected: ${phase1.hasContent ? 'YES' : 'NO'}`);
    logEvent(`  Samples: stripe=${phase1.stripeCount}, black=${phase1.blackCount}, white=${phase1.whiteCount}, color=${phase1.colorCount}`);
    logEvent(`  Sample colors: ${phase1.samples.join(', ')}`);

    await page.screenshot({ path: 'test-results/visual-diag-phase1.png' });

    // PHASE 2: After background rendering likely complete
    await page.waitForTimeout(8000);
    const phase2 = await sampleCanvas(page, 'Phase 2: After background rendering');
    logEvent(`\n=== PHASE 2: AFTER BACKGROUND RENDER (9s) ===`);
    logEvent(`  Stripe pattern detected: ${phase2.hasStripePattern ? 'YES - STALE TILES' : 'NO'}`);
    logEvent(`  Content detected: ${phase2.hasContent ? 'YES' : 'NO'}`);
    logEvent(`  Samples: stripe=${phase2.stripeCount}, black=${phase2.blackCount}, white=${phase2.whiteCount}, color=${phase2.colorCount}`);
    logEvent(`  Sample colors: ${phase2.samples.join(', ')}`);

    // Check cache status
    const cacheStatus2 = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const ps = ts?.pageStreamer;
      return {
        lowResCached: ps?.lowResPageCache?.size || 0,
        highResCached: ps?.highResPageCache?.size || 0,
        tileCacheSize: ts?.tileCache?.cache?.size || 0,
        numPages: ts?.numPages || 0
      };
    });
    logEvent(`  Cache: low-res=${cacheStatus2.lowResCached}/${cacheStatus2.numPages}, tiles=${cacheStatus2.tileCacheSize}`);

    await page.screenshot({ path: 'test-results/visual-diag-phase2.png' });

    // PHASE 3: Zoom in 2x
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(2);
    });
    await page.waitForTimeout(3000);
    const phase3 = await sampleCanvas(page, 'Phase 3: Zoomed 2x');
    logEvent(`\n=== PHASE 3: ZOOMED 2x ===`);
    logEvent(`  Stripe pattern detected: ${phase3.hasStripePattern ? 'YES - STALE TILES' : 'NO'}`);
    logEvent(`  Content detected: ${phase3.hasContent ? 'YES' : 'NO'}`);
    logEvent(`  Samples: stripe=${phase3.stripeCount}, black=${phase3.blackCount}, white=${phase3.whiteCount}, color=${phase3.colorCount}`);

    await page.screenshot({ path: 'test-results/visual-diag-phase3-zoom2x.png' });

    // PHASE 4: Zoom in 4x (total)
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(2);
    });
    await page.waitForTimeout(3000);
    const phase4 = await sampleCanvas(page, 'Phase 4: Zoomed 4x');
    logEvent(`\n=== PHASE 4: ZOOMED 4x ===`);
    logEvent(`  Stripe pattern detected: ${phase4.hasStripePattern ? 'YES - STALE TILES' : 'NO'}`);
    logEvent(`  Content detected: ${phase4.hasContent ? 'YES' : 'NO'}`);
    logEvent(`  Samples: stripe=${phase4.stripeCount}, black=${phase4.blackCount}, white=${phase4.whiteCount}, color=${phase4.colorCount}`);

    await page.screenshot({ path: 'test-results/visual-diag-phase4-zoom4x.png' });

    // PHASE 5: Zoom back out to home
    await page.evaluate(() => {
      window.osdViewerRef.viewport.goHome();
    });
    await page.waitForTimeout(3000);
    const phase5 = await sampleCanvas(page, 'Phase 5: Back to overview');
    logEvent(`\n=== PHASE 5: BACK TO OVERVIEW ===`);
    logEvent(`  Stripe pattern detected: ${phase5.hasStripePattern ? 'YES - STALE LOW-LEVEL TILES' : 'NO'}`);
    logEvent(`  Content detected: ${phase5.hasContent ? 'YES' : 'NO'}`);
    logEvent(`  Samples: stripe=${phase5.stripeCount}, black=${phase5.blackCount}, white=${phase5.whiteCount}, color=${phase5.colorCount}`);

    await page.screenshot({ path: 'test-results/visual-diag-phase5-overview.png' });

    // Summary
    logEvent('\n=== DIAGNOSTIC SUMMARY ===');
    logEvent('Phase 1 (Initial): ' + (phase1.hasStripePattern ? 'INCOMPLETE - Expected early' : 'COMPLETE'));
    logEvent('Phase 2 (After BG): ' + (phase2.hasStripePattern ? 'STALE - Needs refresh' : 'COMPLETE'));
    logEvent('Phase 3 (Zoom 2x): ' + (phase3.hasStripePattern ? 'STALE' : 'COMPLETE'));
    logEvent('Phase 4 (Zoom 4x): ' + (phase4.hasStripePattern ? 'STALE' : 'COMPLETE'));
    logEvent('Phase 5 (Overview): ' + (phase5.hasStripePattern ? 'STALE - Low-level tiles need refresh' : 'COMPLETE'));

    const tilesNeedRefresh = phase2.hasStripePattern || phase5.hasStripePattern;
    logEvent('\n=== RECOMMENDATION ===');
    if (tilesNeedRefresh) {
      logEvent('LOW-LEVEL TILES ARE STALE after pages render.');
      logEvent('Need targeted refresh mechanism (tiledImage.reset or recreation) ONCE after all pages cached.');
    } else {
      logEvent('Tiles appear fresh - current refresh mechanism may be sufficient.');
    }

    // Check that we at least get content at high zoom (tiles generated on-demand work)
    const highZoomWorks = phase4.hasContent || !phase4.hasStripePattern;
    expect(highZoomWorks).toBe(true);
  });

  test('Examine tile cache key behavior', async ({ page }) => {
    test.setTimeout(60000);

    console.log('\n=== CACHE KEY DIAGNOSTIC ===\n');

    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(5000);

    // Get tile cache keys
    const cacheInfo = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const cache = ts?.tileCache?.cache;
      if (!cache) return { error: 'No tile cache found' };

      const keys = Array.from(cache.keys());
      const keysByLevel = {};

      for (const key of keys) {
        const match = key.match(/^(\d+)_/);
        const level = match ? match[1] : 'unknown';
        if (!keysByLevel[level]) keysByLevel[level] = [];
        keysByLevel[level].push(key);
      }

      return {
        totalKeys: keys.length,
        keysByLevel,
        sampleKeys: keys.slice(0, 10)
      };
    });

    console.log('Total cache keys:', cacheInfo.totalKeys);
    console.log('Keys by level:', JSON.stringify(cacheInfo.keysByLevel, null, 2));
    console.log('Sample keys:', cacheInfo.sampleKeys);

    // Force invalidation and check
    await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      const cacheBefore = ts?.tileCache?.cache?.size || 0;
      console.log('[TEST] Cache size before invalidation:', cacheBefore);

      // Trigger invalidation for all pages
      for (let i = 1; i <= 12; i++) {
        ts?._invalidateTilesUsingPages?.([i]);
      }

      const cacheAfter = ts?.tileCache?.cache?.size || 0;
      console.log('[TEST] Cache size after invalidation:', cacheAfter);
    });

    await page.waitForTimeout(1000);

    const cacheAfterInvalidation = await page.evaluate(() => {
      const ts = window.tileStreamerRef;
      return ts?.tileCache?.cache?.size || 0;
    });

    console.log('\nCache size after invalidation call:', cacheAfterInvalidation);
    console.log('Expected: 0 or significantly reduced');

    // Sample canvas after invalidation
    const afterInvalidate = await sampleCanvas(page, 'After cache invalidation');
    console.log('\nAfter invalidation:');
    console.log('  Stripe pattern:', afterInvalidate.hasStripePattern ? 'STILL PRESENT - OSD not re-requesting' : 'GONE');

    await page.screenshot({ path: 'test-results/visual-diag-after-invalidate.png' });
  });
});
