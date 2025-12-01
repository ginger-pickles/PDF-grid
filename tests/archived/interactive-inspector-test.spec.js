const { test, expect } = require('@playwright/test');

test('tile inspector buttons work interactively', async ({ page }) => {
  page.on('console', msg => {
    if (msg.text().includes('Inspector') || msg.text().includes('Healing') || msg.text().includes('VISUAL')) {
      console.log('PAGE:', msg.text());
    }
  });

  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(5000);

  // 1. Test Inspect button
  console.log('\n=== Testing INSPECT button ===');
  const inspectBtn = page.locator('button:has-text("Inspect")').first();
  await expect(inspectBtn).toBeVisible();
  await inspectBtn.click();
  await page.waitForTimeout(500);

  const inspectResult = await page.locator('text=Inspection Results').isVisible();
  console.log('Inspect result displayed:', inspectResult);
  expect(inspectResult).toBe(true);

  // 2. Test Visual button
  console.log('\n=== Testing VISUAL button ===');
  const visualBtn = page.locator('button:has-text("Visual")').first();
  await expect(visualBtn).toBeVisible();
  await visualBtn.click();
  await page.waitForTimeout(500);

  const visualResult = await page.locator('text=Visual Inspection').isVisible();
  console.log('Visual result displayed:', visualResult);
  expect(visualResult).toBe(true);

  // Check for specific visual result text
  const hasRedStripes = await page.locator('text=Incomplete tiles detected').isVisible();
  const isClean = await page.locator('text=Clean - no incomplete').isVisible();
  console.log('Red stripes detected:', hasRedStripes);
  console.log('Clean status:', isClean);
  expect(hasRedStripes || isClean).toBe(true); // One of these should be visible

  // 3. Test Heal button
  console.log('\n=== Testing HEAL button ===');
  const healBtn = page.locator('button:has-text("Heal")').first();
  await expect(healBtn).toBeVisible();
  await healBtn.click();

  // Wait for "Healing in progress" to show
  await page.waitForTimeout(500);
  const healingProgress = await page.locator('text=Healing in progress').isVisible();
  console.log('Healing progress shown:', healingProgress);

  // Wait for healing to complete
  await page.waitForTimeout(3000);

  const healResult = await page.locator('text=Healing Results').isVisible();
  console.log('Heal result displayed:', healResult);
  expect(healResult).toBe(true);

  // Check for healing stats
  const hasScannedText = await page.locator('text=/Scanned: \\d+/').isVisible();
  console.log('Scanned count shown:', hasScannedText);
  expect(hasScannedText).toBe(true);

  // 4. Test Clear button
  console.log('\n=== Testing CLEAR button ===');
  const clearBtn = page.locator('button:has-text("Clear")').first();
  await expect(clearBtn).toBeVisible();
  await clearBtn.click();
  await page.waitForTimeout(200);

  const resultCleared = !(await page.locator('text=Healing Results').isVisible());
  console.log('Results cleared:', resultCleared);
  expect(resultCleared).toBe(true);

  // Take final screenshot
  await page.screenshot({ path: '/tmp/inspector-test-complete.png' });
  console.log('\n✓ All inspector buttons working correctly!');
});
