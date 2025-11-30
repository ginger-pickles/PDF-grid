const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const logs = [];
  const errors = [];

  page.on('console', msg => {
    const text = msg.text();
    if (msg.type() === 'error' || text.includes('[ERROR]') || text.includes('Phase') || text.includes('JPEG') || text.includes('RENDERED')) {
      logs.push(text);
    }
  });

  page.on('pageerror', err => {
    errors.push(err);
    console.log('❌ PAGE ERROR:', err.message);
  });

  try {
    console.log('Loading with PDF parameter...');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    console.log('Waiting 10 seconds for rendering...\n');
    await page.waitForTimeout(10000);

    const state = await page.evaluate(() => ({
      pdfDoc: !!window.pdfDoc,
      numPages: window.pdfDoc?.numPages,
      lowRes: window.tileSource?.pageStreamer?.lowResPageCache?.size || 0,
      highRes: window.tileSource?.pageStreamer?.highResPageCache?.size || 0,
      decoded: window.tileSource?.pageStreamer?.decodedImageCache?.size || 0,
      tiles: window.tileSource?.cacheManager?.tileCache?.cache?.size || 0,
    }));

    console.log('State:', JSON.stringify(state, null, 2));

    if (logs.length > 0) {
      console.log('\nRelevant console logs:');
      logs.forEach(l => console.log('  ', l));
    }

    if (errors.length > 0) {
      console.log('\nPage errors:', errors.map(e => e.message));
    }

    // Diagnose
    if (state.pdfDoc && state.numPages > 0) {
      console.log('\n✓ PDF loaded successfully');

      if (state.lowRes === 0 && state.highRes === 0) {
        console.log('❌ No pages rendered to cache');
      } else {
        console.log(`✓ Pages cached: ${state.lowRes} low, ${state.highRes} high, ${state.decoded} decoded`);
      }

      if (state.tiles === 0) {
        console.log('❌ No tiles cached');
      } else {
        console.log(`✓ Tiles cached: ${state.tiles}`);
      }
    } else {
      console.log('\n❌ PDF did not load');
    }
  } catch (err) {
    console.log('❌ FATAL:', err.message);
  }

  await browser.close();
})();
