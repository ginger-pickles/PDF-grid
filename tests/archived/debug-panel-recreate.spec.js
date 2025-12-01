/**
 * Debug Panel Tests - TiledImage Recreation
 *
 * Tests that the debug panel's Recreate button properly recreates the TiledImage,
 * verifying that the viewer goes through the expected recreation cycle.
 */

const { test, expect } = require('@playwright/test');

test.describe('Debug Panel - Recreate Button', () => {

  test.beforeEach(async ({ page }) => {
    // Navigate to app with demo PDF
    await page.goto('http://localhost:8000?pdf=demo/demo-3.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.__PDFGridDiagnostics !== undefined && window.viewer !== undefined,
      { timeout: 10000 }
    );

    // Wait for initial rendering
    await page.waitForTimeout(3000);
  });

  test('Recreate button should trigger TiledImage recreation', async ({ page }) => {
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

    // Get the initial TiledImage reference
    const initialTiledImageId = await page.evaluate(() => {
      const tiledImage = window.viewer.world.getItemAt(0);
      return tiledImage ? tiledImage._id : null;
    });

    console.log('Initial TiledImage ID:', initialTiledImageId);
    expect(initialTiledImageId).not.toBeNull();

    // Set up console message listener to capture debug output
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.text().includes('[Debug]')) {
        consoleMessages.push(msg.text());
      }
    });

    // Click the Recreate button
    await page.click('button:has-text("Recreate")');

    // Wait for recreation to complete
    await page.waitForTimeout(1000);

    // Check console messages
    console.log('Console messages:', consoleMessages);

    // Verify expected console messages appeared
    const hasClickedMessage = consoleMessages.some(msg => msg.includes('Recreate button clicked'));
    const hasStartMessage = consoleMessages.some(msg => msg.includes('Starting TiledImage recreation'));
    const hasClearedMessage = consoleMessages.some(msg => msg.includes('Tile cache cleared'));
    const hasRemovedMessage = consoleMessages.some(msg => msg.includes('Old TiledImage removed'));
    const hasCompleteMessage = consoleMessages.some(msg => msg.includes('TiledImage recreation complete'));

    expect(hasClickedMessage).toBe(true);
    expect(hasStartMessage).toBe(true);
    expect(hasClearedMessage).toBe(true);
    expect(hasRemovedMessage).toBe(true);
    expect(hasCompleteMessage).toBe(true);

    // Get the new TiledImage reference
    const newTiledImageId = await page.evaluate(() => {
      const tiledImage = window.viewer.world.getItemAt(0);
      return tiledImage ? tiledImage._id : null;
    });

    console.log('New TiledImage ID:', newTiledImageId);
    expect(newTiledImageId).not.toBeNull();

    // Verify the TiledImage was actually recreated (different ID)
    expect(newTiledImageId).not.toBe(initialTiledImageId);

    console.log('✓ TiledImage was successfully recreated');
  });

  test('Recreate button should preserve viewport position', async ({ page }) => {
    // Open debug panel
    await page.click('button[title="Help"]');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Show Debug")');
    await page.waitForTimeout(500);

    // Zoom and pan to a specific position
    await page.evaluate(() => {
      window.viewer.viewport.zoomTo(2.0);
      window.viewer.viewport.panTo(new OpenSeadragon.Point(0.5, 0.5));
    });
    await page.waitForTimeout(500);

    // Get current viewport state
    const beforeState = await page.evaluate(() => {
      return {
        zoom: window.viewer.viewport.getZoom(),
        center: {
          x: window.viewer.viewport.getCenter().x,
          y: window.viewer.viewport.getCenter().y
        }
      };
    });

    console.log('Before recreation:', beforeState);

    // Click Recreate button
    await page.click('button:has-text("Recreate")');
    await page.waitForTimeout(1000);

    // Get viewport state after recreation
    const afterState = await page.evaluate(() => {
      return {
        zoom: window.viewer.viewport.getZoom(),
        center: {
          x: window.viewer.viewport.getCenter().x,
          y: window.viewer.viewport.getCenter().y
        }
      };
    });

    console.log('After recreation:', afterState);

    // Verify zoom and center are preserved (with small tolerance for floating point)
    expect(Math.abs(afterState.zoom - beforeState.zoom)).toBeLessThan(0.01);
    expect(Math.abs(afterState.center.x - beforeState.center.x)).toBeLessThan(0.01);
    expect(Math.abs(afterState.center.y - beforeState.center.y)).toBeLessThan(0.01);

    console.log('✓ Viewport position preserved after recreation');
  });

  test('Refresh button should trigger forceRedraw', async ({ page }) => {
    // Open debug panel
    await page.click('button[title="Help"]');
    await page.waitForTimeout(500);
    await page.click('button:has-text("Show Debug")');
    await page.waitForTimeout(500);

    // Set up console message listener
    const consoleMessages = [];
    page.on('console', msg => {
      if (msg.text().includes('[Debug]')) {
        consoleMessages.push(msg.text());
      }
    });

    // Click the Refresh button
    await page.click('button:has-text("Refresh")');
    await page.waitForTimeout(500);

    // Check that forceRedraw was called
    const hasRefreshMessage = consoleMessages.some(msg => msg.includes('Forcing tile redraw'));
    expect(hasRefreshMessage).toBe(true);

    console.log('✓ Refresh button triggered forceRedraw');
  });

});
