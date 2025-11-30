const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const allLogs = [];
  const errors = [];

  // Capture ALL console messages
  page.on('console', msg => {
    const text = msg.text();
    const type = msg.type();
    allLogs.push({ type, text, time: Date.now() });
    console.log(`[${type.toUpperCase()}] ${text}`);
  });

  // Capture page errors
  page.on('pageerror', err => {
    errors.push({ message: err.message, stack: err.stack, time: Date.now() });
    console.log('\n❌ [PAGE ERROR]', err.message);
    console.log(err.stack);
  });

  // Capture failed requests
  page.on('requestfailed', req => {
    console.log('\n❌ [REQUEST FAILED]', req.url(), req.failure().errorText);
  });

  try {
    console.log('='.repeat(80));
    console.log('Loading: http://localhost:8000?pdf=demo/test-pattern.pdf');
    console.log('='.repeat(80) + '\n');

    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    console.log('\nWaiting 20 seconds for all rendering phases...\n');
    await page.waitForTimeout(20000);

    const state = await page.evaluate(() => {
      const ts = window.tileSource;
      const ps = ts?.pageStreamer;

      return {
        pdfDoc: {
          loaded: !!window.pdfDoc,
          numPages: window.pdfDoc?.numPages,
        },
        viewer: {
          ready: window.viewerReady,
          exists: !!window.viewer,
        },
        tileSource: {
          exists: !!ts,
        },
        pageStreamer: {
          exists: !!ps,
          lowResCache: ps?.lowResPageCache?.size || 0,
          highResCache: ps?.highResPageCache?.size || 0,
          decodedCache: ps?.decodedImageCache?.size || 0,
          rendering: ps?.renderingInProgress?.size || 0,
        },
        tiles: {
          cached: ts?.cacheManager?.tileCache?.cache?.size || 0,
        },
        errors: errors.length,
      };
    });

    console.log('\n' + '='.repeat(80));
    console.log('FINAL STATE');
    console.log('='.repeat(80));
    console.log(JSON.stringify(state, null, 2));

    // Analyze logs
    const phaseLog = allLogs.filter(l => l.text.includes('Phase'));
    const errorLog = allLogs.filter(l => l.type === 'error');
    const jpegLog = allLogs.filter(l => l.text.includes('JPEG') || l.text.includes('RENDERED'));

    console.log('\n' + '='.repeat(80));
    console.log('PHASE LOGS');
    console.log('='.repeat(80));
    phaseLog.forEach(l => console.log(l.text));

    if (jpegLog.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('JPEG COMPRESSION LOGS');
      console.log('='.repeat(80));
      jpegLog.forEach(l => console.log(l.text));
    }

    if (errorLog.length > 0) {
      console.log('\n' + '='.repeat(80));
      console.log('CONSOLE ERRORS');
      console.log('='.repeat(80));
      errorLog.forEach(l => console.log(l.text));
    }

    console.log('\n' + '='.repeat(80));
    console.log('DIAGNOSIS');
    console.log('='.repeat(80));

    if (!state.pdfDoc.loaded) {
      console.log('❌ PDF not loaded');
    } else {
      console.log(`✓ PDF loaded (${state.pdfDoc.numPages} pages)`);
    }

    if (!state.viewer.ready) {
      console.log('❌ Viewer not ready');
    } else {
      console.log('✓ Viewer ready');
    }

    if (state.pageStreamer.lowResCache === 0 && state.pageStreamer.highResCache === 0) {
      console.log('❌ No pages rendered to cache');
    } else {
      console.log(`✓ Pages cached: ${state.pageStreamer.lowResCache} low-res, ${state.pageStreamer.highResCache} high-res`);
    }

    if (state.pageStreamer.decodedCache === 0) {
      console.log('❌ No decoded images cached');
    } else {
      console.log(`✓ Decoded images: ${state.pageStreamer.decodedCache}`);
    }

    if (state.tiles.cached === 0) {
      console.log('❌ No tiles cached');
    } else {
      console.log(`✓ Tiles cached: ${state.tiles.cached}`);
    }

    if (state.pageStreamer.rendering > 0) {
      console.log(`⚠ Still rendering: ${state.pageStreamer.rendering} pages in progress`);
    }

    console.log('\n' + '='.repeat(80));
    console.log('Browser window will stay open for manual inspection');
    console.log('Check the console in DevTools for more details');
    console.log('Press Ctrl+C to close');
    console.log('='.repeat(80));

    // Keep browser open
    await new Promise(() => {});
  } catch (err) {
    console.log('\n❌ [FATAL ERROR]', err.message);
    console.log(err.stack);
    await browser.close();
  }
})();
