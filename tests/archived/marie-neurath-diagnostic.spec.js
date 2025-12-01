// @ts-check
const { test, expect } = require('@playwright/test');

/**
 * Diagnostic for Marie Neurath PDF specifically - the heavy PDF that triggers tile duplication
 */
test.describe('Marie Neurath Diagnostic', () => {
  test('diagnose tile rendering for marie-neurath.pdf', async ({ page }) => {
    test.setTimeout(180000); // 3 minutes for heavy PDF

    // Collect ALL console logs for debugging
    const allLogs = [];
    const drawLogs = [];
    const errorLogs = [];

    page.on('console', msg => {
      const text = msg.text();
      allLogs.push({ type: msg.type(), text });
      if (text.includes('[DrawPage]')) {
        drawLogs.push(text);
      }
      if (msg.type() === 'error' || text.includes('Error') || text.includes('error')) {
        errorLogs.push(text);
      }
    });

    // Navigate with local PDF
    console.log('=== Loading marie-neurath.pdf ===');
    await page.goto('http://localhost:8000/?pdf=marie-neurath.pdf&debug=1');

    // Wait for initial page load
    await page.waitForTimeout(5000);

    // Check what state we're in
    const initialState = await page.evaluate(() => {
      return {
        hasOsdViewer: !!window.osdViewerRef,
        hasTileStreamerRef: !!window.tileStreamerRef,
        hasPageStreamer: !!window.pageStreamerRef,
        hasPdfDoc: !!window.pdfDoc,  // FIXED: correct property name
        viewerVisible: !!document.getElementById('openseadragon-viewer')?.offsetHeight
      };
    });
    console.log('Initial state (5s):', JSON.stringify(initialState));

    // Wait longer for heavy PDF
    await page.waitForTimeout(15000);

    // Check state again with correct property names
    const midState = await page.evaluate(() => {
      return {
        hasOsdViewer: !!window.osdViewerRef,
        hasTileStreamerRef: !!window.tileStreamerRef,
        hasPageStreamer: !!window.pageStreamerRef,
        hasPdfDoc: !!window.pdfDoc,  // FIXED
        pdfNumPages: window.pdfDoc?.numPages || 0,
        pageStreamerStatus: window.pageStreamerRef ? {
          hasPdfDoc: !!window.pageStreamerRef.pdfDoc,
          lowResCacheSize: window.pageStreamerRef.lowResPageCache?.size || 0,  // FIXED
          highResCacheSize: window.pageStreamerRef.highResPageCache?.size || 0,  // FIXED
          renderingInProgress: window.pageStreamerRef.renderingInProgress?.size || 0
        } : null,
        tileStreamerStatus: window.tileStreamerRef ? {
          maxLevel: window.tileStreamerRef.maxLevel,
          numPages: window.tileStreamerRef.numPages,
          cacheSize: window.tileStreamerRef.tileCache?.cache?.size || 0
        } : null
      };
    });
    console.log('Mid state (20s):', JSON.stringify(midState, null, 2));

    // If tileStreamer isn't initialized, check for errors
    if (!midState.hasTileStreamerRef) {
      console.log('\n=== TileStreamer not initialized! Checking errors... ===');
      console.log('Error logs collected:', errorLogs.length);
      errorLogs.forEach(e => console.log('  ERROR:', e));

      // Check what elements exist
      const elements = await page.evaluate(() => {
        return {
          viewer: !!document.getElementById('openseadragon-viewer'),
          canvas: !!document.querySelector('#openseadragon-viewer canvas'),
          debugPanel: !!document.querySelector('[class*="debug"]'),
          body: document.body.innerHTML.substring(0, 500)
        };
      });
      console.log('DOM elements:', JSON.stringify(elements, null, 2));
    }

    // Enable verbose logging
    await page.evaluate(() => {
      if (window.CONFIG) {
        window.CONFIG.VERBOSE_LOGGING = true;
      }
    });

    // Try to zoom in (this should trigger tile generation)
    console.log('\n=== Attempting zoom operations ===');
    for (let i = 0; i < 6; i++) {
      const zoomResult = await page.evaluate((iteration) => {
        if (!window.osdViewerRef) {
          return { error: 'No OSD viewer' };
        }
        try {
          const currentZoom = window.osdViewerRef.viewport.getZoom();
          window.osdViewerRef.viewport.zoomTo(currentZoom * 2);
          return {
            success: true,
            zoom: window.osdViewerRef.viewport.getZoom(),
            iteration
          };
        } catch (e) {
          return { error: e.message };
        }
      }, i);
      console.log(`Zoom ${i + 1}:`, JSON.stringify(zoomResult));
      await page.waitForTimeout(2000);
    }

    // Final state check
    const finalState = await page.evaluate(() => {
      return {
        hasOsdViewer: !!window.osdViewerRef,
        hasTileStreamerRef: !!window.tileStreamerRef,
        tileStreamerStatus: window.tileStreamerRef ? {
          maxLevel: window.tileStreamerRef.maxLevel,
          numPages: window.tileStreamerRef.numPages,
          cacheSize: window.tileStreamerRef.tileCache?.cache?.size || 0,
          gridDims: window.tileStreamerRef.gridDims
        } : null,
        osdStatus: window.osdViewerRef ? {
          zoom: window.osdViewerRef.viewport.getZoom(),
          tileCacheSize: window.osdViewerRef.world?.getItemAt(0)?.source?.tileCache?.cache?.size
        } : null
      };
    });
    console.log('\n=== Final state ===');
    console.log(JSON.stringify(finalState, null, 2));

    // Screenshot
    await page.screenshot({ path: 'test-results/marie-neurath-diag.png' });

    // Summary
    console.log(`\n=== SUMMARY ===`);
    console.log(`Total console logs: ${allLogs.length}`);
    console.log(`DrawPage logs: ${drawLogs.length}`);
    console.log(`Error logs: ${errorLogs.length}`);
    console.log(`TileStreamer initialized: ${!!finalState.hasTileStreamerRef}`);

    if (errorLogs.length > 0) {
      console.log('\n=== Error logs (first 20) ===');
      errorLogs.slice(0, 20).forEach(l => console.log('  ERROR:', l));
    }

    if (drawLogs.length > 0) {
      console.log('\n=== First 10 DrawPage logs ===');
      drawLogs.slice(0, 10).forEach(l => console.log(l));

      // CRITICAL: Analyze for tile duplication bug
      console.log('\n=== TILE DUPLICATION ANALYSIS ===');

      // Parse logs - format: [DrawPage] L8 key=X page=Y src=(srcL,srcT,srcW,srcH)
      const parsed = drawLogs.map(log => {
        const keyMatch = log.match(/key=([^\s]+)/);
        const pageMatch = log.match(/page=(\d+)/);
        const srcMatch = log.match(/src=\(([^)]+)\)/);
        const tileLeftMatch = log.match(/tileLeft=(\d+)/);
        const pageLeftMatch = log.match(/pageLeft=(\d+)/);

        const srcParts = srcMatch?.[1]?.split(',').map(s => parseInt(s.trim())) || [];

        return {
          key: keyMatch?.[1],
          page: pageMatch?.[1],
          srcLeft: srcParts[0],
          srcTop: srcParts[1],
          srcWidth: srcParts[2],
          srcHeight: srcParts[3],
          tileLeft: parseInt(tileLeftMatch?.[1] || '0'),
          pageLeft: parseInt(pageLeftMatch?.[1] || '0')
        };
      }).filter(p => p.key && p.page);

      // Group by posX (third component of key like 8_1_X_Y)
      const byPosX = {};
      for (const p of parsed) {
        const parts = p.key.split('_');
        const posX = parts[2];
        if (!byPosX[posX]) byPosX[posX] = [];
        byPosX[posX].push(p);
      }

      console.log('Tiles grouped by posX:');
      for (const [posX, tiles] of Object.entries(byPosX)) {
        const uniqueSrcLeft = [...new Set(tiles.map(t => t.srcLeft))];
        const zeroWidthCount = tiles.filter(t => t.srcWidth === 0).length;
        console.log(`  posX=${posX}: ${tiles.length} tiles, srcLeft values: [${uniqueSrcLeft.join(', ')}], zero-width: ${zeroWidthCount}`);

        // Flag potential bugs
        if (tiles.length > 1 && uniqueSrcLeft.length === 1 && uniqueSrcLeft[0] !== 0) {
          console.log(`    *** POTENTIAL BUG: Multiple tiles with same srcLeft=${uniqueSrcLeft[0]} ***`);
        }
      }

      // Check for tiles where tileLeft < pageLeft (invalid intersection)
      const invalidTiles = parsed.filter(p => p.tileLeft < p.pageLeft);
      if (invalidTiles.length > 0) {
        console.log(`\n*** ${invalidTiles.length} tiles where tileLeft < pageLeft (invalid) ***`);
        invalidTiles.slice(0, 5).forEach(t => {
          console.log(`  ${t.key}: tileLeft=${t.tileLeft} < pageLeft=${t.pageLeft}, srcWidth=${t.srcWidth}`);
        });
      }
    }

    // Don't fail the test - this is diagnostic only
    expect(true).toBe(true);
  });
});
