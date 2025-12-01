const { test, expect } = require('@playwright/test');

test('demo-3.pdf console output', async ({ page }) => {
  test.setTimeout(60000);
  
  const logs = [];
  const errors = [];
  
  page.on('console', msg => {
    const text = msg.text();
    logs.push({ type: msg.type(), text });
    if (msg.type() === 'error') {
      errors.push(text);
    }
  });
  
  await page.goto('http://localhost:8000/?pdf=demo-3.pdf&debug=1');
  await page.waitForTimeout(10000);
  
  // Zoom in a few times
  for (let i = 0; i < 4; i++) {
    await page.evaluate(() => {
      if (window.osdViewerRef) {
        window.osdViewerRef.viewport.zoomBy(2);
      }
    });
    await page.waitForTimeout(1500);
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`Total logs: ${logs.length}`);
  console.log(`Errors: ${errors.length}`);
  
  if (errors.length > 0) {
    console.log(`\n=== ERRORS ===`);
    errors.forEach(e => console.log(`  ${e}`));
  }
  
  // Show warnings
  const warnings = logs.filter(l => l.type === 'warning');
  if (warnings.length > 0) {
    console.log(`\n=== WARNINGS (${warnings.length}) ===`);
    warnings.slice(0, 5).forEach(w => console.log(`  ${w.text}`));
  }
  
  expect(errors.length).toBe(0);
});
