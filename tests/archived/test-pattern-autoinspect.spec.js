const { test, expect } = require('@playwright/test');

test('auto-inspector with test-pattern.pdf', async ({ page }) => {
  test.setTimeout(30000);

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[Auto-Inspector]')) {
      console.log(text);
    }
  });

  // Load test pattern with debug mode
  await page.goto('http://localhost:8000/?pdf=demo/test-pattern.pdf&debug=1');

  // Wait for viewer to be ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 10000 });
  console.log('=== Viewer ready ===\n');

  // Get initial state
  const initialVisual = await page.evaluate(() => window.tileStreamerRef?.inspectVisual());
  console.log('Initial visual:', JSON.stringify(initialVisual));

  // Watch for 12 seconds
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => window.tileStreamerRef?.inspectVisual());
    console.log(`[T+${(i+1)*2}s] stripes=${result?.hasRedStripes}, regions=${result?.stripePatternCount}`);
  }

  // Final state
  const finalVisual = await page.evaluate(() => window.tileStreamerRef?.inspectVisual());
  console.log('\n=== FINAL ===');
  console.log(JSON.stringify(finalVisual, null, 2));

  await page.screenshot({ path: 'test-results/test-pattern-autoinspect.png' });

  // Count heals
  const healLogs = consoleLogs.filter(l => l.includes('HARD HEAL'));
  console.log(`\nTotal HARD HEALs: ${healLogs.length}`);
});
