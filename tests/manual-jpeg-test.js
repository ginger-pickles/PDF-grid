const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const errors = [];
  page.on('console', msg => {
    const text = msg.text();
    const msgType = msg.type();
    if (msgType === 'error' || text.includes('[ERROR]') || text.includes('JPEG') || text.includes('RENDERED')) {
      console.log(`[CONSOLE-${msgType}]`, text);
    }
  });
  page.on('pageerror', err => {
    errors.push(err.message);
    console.log('[PAGE ERROR]', err.message);
  });

  try {
    console.log('Loading page with test-pattern.pdf...');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf', { timeout: 10000 });

    // Wait for potential PDF load
    await page.waitForTimeout(8000);

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

    console.log('\nState:', JSON.stringify(state, null, 2));
    if (errors.length > 0) {
      console.log('\nErrors:', errors);
    }
  } catch (err) {
    console.log('[LOAD ERROR]', err.message);
  }

  await browser.close();
})();
