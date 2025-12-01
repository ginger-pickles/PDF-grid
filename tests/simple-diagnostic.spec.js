/**
 * Simple Diagnostic Test
 * Check what happens when the page loads
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');

test('Basic page load diagnostic', async ({ page }) => {
  const consoleMessages = [];
  const errors = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
    if (msg.type() === 'error') {
      errors.push(msg.text());
    }
  });

  page.on('pageerror', err => {
    errors.push(`[PAGE ERROR] ${err.message}`);
  });

  // Setup offline routes
  await setupOfflineRoutes(page);

  console.log('Navigating to page with PDF...');
  await page.goto('http://localhost:8000/?pdf=demo/test-pattern.pdf');

  // Wait for page to initialize
  await page.waitForTimeout(10000);

  console.log('\n=== CONSOLE MESSAGES ===');
  for (const msg of consoleMessages) {
    console.log(msg);
  }

  console.log('\n=== ERRORS ===');
  for (const err of errors) {
    console.log(err);
  }

  // Check basic page elements
  const title = await page.title();
  console.log(`\nPage title: ${title}`);

  // Check if React is loaded
  const reactLoaded = await page.evaluate(() => !!window.React);
  console.log(`React loaded: ${reactLoaded}`);

  // Check if OpenSeadragon is loaded
  const osdLoaded = await page.evaluate(() => !!window.OpenSeadragon);
  console.log(`OpenSeadragon loaded: ${osdLoaded}`);

  // Check if pdfjsLib is loaded
  const pdfLoaded = await page.evaluate(() => !!window.pdfjsLib);
  console.log(`PDF.js loaded: ${pdfLoaded}`);

  // Check if viewer is set
  const viewerSet = await page.evaluate(() => !!window.viewer);
  console.log(`window.viewer set: ${viewerSet}`);

  // Check if tileStreamerRef is set
  const tileStreamerSet = await page.evaluate(() => !!window.tileStreamerRef);
  console.log(`window.tileStreamerRef set: ${tileStreamerSet}`);

  // Skip screenshot - causes crash in sandbox
  console.log('\nSkipping screenshot (causes sandbox crash)');

  // Basic assertion so test passes
  expect(title).toBeTruthy();
});
