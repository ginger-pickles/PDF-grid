const { test, expect } = require('@playwright/test');

test('tile inspector UI test', async ({ page }) => {
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

  // Load with debug mode
  console.log('Loading PDF with debug mode...');
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');

  console.log('Waiting for load...');
  await page.waitForTimeout(5000);

  // Check debug panel is visible
  const debugPanel = await page.locator('text=Tile Inspector').first();
  const isVisible = await debugPanel.isVisible();
  console.log('Tile Inspector section visible:', isVisible);

  // Click Inspect button
  const inspectBtn = await page.locator('button:has-text("Inspect")').first();
  await inspectBtn.click();
  await page.waitForTimeout(1000);

  // Take screenshot
  await page.screenshot({ path: '/tmp/tile-inspector-test.png' });
  console.log('Screenshot saved to /tmp/tile-inspector-test.png');

  // Check results
  const results = await page.evaluate(() => ({
    hasInspectResult: document.body.innerText.includes('Inspection Results'),
    hasIssues: document.body.innerText.includes('Issues found'),
  }));
  console.log('Results:', JSON.stringify(results, null, 2));

  expect(isVisible).toBe(true);
});
