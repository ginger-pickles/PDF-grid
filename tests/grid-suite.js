/**
 * Grid Test Suite
 *
 * Reusable test functions for testing index.html (PDF Grid Viewer) against requirements.
 * Can be used to test any version (A, B, C) of index.html.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Test a version of index.html and collect metrics
 * @param {Page} page - Playwright page object
 * @param {string} versionFile - Filename of version to test (e.g., 'index.html')
 * @param {string} versionLabel - Version label (A, B, or C)
 * @param {string} outputDir - Directory to save screenshots/artifacts
 * @returns {Object} Metrics object with test results
 */
async function testGridVersion(page, versionFile, versionLabel, outputDir) {
    const metrics = {};
    const consoleErrors = [];
    const testLog = [];

    function log(message) {
        const entry = {
            timestamp: new Date().toISOString(),
            message
        };
        testLog.push(entry);
        console.log(`[Version ${versionLabel}] ${message}`);
    }

    // Setup console error tracking
    page.on('console', msg => {
        if (msg.type() === 'error') {
            consoleErrors.push({
                type: 'error',
                message: msg.text(),
                timestamp: new Date().toISOString()
            });
            console.error(`[Version ${versionLabel} Error]`, msg.text());
        }
    });

    // Navigation and load timing
    log(`Navigating to ${versionFile}?pdf=demo/demo-1.pdf`);
    const loadStartTime = Date.now();
    await page.goto(`http://localhost:8000/${versionFile}?pdf=demo/demo-1.pdf`);

    // Wait for viewer to be ready
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(2000); // Allow async operations
    const loadTime = Date.now() - loadStartTime;
    metrics['Load Time (ms)'] = loadTime;
    log(`Loaded in ${loadTime}ms`);

    // Console errors
    metrics['Console Errors'] = consoleErrors.length;

    // Get cache diagnostics
    const cacheStats = await page.evaluate(() => {
        return window.__PDFGridDiagnostics?.getCacheStats() || {};
    });

    metrics['Pages Cached'] = cacheStats.pages?.total || 0;
    metrics['Tiles Cached'] = cacheStats.tiles || 0;
    log(`Cache: ${metrics['Pages Cached']} pages, ${metrics['Tiles Cached']} tiles`);

    // Desktop Screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const desktopScreenshotPath = path.join(outputDir, 'screenshot-desktop.png');
    await page.screenshot({
        path: desktopScreenshotPath,
        fullPage: true
    });
    log(`Desktop screenshot saved: ${desktopScreenshotPath}`);

    // Test zoom functionality
    const initialZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    await page.evaluate(() => window.viewer.viewport.zoomBy(2.0));
    await page.waitForTimeout(500);
    const zoomedZoom = await page.evaluate(() => window.viewer.viewport.getZoom());
    metrics['Zoom Functional'] = (zoomedZoom > initialZoom * 1.5) ? 1 : 0;
    log(`Zoom test: initial=${initialZoom.toFixed(3)}, zoomed=${zoomedZoom.toFixed(3)}, functional=${metrics['Zoom Functional']}`);

    // Reset zoom
    await page.evaluate(() => window.viewer.viewport.goHome());
    await page.waitForTimeout(500);

    // Test pan functionality
    const initialCenter = await page.evaluate(() => {
        const center = window.viewer.viewport.getCenter();
        return { x: center.x, y: center.y };
    });
    await page.evaluate(() => {
        const newPoint = new OpenSeadragon.Point(0.5, 0.5);
        window.viewer.viewport.panTo(newPoint);
    });
    await page.waitForTimeout(500);
    const pannedCenter = await page.evaluate(() => {
        const center = window.viewer.viewport.getCenter();
        return { x: center.x, y: center.y };
    });
    const panWorked = Math.abs(pannedCenter.x - 0.5) < 0.1 && Math.abs(pannedCenter.y - 0.5) < 0.1;
    metrics['Pan Functional'] = panWorked ? 1 : 0;
    log(`Pan test: target=(0.5, 0.5), actual=(${pannedCenter.x.toFixed(3)}, ${pannedCenter.y.toFixed(3)}), functional=${metrics['Pan Functional']}`);

    // Test help panel
    const helpButton = page.locator('button:has-text("HELP")').or(page.locator('button[title*="help" i]'));
    await helpButton.click();
    await page.waitForTimeout(300);
    const helpVisible = await page.locator('.help-panel').isVisible().catch(() => false);
    metrics['Help Panel Functional'] = helpVisible ? 1 : 0;
    log(`Help panel: ${helpVisible ? 'visible' : 'not visible'}`);

    // Close help panel
    if (helpVisible) {
        const closeButton = page.locator('button').filter({ hasText: '×' }).first();
        await closeButton.click();
        await page.waitForTimeout(300);
    }

    // Test debug panel (with ?debug parameter)
    await page.goto(`http://localhost:8000/${versionFile}?pdf=demo/demo-1.pdf&debug`);
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 30000 });
    await page.waitForTimeout(1000);
    const debugVisible = await page.locator('text=Debug Panel').isVisible().catch(() => false);
    metrics['Debug Panel Opens'] = debugVisible ? 1 : 0;
    log(`Debug panel: ${debugVisible ? 'opened' : 'not opened'}`);

    // Mobile Responsive Test
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const viewerVisibleMobile = await page.locator('#openseadragon').isVisible();
    metrics['Mobile Responsive'] = viewerVisibleMobile ? 1 : 0;
    log(`Mobile responsive: ${viewerVisibleMobile}`);

    // Mobile Screenshot
    const mobileScreenshotPath = path.join(outputDir, 'screenshot-mobile.png');
    await page.screenshot({
        path: mobileScreenshotPath,
        fullPage: true
    });
    log(`Mobile screenshot saved: ${mobileScreenshotPath}`);

    // Restore viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    log('✅ Test completed');

    return {
        metrics,
        consoleErrors,
        testLog
    };
}

/**
 * Count lines of code in a file
 * @param {string} filePath - Path to file
 * @returns {number} Line count
 */
async function countLinesOfCode(filePath) {
    const content = await fs.readFile(filePath, 'utf-8');
    return content.split('\n').length;
}

module.exports = {
    testGridVersion,
    countLinesOfCode
};
