const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const allLogs = [];

  // Capture ALL console output
  page.on('console', msg => {
    const text = msg.text();
    allLogs.push(text);
    console.log(text);
  });

  page.on('pageerror', err => {
    console.log('\n❌ PAGE ERROR:', err.message);
    console.log(err.stack);
  });

  try {
    // Enable verbose logging
    await page.goto('http://localhost:8000');
    await page.evaluate(() => {
      window.CONFIG.VERBOSE_LOGGING = true;
    });

    console.log('Loading PDF with verbose logging enabled...\n');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    console.log('\n=== Waiting 15 seconds ===\n');
    await page.waitForTimeout(15000);

    const state = await page.evaluate(() => ({
      pdfDoc: !!window.pdfDoc,
      numPages: window.pdfDoc?.numPages,
      lowRes: window.tileSource?.pageStreamer?.lowResPageCache?.size || 0,
      highRes: window.tileSource?.pageStreamer?.highResPageCache?.size || 0,
      decoded: window.tileSource?.pageStreamer?.decodedImageCache?.size || 0,
      tiles: window.tileSource?.cacheManager?.tileCache?.cache?.size || 0,
    }));

    console.log('\n=== Final State ===');
    console.log(JSON.stringify(state, null, 2));
  } catch (err) {
    console.log('❌ ERROR:', err.message);
  }

  await browser.close();
})();
