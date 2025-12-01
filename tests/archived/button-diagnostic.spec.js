const { test, expect } = require('@playwright/test');

test('tile inspector button diagnostic', async ({ page }) => {
  page.on('console', msg => console.log('PAGE:', msg.text()));
  page.on('pageerror', err => console.log('ERROR:', err.message));

  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(5000);

  // Check tileStreamerRef
  const hasRef = await page.evaluate(() => !!window.tileStreamerRef);
  console.log('\n=== DIAGNOSTIC ===');
  console.log('window.tileStreamerRef exists:', hasRef);

  if (!hasRef) {
    console.log('ERROR: No tileStreamerRef!');
    return;
  }

  // Check what methods exist
  const methods = await page.evaluate(() => {
    const ts = window.tileStreamerRef;
    return {
      hasInspectTileQuality: typeof ts.inspectTileQuality === 'function',
      hasInspectVisual: typeof ts.inspectVisual === 'function',
      hasHealIncompleteTiles: typeof ts.healIncompleteTiles === 'function',
      hasQualityInspector: !!ts.qualityInspector,
    };
  });
  console.log('Methods available:', JSON.stringify(methods, null, 2));

  // Call inspectTileQuality
  const inspectResult = await page.evaluate(() => {
    try {
      return window.tileStreamerRef.inspectTileQuality('lowres');
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });
  console.log('\ninspectTileQuality result:', JSON.stringify(inspectResult, null, 2));

  // Call inspectVisual
  const visualResult = await page.evaluate(() => {
    try {
      return window.tileStreamerRef.inspectVisual();
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });
  console.log('\ninspectVisual result:', JSON.stringify(visualResult, null, 2));

  // Call healIncompleteTiles
  const healResult = await page.evaluate(async () => {
    try {
      return await window.tileStreamerRef.healIncompleteTiles();
    } catch (e) {
      return { error: e.message, stack: e.stack };
    }
  });
  console.log('\nhealIncompleteTiles result:', JSON.stringify(healResult, null, 2));

  // Take screenshot
  await page.screenshot({ path: '/tmp/button-diagnostic.png' });
  console.log('\nScreenshot saved to /tmp/button-diagnostic.png');
});
