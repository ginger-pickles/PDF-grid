/**
 * Diagnostic Test - Capture console errors and page state
 */

const { test, expect } = require('@playwright/test');

test('Diagnostic: Check for JavaScript errors', async ({ page }) => {
  const consoleMessages = [];
  const consoleErrors = [];
  const consoleWarnings = [];

  // Capture ALL console messages
  page.on('console', msg => {
    const text = msg.text();
    consoleMessages.push({ type: msg.type(), text });

    if (msg.type() === 'error') {
      consoleErrors.push(text);
      console.error('[BROWSER ERROR]', text);
    }
    if (msg.type() === 'warning') {
      consoleWarnings.push(text);
      console.warn('[BROWSER WARNING]', text);
    }
    if (msg.type() === 'log') {
      console.log('[BROWSER LOG]', text);
    }
  });

  // Capture page errors
  page.on('pageerror', err => {
    console.error('[PAGE ERROR]', err.message);
    consoleErrors.push(err.message);
  });

  console.log('\n=== Loading demo-1.pdf ===\n');

  // Load PDF
  await page.goto('http://localhost:8000?pdf=demo-1.pdf');

  // Wait a reasonable time
  await page.waitForTimeout(10000);

  // Check what globals are defined
  const globals = await page.evaluate(() => {
    return {
      viewer: typeof window.viewer,
      viewerReady: window.viewerReady,
      PDFGridDiagnostics: typeof window.__PDFGridDiagnostics,
      CONFIG: typeof CONFIG,
      OpenSeadragon: typeof OpenSeadragon,
      pdfjsLib: typeof pdfjsLib,
      React: typeof React,
      ReactDOM: typeof ReactDOM
    };
  });

  console.log('\n=== Global Objects ===');
  console.log(JSON.stringify(globals, null, 2));

  console.log('\n=== Console Errors ===');
  consoleErrors.forEach(err => console.log('  -', err));

  console.log('\n=== Console Warnings (last 10) ===');
  consoleWarnings.slice(-10).forEach(warn => console.log('  -', warn));

  // Don't assert - just collect info
  console.log(`\nTotal console messages: ${consoleMessages.length}`);
  console.log(`Errors: ${consoleErrors.length}, Warnings: ${consoleWarnings.length}`);
});
