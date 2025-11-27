const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('JPEG') || text.includes('RENDERED') || text.includes('Phase') || text.includes('[PageStreamer]')) {
      console.log(`[CONSOLE]`, text);
    }
  });

  page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err.message);
  });

  try {
    console.log('Loading page...\n');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    console.log('Waiting 15 seconds for rendering...\n');
    await page.waitForTimeout(15000);

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

    if (state.tilesCached > 0) {
      console.log('\n✅ SUCCESS: Tiles are being cached!');
    } else {
      console.log('\n❌ ISSUE: No tiles cached');
    }
  } catch (err) {
    console.log('[ERROR]', err.message);
  }

  await browser.close();
})();
