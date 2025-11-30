const { test, expect } = require('@playwright/test');

test('visual inspection before and after healing', async ({ page }) => {
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(5000);

  // Visual inspection BEFORE healing
  const beforeHeal = await page.evaluate(() => {
    return window.tileStreamerRef.inspectVisual();
  });
  console.log('\n=== BEFORE HEALING ===');
  console.log(JSON.stringify(beforeHeal, null, 2));

  // Now heal all incomplete tiles
  const healReport = await page.evaluate(async () => {
    return await window.tileStreamerRef.healIncompleteTiles();
  });
  console.log('\n=== HEALING REPORT ===');
  console.log(`Scanned: ${healReport.scanned}, Incomplete: ${healReport.incomplete?.length}, Healed: ${healReport.healed?.length}`);

  // Force OSD to redraw with healed tiles
  await page.evaluate(() => {
    if (window.osdViewerRef) {
      window.osdViewerRef.forceRedraw();
    }
  });
  await page.waitForTimeout(1000);

  // Visual inspection AFTER healing
  const afterHeal = await page.evaluate(() => {
    return window.tileStreamerRef.inspectVisual();
  });
  console.log('\n=== AFTER HEALING ===');
  console.log(JSON.stringify(afterHeal, null, 2));

  // Take screenshots
  await page.screenshot({ path: '/tmp/visual-after-heal.png' });

  // After healing, there should be no stripe patterns
  // (unless the heal didn't work or new incomplete tiles appeared)
  console.log('\n=== COMPARISON ===');
  console.log(`Before: hasRedStripes=${beforeHeal.hasRedStripes}, patterns=${beforeHeal.stripePatternCount}`);
  console.log(`After: hasRedStripes=${afterHeal.hasRedStripes}, patterns=${afterHeal.stripePatternCount}`);
});
