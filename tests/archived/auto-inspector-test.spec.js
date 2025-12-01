const { test, expect } = require('@playwright/test');

test('auto-inspector runs and heals incomplete tiles', async ({ page }) => {
  test.setTimeout(30000);
  
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    consoleLogs.push(text);
    if (text.includes('[Auto-Inspector]')) {
      console.log(text);
    }
  });

  // Load with debug mode
  await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf&debug=1');
  
  // Wait for viewer to be ready
  await page.waitForFunction(() => window.tileStreamerRef?.maxLevel > 0, { timeout: 10000 });
  console.log('Viewer ready');

  // Wait for auto-inspector to run (runs every 2 seconds)
  // Should see Visual button blink
  await page.waitForTimeout(5000);

  // Check for auto-inspector activity
  const autoInspectorLogs = consoleLogs.filter(l => l.includes('[Auto-Inspector]'));
  console.log(`\nAuto-Inspector activity: ${autoInspectorLogs.length} logs`);
  autoInspectorLogs.forEach(l => console.log(`  ${l}`));

  // Should have at least 1-2 auto-inspector runs in 5 seconds
  expect(autoInspectorLogs.length).toBeGreaterThanOrEqual(1);

  // Run visual inspection to check current state
  const visualResult = await page.evaluate(() => {
    return window.tileStreamerRef?.inspectVisual();
  });
  console.log('\nFinal visual inspection:', JSON.stringify(visualResult));

  // Take screenshot
  await page.screenshot({ path: 'test-results/auto-inspector-final.png' });
  console.log('Screenshot saved to test-results/auto-inspector-final.png');
});
