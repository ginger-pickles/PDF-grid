/**
 * Automated Test - Detect Missing Pages in NatGeo
 *
 * Checks specific pages for rendering without verbose logging overhead
 */

const { test, expect } = require('@playwright/test');

test('Detect which specific pages are missing in natgeo', async ({ page }) => {
  console.log('\n=== Testing NatGeo for Missing Pages ===\n');

  // Capture console warnings for timeout detection
  const consoleWarnings = [];
  page.on('console', msg => {
    if (msg.type() === 'warning' && msg.text().includes('TIMEOUT')) {
      consoleWarnings.push(msg.text());
    }
  });

  // Load natgeo
  await page.goto('http://localhost:8000?pdf=demo/natgeo-1969-05.pdf');
  await page.waitForFunction(() => window.viewerReady === true, { timeout: 120000 });

  // Wait for initial rendering AND post-init tile refresh to complete
  // (large PDFs trigger async tile cache clear + redraw after renders complete)
  await page.waitForTimeout(15000); // Increased from 3s to allow post-init cleanup

  // Get cache info
  const cacheInfo = await page.evaluate(() => {
    const pageStreamer = window.pageStreamerRef;
    if (!pageStreamer) return { error: 'No pageStreamer' };

    return {
      lowResCapacity: pageStreamer.lowResPageCache.maxSize,
      lowResCurrent: pageStreamer.lowResPageCache.size,
      highResCapacity: pageStreamer.highResPageCache.maxSize,
      highResCurrent: pageStreamer.highResPageCache.size,
      pdfPages: pageStreamer.pdfDoc?.numPages || 0,
      renderingInProgressSize: pageStreamer.renderingInProgress.size,
      renderingInProgressKeys: Array.from(pageStreamer.renderingInProgress.keys()).slice(0, 10)
    };
  });

  console.log('Cache Configuration:');
  console.log(`  PDF has ${cacheInfo.pdfPages} pages`);
  console.log(`  Low-res cache: ${cacheInfo.lowResCurrent}/${cacheInfo.lowResCapacity} pages`);
  console.log(`  High-res cache: ${cacheInfo.highResCurrent}/${cacheInfo.highResCapacity} pages`);
  console.log(`  renderingInProgress: ${cacheInfo.renderingInProgressSize} items`);
  if (cacheInfo.renderingInProgressKeys.length > 0) {
    console.log(`  Stuck pages: ${cacheInfo.renderingInProgressKeys.join(', ')} (+ ${cacheInfo.renderingInProgressSize - 10} more)`);
  }

  // Check if these are actually rendering or hung
  await page.waitForTimeout(5000);
  const stillStuck = await page.evaluate(() => {
    return window.pageStreamerRef.renderingInProgress.size;
  });
  console.log(`  After 5s wait: ${stillStuck} still in renderingInProgress ${stillStuck === cacheInfo.renderingInProgressSize ? '(NOT COMPLETING!)' : '(some completed)'}`);
  console.log();

  // Sample specific pages to check if they're rendered
  const pagesToCheck = [1, 2, 10, 50, 75, 100, 125, 150, 175, 194];

  const pageStatus = await page.evaluate((pages) => {
    const pageStreamer = window.pageStreamerRef;
    const results = {};

    for (const pageNum of pages) {
      results[pageNum] = {
        lowRes: pageStreamer.lowResPageCache.has(`${pageNum}_low`),
        highRes: pageStreamer.highResPageCache.has(`${pageNum}_high`),
        rendering: pageStreamer.renderingInProgress.has(`${pageNum}_low`) ||
                   pageStreamer.renderingInProgress.has(`${pageNum}_high`)
      };
    }

    return results;
  }, pagesToCheck);

  console.log('Sample Page Status (after initial load):');
  for (const pageNum of pagesToCheck) {
    const status = pageStatus[pageNum];
    const cached = status.lowRes || status.highRes;
    const symbol = cached ? '✓' : (status.rendering ? '⏳' : '✗');
    const detail = status.lowRes && status.highRes ? 'both' :
                   status.lowRes ? 'low-res only' :
                   status.highRes ? 'high-res only' :
                   status.rendering ? 'RENDERING' : 'MISSING';

    console.log(`  Page ${pageNum.toString().padStart(3)}: ${symbol} ${detail}`);
  }

  // Zoom out to trigger more viewport and on-demand rendering
  await page.evaluate(() => {
    window.viewer.viewport.zoomBy(0.25);
  });

  // Wait for OpenSeadragon to finish drawing new tiles
  await page.waitForTimeout(2000); // Initial settling
  await page.evaluate(() => {
    return new Promise(resolve => {
      // Wait for tile-drawn event or timeout
      let drawn = 0;
      const handler = () => {
        drawn++;
        if (drawn >= 5) { // Wait for at least 5 tiles to draw
          window.viewer.removeHandler('tile-drawn', handler);
          resolve();
        }
      };
      window.viewer.addHandler('tile-drawn', handler);

      // Timeout after 15s
      setTimeout(() => {
        window.viewer.removeHandler('tile-drawn', handler);
        resolve();
      }, 15000);
    });
  });

  // Check again after zoom
  const pageStatusAfterZoom = await page.evaluate((pages) => {
    const pageStreamer = window.pageStreamerRef;
    const results = {};

    for (const pageNum of pages) {
      results[pageNum] = {
        lowRes: pageStreamer.lowResPageCache.has(`${pageNum}_low`),
        highRes: pageStreamer.highResPageCache.has(`${pageNum}_high`)
      };
    }

    return results;
  }, pagesToCheck);

  console.log('\nSample Page Status (after zoom out):');
  let renderedCount = 0;
  let missingCount = 0;

  for (const pageNum of pagesToCheck) {
    const status = pageStatusAfterZoom[pageNum];
    const cached = status.lowRes || status.highRes;
    const symbol = cached ? '✓' : '✗';
    const detail = status.lowRes && status.highRes ? 'both' :
                   status.lowRes ? 'low-res only' :
                   status.highRes ? 'high-res only' : 'MISSING';

    console.log(`  Page ${pageNum.toString().padStart(3)}: ${symbol} ${detail}`);

    if (cached) renderedCount++;
    else missingCount++;
  }

  // Take screenshot for visual verification
  await page.screenshot({ path: 'test-results/natgeo-missing-test.png', fullPage: false });

  // Visual check: Count how many pages are actually VISIBLE (not black/blank)
  const visualCheck = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return { error: 'No canvas found' };

    const ctx = canvas.getContext('2d');
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;

    // Count non-black pixels (pages should have content, not be solid black)
    let nonBlackPixels = 0;
    let totalPixels = 0;

    // Sample every 100th pixel for performance
    for (let i = 0; i < pixels.length; i += 400) { // RGBA = 4 bytes, so 400 = 100 pixels
      totalPixels++;
      const r = pixels[i];
      const g = pixels[i + 1];
      const b = pixels[i + 2];

      // Non-black if any channel > 30 (accounting for slight variations)
      if (r > 30 || g > 30 || b > 30) {
        nonBlackPixels++;
      }
    }

    const contentPercentage = (nonBlackPixels / totalPixels) * 100;
    return {
      canvasSize: `${canvas.width}x${canvas.height}`,
      contentPercentage: contentPercentage.toFixed(1),
      hasContent: contentPercentage > 10 // At least 10% non-black = pages visible
    };
  });

  console.log(`\nVisual Verification:`);
  console.log(`  Canvas: ${visualCheck.canvasSize}`);
  console.log(`  Content: ${visualCheck.contentPercentage}% visible`);
  console.log(`  Status: ${visualCheck.hasContent ? '✓ Pages visible' : '✗ Mostly black/blank'}`);

  console.log(`\nSummary of ${pagesToCheck.length} sampled pages:`);
  console.log(`  Rendered: ${renderedCount}`);
  console.log(`  Missing: ${missingCount}`);
  console.log(`  Ratio: ${(renderedCount/pagesToCheck.length*100).toFixed(0)}% rendered\n`);

  // Get on-demand stats
  const onDemandStats = await page.evaluate(() => {
    const tracking = window.__L0OnDemandTracking;
    const skipped = window.__L0OnDemandSkipped;
    return {
      enabled: window.CONFIG?.ON_DEMAND_RENDERING_ENABLED,
      triggered: tracking?.triggered?.length || 0,
      completed: tracking?.completed?.length || 0,
      failed: tracking?.failed?.length || 0,
      skippedCount: skipped?.skipped?.length || 0,
      skippedReasons: skipped?.skipped?.slice(0, 5) || []
    };
  });

  // Get draw failure stats (explains black pages)
  const drawStats = await page.evaluate(() => {
    const drawDebug = window.__drawPageDebug || { failures: [], successes: [] };
    // Get unique page 2 & 3 failures with full details
    const page2and3Failures = drawDebug.failures?.filter(f => f.pageNum === 2 || f.pageNum === 3) || [];
    const uniqueFailures = page2and3Failures.slice(0, 5); // First 5 unique

    return {
      totalFailures: drawDebug.failures?.length || 0,
      totalSuccesses: drawDebug.successes?.length || 0,
      firstFailures: drawDebug.failures?.slice(0, 10) || [],
      page2and3Details: uniqueFailures
    };
  });

  console.log('On-Demand Rendering Status:');
  console.log(`  Enabled: ${onDemandStats.enabled}`);
  console.log(`  Triggered: ${onDemandStats.triggered}`);
  console.log(`  Completed: ${onDemandStats.completed}`);
  console.log(`  Failed: ${onDemandStats.failed}`);
  console.log(`  Skipped: ${onDemandStats.skippedCount}`);
  if (onDemandStats.skippedReasons.length > 0) {
    console.log(`  First 5 skipped reasons:`);
    onDemandStats.skippedReasons.forEach(s => {
      console.log(`    Page ${s.pageNum}: ${s.reason}`);
    });
  }

  console.log(`\nTile Drawing Status:`);
  console.log(`  Successful draws: ${drawStats.totalSuccesses}`);
  console.log(`  Failed draws: ${drawStats.totalFailures}`);
  if (drawStats.firstFailures.length > 0) {
    console.log(`  First 10 failures:`);
    drawStats.firstFailures.forEach(f => {
      console.log(`    L${f.level} p${f.pageNum} ${f.resolution}: ${f.reason}`);
    });
  }
  if (drawStats.page2and3Details && drawStats.page2and3Details.length > 0) {
    console.log(`\n  Page 2 & 3 failure details:`);
    drawStats.page2and3Details.forEach((f, i) => {
      console.log(`    ${i + 1}. L${f.level} p${f.pageNum} ${f.resolution}:`);
      console.log(`       Canvas: ${f.canvasWidth}x${f.canvasHeight}, ScaleFactor: ${f.canvasScaleFactor?.toFixed(3)}`);
      console.log(`       Src rect: (${f.srcX?.toFixed(1)}, ${f.srcY?.toFixed(1)}, ${f.srcW?.toFixed(1)}, ${f.srcH?.toFixed(1)})`);
      console.log(`       Overshoot: X=${f.overshootX?.toFixed(1)}, Y=${f.overshootY?.toFixed(1)}`);
    });
  }

  console.log('\n=== Test Complete ===\n');

  // Check for timeout warnings
  if (consoleWarnings.length > 0) {
    console.log(`⚠️  Timeout warnings detected: ${consoleWarnings.length}`);
    consoleWarnings.slice(0, 5).forEach(w => console.log(`  ${w}`));
  } else {
    console.log(`✓ No timeout warnings (all promises completed within 10s)`);
  }

  // Expect at least some pages to be rendered
  expect(renderedCount).toBeGreaterThan(0);

  // STRICT: Expect ALL sampled pages to be rendered
  expect(renderedCount).toBe(pagesToCheck.length);

  // Report if we have significant missing pages
  if (missingCount > pagesToCheck.length / 2) {
    console.log(`⚠️  WARNING: More than half of sampled pages are missing!`);
  }
});
