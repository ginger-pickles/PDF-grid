const { test, expect } = require('@playwright/test');

test('auto-inspector heals completely over time', async ({ page }) => {
  test.setTimeout(45000);

  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push({ time: Date.now(), text });
    if (text.includes('[Auto-Inspector]') || text.includes('HARD HEAL')) {
      console.log(text);
    }
  });

  await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf&debug=1');
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 10000 });
  console.log('=== Viewer ready, watching for 20 seconds ===\n');

  // Watch for 20 seconds (should see ~10 visual inspections, multiple heals)
  for (let i = 0; i < 10; i++) {
    await page.waitForTimeout(2000);

    const result = await page.evaluate(() => window.tileStreamerRef?.inspectVisual());
    console.log(`[T+${(i+1)*2}s] Visual: stripes=${result?.hasRedStripes}, regions=${result?.stripePatternCount}`);
  }

  // Final check
  const finalResult = await page.evaluate(() => window.tileStreamerRef?.inspectVisual());
  console.log(`\n=== FINAL: hasRedStripes=${finalResult?.hasRedStripes}, stripePatternCount=${finalResult?.stripePatternCount} ===`);

  await page.screenshot({ path: 'test-results/auto-inspector-20s.png' });

  // Count heals
  const healLogs = consoleLogs.filter(l => l.text.includes('HARD HEAL'));
  console.log(`\nTotal HARD HEALs: ${healLogs.length}`);
});
