const { test } = require('@playwright/test');

test('Capture all console output', async ({ page }) => {
  // Capture ALL console messages
  page.on('console', msg => {
    console.log(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await page.goto('http://localhost:8000?pdf=demo/demo-1.pdf');
  await page.waitForTimeout(15000);

  console.log('\n=== Page title:', await page.title());
});
