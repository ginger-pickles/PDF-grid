const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  const allRequests = [];
  page.on('request', req => {
    allRequests.push({
      url: req.url(),
      method: req.method(),
      resourceType: req.resourceType()
    });
  });

  page.on('requestfailed', req => {
    console.log('[REQUEST FAILED]', req.url(), req.failure().errorText);
  });

  page.on('response', async (res) => {
    if (res.status() >= 400) {
      console.log(`[HTTP ${res.status()}]`, res.url());
    }
  });

  page.on('console', msg => {
    if (msg.type() === 'error') {
      console.log('[CONSOLE ERROR]', msg.text());
    }
  });

  page.on('pageerror', err => {
    console.log('[PAGE ERROR]', err.message);
    console.log(err.stack);
  });

  try {
    console.log('Loading page...\n');
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');
    await page.waitForTimeout(5000);

    console.log('\n=== All Requests ===');
    allRequests.forEach(req => {
      if (req.url.includes('.pdf') || req.resourceType === 'fetch' || req.resourceType === 'xhr') {
        console.log(`${req.method} [${req.resourceType}]`, req.url);
      }
    });

    const state = await page.evaluate(() => ({
      pdfDoc: !!window.pdfDoc,
      error: window.__loadError,
    }));

    console.log('\n=== State ===');
    console.log(JSON.stringify(state, null, 2));
  } catch (err) {
    console.log('[ERROR]', err.message);
  }

  await browser.close();
})();
