const { test, expect } = require('@playwright/test');

test.describe('Console Errors', () => {
  test('should load demo-1.pdf without console errors', async ({ page }) => {
    const consoleMessages = [];
    const consoleErrors = [];
    const consoleWarnings = [];

    // Capture all console messages
    page.on('console', msg => {
      const text = msg.text();
      const type = msg.type();

      consoleMessages.push({ type, text });

      if (type === 'error') {
        consoleErrors.push(text);
      } else if (type === 'warning') {
        consoleWarnings.push(text);
      }
    });

    // Capture page errors
    const pageErrors = [];
    page.on('pageerror', error => {
      pageErrors.push(error.message);
    });

    // Load the page with demo-1.pdf
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });

    // Wait for PDF to fully render
    await page.waitForTimeout(5000);

    // Print all console messages for debugging
    console.log('\n=== Console Messages ===');
    consoleMessages.forEach(msg => {
      console.log(`[${msg.type.toUpperCase()}] ${msg.text}`);
    });

    console.log('\n=== Console Errors ===');
    if (consoleErrors.length > 0) {
      consoleErrors.forEach(err => console.log(`ERROR: ${err}`));
    } else {
      console.log('No console errors');
    }

    console.log('\n=== Console Warnings ===');
    if (consoleWarnings.length > 0) {
      consoleWarnings.forEach(warn => console.log(`WARNING: ${warn}`));
    } else {
      console.log('No console warnings');
    }

    console.log('\n=== Page Errors ===');
    if (pageErrors.length > 0) {
      pageErrors.forEach(err => console.log(`PAGE ERROR: ${err}`));
    } else {
      console.log('No page errors');
    }

    // Verify no errors occurred
    expect(pageErrors).toHaveLength(0);
    expect(consoleErrors).toHaveLength(0);
  });
});
