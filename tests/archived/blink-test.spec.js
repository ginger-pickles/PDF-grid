const { test, expect } = require('@playwright/test');

test('debug button blink', async ({ page }) => {
  page.on('console', msg => console.log('PAGE:', msg.text()));
  
  await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf&debug=1');
  await page.waitForTimeout(4000);
  
  // Check if triggerBlink function exists
  const hasTriggerBlink = await page.evaluate(() => {
    return typeof window.__triggerInspectorBlink === 'function';
  });
  console.log('__triggerInspectorBlink exists:', hasTriggerBlink);
  
  // Check the Inspect button's current classes
  const inspectBtn = page.locator('button:has-text("Inspect")').first();
  const classesBefore = await inspectBtn.getAttribute('class');
  console.log('Inspect button classes BEFORE click:', classesBefore);
  
  // Click the button
  await inspectBtn.click();
  await page.waitForTimeout(100);
  
  // Check classes immediately after click
  const classesAfter = await inspectBtn.getAttribute('class');
  console.log('Inspect button classes AFTER click:', classesAfter);
  
  // Check if animate-pulse is in the classes
  const hasPulse = classesAfter?.includes('animate-pulse');
  console.log('Has animate-pulse:', hasPulse);
  
  // Also test manual trigger
  await page.evaluate(() => {
    console.log('Manually calling __triggerInspectorBlink("inspect")');
    if (window.__triggerInspectorBlink) {
      window.__triggerInspectorBlink('inspect');
    }
  });
  await page.waitForTimeout(100);
  
  const classesManual = await inspectBtn.getAttribute('class');
  console.log('Classes after manual trigger:', classesManual);
  
  await page.screenshot({ path: '/tmp/blink-test.png' });
});
