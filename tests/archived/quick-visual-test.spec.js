const { test, expect } = require('@playwright/test');

test('visual inspection quick test', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('VISUAL') || msg.text().includes('Error')) {
      console.log(msg.text());
    }
  });

  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(5000);

  // Click Visual button
  const visualBtn = await page.locator('button:has-text("Visual")').first();
  const isVisible = await visualBtn.isVisible();
  console.log('Visual button visible:', isVisible);

  if (isVisible) {
    await visualBtn.click();
    await page.waitForTimeout(1000);
  }

  // Get the result directly
  const result = await page.evaluate(() => {
    if (!window.tileStreamerRef) return { error: 'No tileStreamer' };
    return window.tileStreamerRef.inspectVisual();
  });

  console.log('\n=== VISUAL INSPECTION RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // Take screenshot
  await page.screenshot({ path: '/tmp/visual-test-result.png' });
  console.log('Screenshot saved to /tmp/visual-test-result.png');

  // Verify the result structure
  expect(result).toHaveProperty('hasRedStripes');
  expect(result).toHaveProperty('sampleCount');
});
