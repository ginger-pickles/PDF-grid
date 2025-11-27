const { test, expect } = require('@playwright/test');

test('visual inspection button test', async ({ page }) => {
  page.on('console', msg => console.log(msg.text()));

  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(4000);

  // Find and click Visual button
  const visualBtn = await page.locator('button:has-text("Visual")').first();
  await expect(visualBtn).toBeVisible();
  await visualBtn.click();
  await page.waitForTimeout(500);

  // Check results appear
  const resultText = await page.locator('text=Visual Inspection').first();
  await expect(resultText).toBeVisible();

  // Get the actual result
  const result = await page.evaluate(() => {
    if (!window.tileStreamerRef) return { error: 'No tileStreamer' };
    return window.tileStreamerRef.inspectVisual();
  });

  console.log('\n=== VISUAL INSPECTION RESULT ===');
  console.log(JSON.stringify(result, null, 2));

  // Take screenshot
  await page.screenshot({ path: '/tmp/visual-inspect-test.png' });
  console.log('Screenshot saved to /tmp/visual-inspect-test.png');

  // After PDF fully loaded, there should be no red stripes
  expect(result.hasRedStripes).toBe(false);
});
