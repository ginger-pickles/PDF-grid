/**
 * Minimal Diagnostic Test - Quick check before crash
 */

const { test, expect } = require('@playwright/test');
const { setupOfflineRoutes } = require('./test-helpers');

test('Minimal page check', async ({ page }) => {
  const consoleMessages = [];

  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });

  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}`);
  });

  await setupOfflineRoutes(page);

  console.log('Loading page...');
  await page.goto('http://localhost:8000/?pdf=demo/test-pattern.pdf');

  // Get info immediately - don't wait
  console.log('Checking immediately...');

  const title = await page.title();
  console.log(`Title: ${title}`);

  const libs = await page.evaluate(() => ({
    react: !!window.React,
    osd: !!window.OpenSeadragon,
    pdf: !!window.pdfjsLib
  }));
  console.log(`Libs loaded - React: ${libs.react}, OSD: ${libs.osd}, PDF: ${libs.pdf}`);

  // Quick check for viewer after 1 second
  await page.waitForTimeout(1000);

  const state1 = await page.evaluate(() => ({
    viewer: !!window.viewer,
    tileStreamer: !!window.tileStreamerRef
  }));
  console.log(`After 1s - viewer: ${state1.viewer}, tileStreamer: ${state1.tileStreamer}`);

  // Check again after 2 more seconds
  await page.waitForTimeout(2000);

  const state2 = await page.evaluate(() => ({
    viewer: !!window.viewer,
    tileStreamer: !!window.tileStreamerRef,
    numPages: window.tileStreamerRef?.numPages || 0
  }));
  console.log(`After 3s - viewer: ${state2.viewer}, tileStreamer: ${state2.tileStreamer}, pages: ${state2.numPages}`);

  // Print console messages
  console.log('\n=== Console Messages ===');
  for (const msg of consoleMessages.slice(-20)) {
    console.log(msg);
  }

  expect(title).toBe('PDF Grid Viewer');
});
