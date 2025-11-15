const { test, expect } = require('@playwright/test');

/**
 * Visual detection of missing pages in L0 grid view
 *
 * Strategy:
 * - Set consistent viewport (1920x1080) for reproducible pixel calculations
 * - Calculate intelligent sample size based on actual page pixel dimensions
 * - Sample central region of each expected page (30% of page dimensions)
 * - Detect background color #1f2937 (dark gray) indicating missing pages
 * - Account for intentionally blank cells in staggered grid pattern
 */

test.describe('Missing Pages Detection - Whole Grid View', () => {
  test('should detect missing pages in L0 navigator tile for demo-3.pdf', async ({ page }) => {
    // Set explicit viewport for consistent pixel calculations
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Load PDF with whole grid view
    await page.goto('http://localhost:8000/?pdf=demo-3.pdf');

    // Wait for viewer initialization (all pages rendered, viewer ready)
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 120000 });

    // Give OSD time to generate L0 tiles
    await page.waitForTimeout(3000);

    const analysis = await page.evaluate(() => {
      // Get grid pattern and dimensions
      const pattern = window.tileStreamerRef.pattern;
      const gridDims = window.tileStreamerRef.gridDims;
      const viewer = window.viewer;
      const viewport = viewer.viewport;

      // Calculate page dimensions in pixels at current zoom
      const pageWidth = gridDims.pageWidth;
      const pageHeight = gridDims.pageHeight;

      // Convert grid coordinates to viewport coordinates
      const topLeft = viewport.imageToViewportCoordinates(0, 0);
      const bottomRight = viewport.imageToViewportCoordinates(pageWidth, pageHeight);
      const pageWidthInViewport = bottomRight.x - topLeft.x;
      const pageHeightInViewport = bottomRight.y - topLeft.y;

      // Convert viewport to pixel coordinates
      const containerSize = viewport.getContainerSize();
      const pageWidthInPixels = pageWidthInViewport * containerSize.x;
      const pageHeightInPixels = pageHeightInViewport * containerSize.y;

      // Intelligent sample size: 30% of page dimensions, bounded by page size
      // NO hardcoded minimums - purely adaptive to page pixel size
      const samplePercent = 0.3;
      const sampleWidth = Math.max(1, Math.min(
        Math.round(pageWidthInPixels * samplePercent),
        Math.floor(pageWidthInPixels * 0.9)  // Cap at 90% to avoid edges
      ));
      const sampleHeight = Math.max(1, Math.min(
        Math.round(pageHeightInPixels * samplePercent),
        Math.floor(pageHeightInPixels * 0.9)
      ));

      console.log(`[Missing Pages Test] Viewport: ${containerSize.x}×${containerSize.y}px`);
      console.log(`[Missing Pages Test] Page size: ${pageWidthInPixels.toFixed(1)}×${pageHeightInPixels.toFixed(1)}px`);
      console.log(`[Missing Pages Test] Sample size: ${sampleWidth}×${sampleHeight}px (${samplePercent * 100}% of page)`);
      console.log(`[Missing Pages Test] Grid: ${pattern.length} rows × ${pattern[0].length} cols`);

      // Get canvas for pixel sampling
      const canvas = viewer.drawer.canvas;
      const ctx = canvas.getContext('2d');

      // Background color to detect: #1f2937 (dark gray, RGB ~31, 41, 55)
      const BACKGROUND_RGB = { r: 31, g: 41, b: 55 };
      const TOLERANCE = 15; // Allow tolerance for compression artifacts

      const unexpectedBlanks = [];
      let totalExpectedPages = 0;

      // Iterate through grid pattern
      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < pattern[row].length; col++) {
          const pageNum = pattern[row][col];

          // Skip intentionally blank cells (staggered pattern)
          if (pageNum === 0) continue;

          totalExpectedPages++;

          // Calculate center of page in grid coordinates
          const pageLeft = col * (pageWidth + gridDims.spacing);
          const pageTop = row * (pageHeight + gridDims.spacing);
          const centerGridX = pageLeft + pageWidth / 2;
          const centerGridY = pageTop + pageHeight / 2;

          // Convert to canvas pixel coordinates
          const viewportPoint = viewport.imageToViewportCoordinates(centerGridX, centerGridY);
          const canvasX = Math.round(viewportPoint.x * containerSize.x);
          const canvasY = Math.round(viewportPoint.y * containerSize.y);

          // Sample cluster around center
          try {
            const imageData = ctx.getImageData(
              canvasX - sampleWidth / 2,
              canvasY - sampleHeight / 2,
              sampleWidth,
              sampleHeight
            );

            // Analyze if region is background color (missing page)
            const pixels = imageData.data;
            let backgroundPixels = 0;
            const totalPixels = pixels.length / 4;

            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];

              // Check if pixel matches background color #1f2937 with tolerance
              if (Math.abs(r - BACKGROUND_RGB.r) < TOLERANCE &&
                  Math.abs(g - BACKGROUND_RGB.g) < TOLERANCE &&
                  Math.abs(b - BACKGROUND_RGB.b) < TOLERANCE) {
                backgroundPixels++;
              }
            }

            const backgroundPercent = (backgroundPixels / totalPixels) * 100;

            // If >90% background color, page is missing
            if (backgroundPercent > 90) {
              unexpectedBlanks.push({
                pageNum,
                row,
                col,
                backgroundPercent: backgroundPercent.toFixed(1),
                sampleLocation: `${canvasX},${canvasY}`
              });
            }
          } catch (err) {
            console.warn(`[Missing Pages Test] Failed to sample page ${pageNum} at row ${row}, col ${col}:`, err.message);
          }
        }
      }

      const completeness = totalExpectedPages > 0
        ? ((totalExpectedPages - unexpectedBlanks.length) / totalExpectedPages * 100).toFixed(1)
        : 100;

      return {
        viewportSize: `${containerSize.x}×${containerSize.y}px`,
        pagePixelSize: `${pageWidthInPixels.toFixed(1)}×${pageHeightInPixels.toFixed(1)}px`,
        sampleSize: `${sampleWidth}×${sampleHeight}px`,
        gridSize: `${pattern.length}×${pattern[0].length}`,
        totalExpectedPages,
        missingPages: unexpectedBlanks,
        missingCount: unexpectedBlanks.length,
        completeness: `${completeness}%`
      };
    });

    // Get diagnostic data to understand why pages are missing
    const diagnostics = await page.evaluate(() => {
      return window.__PDFGridDiagnostics.diagnoseL0Tile();
    });

    // Log detailed results
    console.log('\n=== Missing Pages Analysis ===');
    console.log(`Viewport: ${analysis.viewportSize}`);
    console.log(`Page size: ${analysis.pagePixelSize}`);
    console.log(`Sample size: ${analysis.sampleSize}`);
    console.log(`Grid: ${analysis.gridSize}`);
    console.log(`Expected pages: ${analysis.totalExpectedPages}`);
    console.log(`Missing pages: ${analysis.missingCount}`);
    console.log(`Completeness: ${analysis.completeness}`);

    if (analysis.missingCount > 0) {
      console.log('\nMissing page details (first 20):');
      analysis.missingPages.slice(0, 20).forEach(p => {
        console.log(`  Page ${p.pageNum} (row ${p.row}, col ${p.col}): ${p.backgroundPercent}% background color`);
      });
      if (analysis.missingCount > 20) {
        console.log(`  ... and ${analysis.missingCount - 20} more`);
      }
    }

    // Log diagnostic data
    console.log('\n=== L0 Tile Diagnostics ===');
    console.log(`Resolution: ${diagnostics.resolution}`);
    console.log(`Pages needed: ${diagnostics.neededCount}`);
    console.log(`Pages cached: ${diagnostics.cachedCount}`);
    console.log(`Pages missing from cache: ${diagnostics.missingCount}`);
    console.log(`Cache completeness: ${diagnostics.completeness}`);
    console.log(`Low-res cache size: ${diagnostics.lowResCacheSize}`);
    console.log(`High-res cache size: ${diagnostics.highResCacheSize}`);

    console.log('\n=== On-Demand Rendering Stats ===');
    console.log(`Enabled: ${diagnostics.onDemandTracking.enabled}`);
    console.log(`Triggered: ${diagnostics.onDemandTracking.triggeredCount}`);
    console.log(`Completed: ${diagnostics.onDemandTracking.completedCount}`);
    console.log(`Failed: ${diagnostics.onDemandTracking.failedCount}`);
    console.log(`Skipped: ${diagnostics.onDemandTracking.skippedCount} (disabled: ${diagnostics.onDemandTracking.skippedByReason.disabled}, already rendering: ${diagnostics.onDemandTracking.skippedByReason.alreadyRendering})`);

    if (diagnostics.onDemandTracking.triggeredCount > 0) {
      console.log(`\nTriggered pages (first 20): ${diagnostics.onDemandTracking.triggered.slice(0, 20).join(', ')}`);
      if (diagnostics.onDemandTracking.triggeredCount > 20) {
        console.log(`  ... and ${diagnostics.onDemandTracking.triggeredCount - 20} more`);
      }
    }

    if (diagnostics.onDemandTracking.completedCount > 0) {
      console.log(`\nCompleted pages (first 20): ${diagnostics.onDemandTracking.completed.slice(0, 20).join(', ')}`);
      if (diagnostics.onDemandTracking.completedCount > 20) {
        console.log(`  ... and ${diagnostics.onDemandTracking.completedCount - 20} more`);
      }
    }

    if (diagnostics.onDemandTracking.failedCount > 0) {
      console.log(`\nFailed renders:`);
      diagnostics.onDemandTracking.failed.forEach(f => {
        console.log(`  Page ${f.page}: ${f.error}`);
      });
    }

    if (diagnostics.missingCount > 0) {
      console.log(`\nMissing from cache (first 20): ${diagnostics.missing.slice(0, 20).join(', ')}`);
      if (diagnostics.missingCount > 20) {
        console.log(`  ... and ${diagnostics.missingCount - 20} more`);
      }
    }

    // Cross-reference: pages visually missing vs pages missing from cache
    const visuallyMissingPageNums = new Set(analysis.missingPages.map(p => p.pageNum));
    const cacheMissingPageNums = new Set(diagnostics.missing);
    const mismatch = [...visuallyMissingPageNums].filter(p => !cacheMissingPageNums.has(p));

    if (mismatch.length > 0) {
      console.log(`\n⚠️  MISMATCH: ${mismatch.length} pages are visually missing but ARE in cache!`);
      console.log(`   This suggests a rendering bug, not a cache issue.`);
      console.log(`   Pages: ${mismatch.slice(0, 10).join(', ')}${mismatch.length > 10 ? '...' : ''}`);
    }

    // Log tile generation tracking
    console.log('\n=== L0 Tile Generation Tracking ===');
    console.log(`generateTile() calls: ${diagnostics.tileGeneration.generateTileCalls}`);
    console.log(`_renderTile() calls: ${diagnostics.tileGeneration.renderTileCalls}`);
    console.log(`Delayed calls: ${diagnostics.tileGeneration.delayedCalls}`);

    if (diagnostics.tileGeneration.generateTileCalls > 0) {
      console.log('\nGeneration call timeline (with cache state):');
      diagnostics.tileGeneration.callTimeline.forEach((call, idx) => {
        const timing = call.timeSinceFirst !== undefined ? ` +${call.timeSinceFirst}ms` : '';
        console.log(`  [${idx + 1}]${timing} Level ${call.level} (${call.x},${call.y}): ${call.cachedPages}/${call.totalPages} cached (${call.completeness})`);
      });
    }

    if (diagnostics.tileGeneration.renderTileCalls > 0) {
      console.log('\nRender timeline:');
      diagnostics.tileGeneration.renderTimeline.forEach((render, idx) => {
        const pagesStr = render.neededPages.slice(0, 10).join(',');
        const more = render.neededPages.length > 10 ? `...+${render.neededPages.length - 10}` : '';
        console.log(`  [${idx + 1}] ${render.key} (${render.resolution}): pages ${pagesStr}${more}`);
      });
    }

    // Log parallel rendering stats
    if (diagnostics.parallelRendering) {
      const pr = diagnostics.parallelRendering;
      const elapsed = ((Date.now() - pr.startTime) / 1000).toFixed(1);
      const rate = pr.rendered > 0 ? (pr.rendered / parseFloat(elapsed)).toFixed(1) : '0';
      console.log('\n=== Parallel Rendering Stats ===');
      console.log(`Total pages: ${pr.totalPages}`);
      console.log(`Rendered: ${pr.rendered}`);
      console.log(`Skipped (already cached): ${pr.skipped}`);
      console.log(`Failed: ${pr.failed}`);
      console.log(`Max workers: ${pr.maxActiveWorkers}`);
      console.log(`Elapsed time: ${elapsed}s`);
      console.log(`Rate: ${rate} pages/sec`);
    }

    // Log drawing debug data
    console.log('\n=== Drawing Debug (L0 Tile) ===');
    console.log(`Total draw attempts: ${diagnostics.drawingDebug.totalSuccesses + diagnostics.drawingDebug.totalFailures}`);
    console.log(`Successful draws: ${diagnostics.drawingDebug.totalSuccesses}`);
    console.log(`Failed draws: ${diagnostics.drawingDebug.totalFailures}`);

    if (diagnostics.drawingDebug.successfulPages.length > 0) {
      console.log(`\nSuccessfully drawn pages: ${diagnostics.drawingDebug.successfulPages.join(', ')}`);
    }

    if (diagnostics.drawingDebug.failuresByReason.length > 0) {
      console.log('\nDraw failures by reason:');
      diagnostics.drawingDebug.failuresByReason.forEach(({ reason, count, examples }) => {
        console.log(`  ${reason}: ${count} failures`);
        examples.forEach(ex => {
          const details = JSON.stringify(ex, null, 2).split('\n').map(l => '    ' + l).join('\n');
          console.log(details);
        });
      });
    }

    // Assert: All expected pages should be present
    expect(analysis.missingCount).toBe(0);
    expect(parseFloat(analysis.completeness)).toBeGreaterThan(95);
  });

  test('should detect missing pages in L0 navigator tile for large PDF', async ({ page }) => {
    // Set explicit viewport for consistent pixel calculations
    await page.setViewportSize({ width: 1920, height: 1080 });

    // Load large PDF (126 pages) - adjust filename as needed
    await page.goto('http://localhost:8000/?pdf=demo-126.pdf');

    // Wait longer for large PDF initial render
    await page.waitForTimeout(8000);

    const analysis = await page.evaluate(() => {
      // Same analysis code as above...
      const pattern = window.tileStreamerRef.pattern;
      const gridDims = window.tileStreamerRef.gridDims;
      const viewer = window.viewer;
      const viewport = viewer.viewport;

      const pageWidth = gridDims.pageWidth;
      const pageHeight = gridDims.pageHeight;

      const topLeft = viewport.imageToViewportCoordinates(0, 0);
      const bottomRight = viewport.imageToViewportCoordinates(pageWidth, pageHeight);
      const pageWidthInViewport = bottomRight.x - topLeft.x;
      const pageHeightInViewport = bottomRight.y - topLeft.y;

      const containerSize = viewport.getContainerSize();
      const pageWidthInPixels = pageWidthInViewport * containerSize.x;
      const pageHeightInPixels = pageHeightInViewport * containerSize.y;

      const samplePercent = 0.3;
      const sampleWidth = Math.max(1, Math.min(
        Math.round(pageWidthInPixels * samplePercent),
        Math.floor(pageWidthInPixels * 0.9)
      ));
      const sampleHeight = Math.max(1, Math.min(
        Math.round(pageHeightInPixels * samplePercent),
        Math.floor(pageHeightInPixels * 0.9)
      ));

      console.log(`[Large PDF Test] Page size: ${pageWidthInPixels.toFixed(1)}×${pageHeightInPixels.toFixed(1)}px`);
      console.log(`[Large PDF Test] Sample size: ${sampleWidth}×${sampleHeight}px`);

      const canvas = viewer.drawer.canvas;
      const ctx = canvas.getContext('2d');
      const BACKGROUND_RGB = { r: 31, g: 41, b: 55 };
      const TOLERANCE = 15;

      const unexpectedBlanks = [];
      let totalExpectedPages = 0;

      for (let row = 0; row < pattern.length; row++) {
        for (let col = 0; col < pattern[row].length; col++) {
          const pageNum = pattern[row][col];
          if (pageNum === 0) continue;

          totalExpectedPages++;

          const pageLeft = col * (pageWidth + gridDims.spacing);
          const pageTop = row * (pageHeight + gridDims.spacing);
          const centerGridX = pageLeft + pageWidth / 2;
          const centerGridY = pageTop + pageHeight / 2;

          const viewportPoint = viewport.imageToViewportCoordinates(centerGridX, centerGridY);
          const canvasX = Math.round(viewportPoint.x * containerSize.x);
          const canvasY = Math.round(viewportPoint.y * containerSize.y);

          try {
            const imageData = ctx.getImageData(
              canvasX - sampleWidth / 2,
              canvasY - sampleHeight / 2,
              sampleWidth,
              sampleHeight
            );

            const pixels = imageData.data;
            let backgroundPixels = 0;
            const totalPixels = pixels.length / 4;

            for (let i = 0; i < pixels.length; i += 4) {
              const r = pixels[i];
              const g = pixels[i + 1];
              const b = pixels[i + 2];

              if (Math.abs(r - BACKGROUND_RGB.r) < TOLERANCE &&
                  Math.abs(g - BACKGROUND_RGB.g) < TOLERANCE &&
                  Math.abs(b - BACKGROUND_RGB.b) < TOLERANCE) {
                backgroundPixels++;
              }
            }

            const backgroundPercent = (backgroundPixels / totalPixels) * 100;
            if (backgroundPercent > 90) {
              unexpectedBlanks.push({ pageNum, row, col, backgroundPercent: backgroundPercent.toFixed(1) });
            }
          } catch (err) {
            console.warn(`Failed to sample page ${pageNum}:`, err.message);
          }
        }
      }

      const completeness = totalExpectedPages > 0
        ? ((totalExpectedPages - unexpectedBlanks.length) / totalExpectedPages * 100).toFixed(1)
        : 100;

      return {
        pagePixelSize: `${pageWidthInPixels.toFixed(1)}×${pageHeightInPixels.toFixed(1)}px`,
        sampleSize: `${sampleWidth}×${sampleHeight}px`,
        totalExpectedPages,
        missingPages: unexpectedBlanks,
        missingCount: unexpectedBlanks.length,
        completeness: `${completeness}%`
      };
    });

    console.log('\n=== Large PDF Missing Pages Analysis ===');
    console.log(`Page size: ${analysis.pagePixelSize}`);
    console.log(`Sample size: ${analysis.sampleSize}`);
    console.log(`Expected pages: ${analysis.totalExpectedPages}`);
    console.log(`Missing pages: ${analysis.missingCount}`);
    console.log(`Completeness: ${analysis.completeness}`);

    if (analysis.missingCount > 0) {
      console.log('\nMissing page details (first 20):');
      analysis.missingPages.slice(0, 20).forEach(p => {
        console.log(`  Page ${p.pageNum} (row ${p.row}, col ${p.col}): ${p.backgroundPercent}% background`);
      });
      if (analysis.missingCount > 20) {
        console.log(`  ... and ${analysis.missingCount - 20} more`);
      }
    }

    // Assert completeness
    expect(analysis.missingCount).toBe(0);
    expect(parseFloat(analysis.completeness)).toBeGreaterThan(95);
  });
});
