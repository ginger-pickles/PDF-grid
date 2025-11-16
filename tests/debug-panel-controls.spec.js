/**
 * Debug Panel Controls Tests
 *
 * Tests the new performance toggles and resolution mode selector in the debug panel:
 * - Upfront rendering toggle
 * - Fallback rendering toggle
 * - Resolution mode selector (High/Low/Dual)
 * - localStorage persistence
 * - CONFIG object synchronization
 */

const { test, expect } = require('@playwright/test');

test.describe('Debug Panel - Performance Controls', () => {

  test.beforeEach(async ({ page }) => {
    // Clear localStorage before each test
    await page.goto('http://localhost:8000');
    await page.evaluate(() => {
      localStorage.clear();
    });

    // Navigate to app with demo PDF
    await page.goto('http://localhost:8000?pdf=demo-1.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 15000 }
    );

    // Wait for initial rendering
    await page.waitForTimeout(2000);

    // Open debug panel by clicking the Show Debug button in help panel
    // First, open help panel
    await page.click('button[title="Help"]');
    await page.waitForTimeout(500);

    // Click Show Debug button
    await page.click('button:has-text("Show Debug")');
    await page.waitForTimeout(500);

    // Verify debug panel is visible
    const debugPanel = await page.locator('text=Debug Panel').isVisible();
    expect(debugPanel).toBe(true);
  });

  test('Upfront toggle should update CONFIG and persist to localStorage', async ({ page }) => {
    // Check initial state (should be ON by default)
    const initialConfig = await page.evaluate(() => window.CONFIG.UPFRONT_RENDERING_ENABLED);
    console.log('Initial UPFRONT_RENDERING_ENABLED:', initialConfig);
    expect(initialConfig).toBe(true);

    // Find and click the Upfront button
    const upfrontButton = page.locator('button:has-text("Upfront")');
    await upfrontButton.click();
    await page.waitForTimeout(200);

    // Verify CONFIG was updated
    const configAfterToggle = await page.evaluate(() => window.CONFIG.UPFRONT_RENDERING_ENABLED);
    console.log('After toggle UPFRONT_RENDERING_ENABLED:', configAfterToggle);
    expect(configAfterToggle).toBe(false);

    // Verify localStorage was updated
    const localStorageValue = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_upfront_rendering')
    );
    console.log('localStorage value:', localStorageValue);
    expect(localStorageValue).toBe('false');

    // Toggle back
    await upfrontButton.click();
    await page.waitForTimeout(200);

    const configAfterSecondToggle = await page.evaluate(() => window.CONFIG.UPFRONT_RENDERING_ENABLED);
    expect(configAfterSecondToggle).toBe(true);

    const localStorageValueAfterSecondToggle = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_upfront_rendering')
    );
    expect(localStorageValueAfterSecondToggle).toBe('true');

    console.log('✓ Upfront toggle updates CONFIG and persists to localStorage');
  });

  test('Fallback toggle should update CONFIG and persist to localStorage', async ({ page }) => {
    // Check initial state (should be ON by default)
    const initialConfig = await page.evaluate(() => window.CONFIG.FALLBACK_RENDERING_ENABLED);
    console.log('Initial FALLBACK_RENDERING_ENABLED:', initialConfig);
    expect(initialConfig).toBe(true);

    // Find and click the Fallback button
    const fallbackButton = page.locator('button:has-text("Fallback")');
    await fallbackButton.click();
    await page.waitForTimeout(200);

    // Verify CONFIG was updated
    const configAfterToggle = await page.evaluate(() => window.CONFIG.FALLBACK_RENDERING_ENABLED);
    console.log('After toggle FALLBACK_RENDERING_ENABLED:', configAfterToggle);
    expect(configAfterToggle).toBe(false);

    // Verify localStorage was updated
    const localStorageValue = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_fallback_rendering')
    );
    console.log('localStorage value:', localStorageValue);
    expect(localStorageValue).toBe('false');

    // Toggle back
    await fallbackButton.click();
    await page.waitForTimeout(200);

    const configAfterSecondToggle = await page.evaluate(() => window.CONFIG.FALLBACK_RENDERING_ENABLED);
    expect(configAfterSecondToggle).toBe(true);

    console.log('✓ Fallback toggle updates CONFIG and persists to localStorage');
  });

  test('Resolution mode selector should update CONFIG and persist to localStorage', async ({ page }) => {
    // Check initial state (should be 'dual' by default)
    const initialConfig = await page.evaluate(() => window.CONFIG.RESOLUTION_MODE);
    console.log('Initial RESOLUTION_MODE:', initialConfig);
    expect(initialConfig).toBe('dual');

    // Click High button
    const highButton = page.locator('button:has-text("High")').last();
    await highButton.click();
    await page.waitForTimeout(200);

    // Verify CONFIG was updated
    let config = await page.evaluate(() => window.CONFIG.RESOLUTION_MODE);
    console.log('After clicking High, RESOLUTION_MODE:', config);
    expect(config).toBe('high');

    // Verify localStorage was updated
    let localStorageValue = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_resolution_mode')
    );
    console.log('localStorage value:', localStorageValue);
    expect(localStorageValue).toBe('high');

    // Click Low button
    const lowButton = page.locator('button:has-text("Low")').last();
    await lowButton.click();
    await page.waitForTimeout(200);

    config = await page.evaluate(() => window.CONFIG.RESOLUTION_MODE);
    console.log('After clicking Low, RESOLUTION_MODE:', config);
    expect(config).toBe('low');

    localStorageValue = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_resolution_mode')
    );
    expect(localStorageValue).toBe('low');

    // Click Dual button
    const dualButton = page.locator('button:has-text("Dual")');
    await dualButton.click();
    await page.waitForTimeout(200);

    config = await page.evaluate(() => window.CONFIG.RESOLUTION_MODE);
    console.log('After clicking Dual, RESOLUTION_MODE:', config);
    expect(config).toBe('dual');

    localStorageValue = await page.evaluate(() =>
      localStorage.getItem('pdfgrid_resolution_mode')
    );
    expect(localStorageValue).toBe('dual');

    console.log('✓ Resolution mode selector updates CONFIG and persists to localStorage');
  });

  test('Settings should persist across page refreshes', async ({ page }) => {
    // Set custom values
    await page.locator('button:has-text("Upfront")').click();
    await page.locator('button:has-text("Fallback")').click();
    await page.locator('button:has-text("High")').last().click();
    await page.waitForTimeout(500);

    // Verify values are set
    let config = await page.evaluate(() => ({
      upfront: window.CONFIG.UPFRONT_RENDERING_ENABLED,
      fallback: window.CONFIG.FALLBACK_RENDERING_ENABLED,
      resolution: window.CONFIG.RESOLUTION_MODE
    }));
    console.log('Before refresh:', config);
    expect(config.upfront).toBe(false);
    expect(config.fallback).toBe(false);
    expect(config.resolution).toBe('high');

    // Refresh the page
    await page.reload();

    // Wait for PDF to load again
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 15000 }
    );
    await page.waitForTimeout(2000);

    // Verify values persisted
    config = await page.evaluate(() => ({
      upfront: window.CONFIG.UPFRONT_RENDERING_ENABLED,
      fallback: window.CONFIG.FALLBACK_RENDERING_ENABLED,
      resolution: window.CONFIG.RESOLUTION_MODE
    }));
    console.log('After refresh:', config);
    expect(config.upfront).toBe(false);
    expect(config.fallback).toBe(false);
    expect(config.resolution).toBe('high');

    console.log('✓ Settings persist across page refreshes');
  });

  test('Console logging should occur when toggles are changed', async ({ page }) => {
    const consoleMessages = [];

    // Capture console messages
    page.on('console', msg => {
      if (msg.text().includes('[PerformanceToggle]')) {
        consoleMessages.push(msg.text());
      }
    });

    // Toggle upfront
    await page.locator('button:has-text("Upfront")').click();
    await page.waitForTimeout(200);

    // Toggle fallback
    await page.locator('button:has-text("Fallback")').click();
    await page.waitForTimeout(200);

    // Change resolution mode
    await page.locator('button:has-text("High")').last().click();
    await page.waitForTimeout(200);

    console.log('Console messages:', consoleMessages);

    // Verify we got console messages for all three changes
    const hasUpfrontMessage = consoleMessages.some(msg => msg.includes('Upfront rendering'));
    const hasFallbackMessage = consoleMessages.some(msg => msg.includes('Fallback rendering'));
    const hasResolutionMessage = consoleMessages.some(msg => msg.includes('Resolution mode'));

    expect(hasUpfrontMessage).toBe(true);
    expect(hasFallbackMessage).toBe(true);
    expect(hasResolutionMessage).toBe(true);

    console.log('✓ Console logging occurs when toggles are changed');
  });

  test('Resolution mode should affect PDF loading phases', async ({ page }) => {
    // Clear localStorage and set to 'high' only mode
    await page.evaluate(() => {
      localStorage.setItem('pdfgrid_resolution_mode', 'high');
      localStorage.setItem('pdfgrid_upfront_rendering', 'false');
    });

    const consoleMessages = [];

    // Capture console messages
    page.on('console', msg => {
      if (msg.text().includes('[Resolution Mode]')) {
        consoleMessages.push(msg.text());
      }
    });

    // Reload page to trigger new PDF load
    await page.goto('http://localhost:8000?pdf=demo-1.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 15000 }
    );

    console.log('Resolution mode console messages:', consoleMessages);

    // Verify we got messages about skipping low-res phase
    const hasConfiguredMessage = consoleMessages.some(msg => msg.includes('Configured for: high'));
    const hasSkipPhase2Message = consoleMessages.some(msg => msg.includes('Skipping Phase 2 (low-res)'));

    expect(hasConfiguredMessage).toBe(true);
    expect(hasSkipPhase2Message).toBe(true);

    console.log('✓ Resolution mode affects PDF loading phases');
  });

  test('Upfront toggle should affect Phase 3 rendering', async ({ page }) => {
    // Clear localStorage and set upfront to false
    await page.evaluate(() => {
      localStorage.setItem('pdfgrid_upfront_rendering', 'false');
    });

    const consoleMessages = [];

    // Capture console messages
    page.on('console', msg => {
      if (msg.text().includes('[Upfront Rendering]')) {
        consoleMessages.push(msg.text());
      }
    });

    // Reload page to trigger new PDF load
    await page.goto('http://localhost:8000?pdf=demo-1.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 15000 }
    );

    console.log('Upfront rendering console messages:', consoleMessages);

    // Verify we got message about skipping Phase 3
    const hasDisabledMessage = consoleMessages.some(msg => msg.includes('DISABLED - Skipping Phase 3'));

    expect(hasDisabledMessage).toBe(true);

    console.log('✓ Upfront toggle affects Phase 3 rendering');
  });

});
