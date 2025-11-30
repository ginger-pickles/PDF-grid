const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();

  const allLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    const msgType = msg.type();
    allLogs.push(`[${msgType}] ${text}`);
    console.log(`[${msgType}]`, text);
  });

  page.on('pageerror', err => {
    allLogs.push(`[PAGE ERROR] ${err.message}`);
    console.log('[PAGE ERROR]', err.message, err.stack);
  });

  try {
    console.log('\n=== Loading page with test-pattern.pdf ===\n');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    console.log('\n=== Waiting 10 seconds for PDF to load ===\n');
    await page.waitForTimeout(10000);

    const state = await page.evaluate(() => ({
      hasPdfDoc: !!window.pdfDoc,
      numPages: window.pdfDoc?.numPages,
      viewerReady: window.viewerReady,
      tileSource: !!window.tileSource,
      lowResCached: window.tileSource?.pageStreamer?.lowResPageCache?.size || 0,
      highResCached: window.tileSource?.pageStreamer?.highResPageCache?.size || 0,
      decodedCached: window.tileSource?.pageStreamer?.decodedImageCache?.size || 0,
      tilesCached: window.tileSource?.cacheManager?.tileCache?.cache?.size || 0,
    }));

    console.log('\n=== Final State ===');
    console.log(JSON.stringify(state, null, 2));

    console.log('\n=== Keeping browser open for manual inspection ===');
    console.log('Press Ctrl+C to close');
    await new Promise(() => {}); // Keep alive
  } catch (err) {
    console.log('[LOAD ERROR]', err.message);
    await browser.close();
  }
})();
