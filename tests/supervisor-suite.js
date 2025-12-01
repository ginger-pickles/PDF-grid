/**
 * Supervisor Test Suite
 *
 * Reusable test functions for testing supervisor.html against SETPOINT requirements.
 * Can be used to test any version (A, B, C) of supervisor.html.
 */

const fs = require('fs').promises;
const path = require('path');

/**
 * Test a version of supervisor.html and collect metrics
 * @param {Page} page - Playwright page object
 * @param {string} versionFile - Filename of version to test (e.g., 'supervisor.html')
 * @param {string} versionLabel - Version label (A, B, or C)
 * @param {string} outputDir - Directory to save screenshots/artifacts
 * @returns {Object} Metrics object with test results
 */
async function testSupervisorVersion(page, versionFile, versionLabel, outputDir) {
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
    log(`Navigating to ${versionFile}`);
    const loadStartTime = Date.now();
    await page.goto(`http://localhost:8000/${versionFile}`);
    await page.waitForLoadState('domcontentloaded');
    await page.waitForTimeout(2000); // Allow async operations
    const loadTime = Date.now() - loadStartTime;
    metrics['Load Time (ms)'] = loadTime;
    log(`Loaded in ${loadTime}ms`);

    // Console errors
    metrics['Console Errors'] = consoleErrors.length;

    // UI Elements - Section Cards
    const sectionCount = await page.locator('.section-card').count();
    metrics['Section Cards Rendered'] = sectionCount;
    log(`Found ${sectionCount} section cards`);

    // SETPOINT Display
    const setpointVisible = await page.locator('#setpointDisplay').isVisible();
    metrics['Setpoint Displayed'] = setpointVisible ? 1 : 0;
    log(`Setpoint display visible: ${setpointVisible}`);

    // Dark UI Check
    const bgColor = await page.evaluate(() => {
        return window.getComputedStyle(document.body).backgroundColor;
    });
    const isDarkUI = bgColor.includes('rgb(17, 24, 39)') || bgColor.includes('rgb(31, 41, 55)');
    metrics['Dark UI'] = isDarkUI ? 1 : 0;
    log(`Dark UI: ${isDarkUI}, bg-color: ${bgColor}`);

    // Desktop Screenshot
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.waitForTimeout(500);
    const desktopScreenshotPath = path.join(outputDir, 'screenshot-loaded.png');
    await page.screenshot({
        path: desktopScreenshotPath,
        fullPage: true
    });
    log(`Desktop screenshot saved: ${desktopScreenshotPath}`);

    // Mobile Responsive Test
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(500);
    const mobileVisible = await page.locator('.section-card').first().isVisible();
    metrics['Mobile Responsive'] = mobileVisible ? 1 : 0;
    log(`Mobile responsive: ${mobileVisible}`);

    // Mobile Screenshot
    const mobileScreenshotPath = path.join(outputDir, 'screenshot-mobile.png');
    await page.screenshot({
        path: mobileScreenshotPath,
        fullPage: true
    });
    log(`Mobile screenshot saved: ${mobileScreenshotPath}`);

    // Restore viewport
    await page.setViewportSize({ width: 1920, height: 1080 });

    // File Picker Functionality - check within setpoint editor section
    const loadButtonVisible = await page.locator('#setpointEditor button:has-text("📂 Load")').isVisible();
    const saveButtonVisible = await page.locator('#setpointEditor button', { hasText: '💾 Save' }).filter({ hasNotText: 'Save As' }).isVisible();
    const saveAsButtonVisible = await page.locator('#setpointEditor button:has-text("💾 Save As")').isVisible();
    const filePickerFunctional = loadButtonVisible && saveButtonVisible && saveAsButtonVisible;
    metrics['File Picker Functional'] = filePickerFunctional ? 1 : 0;
    log(`File picker buttons: Load=${loadButtonVisible}, Save=${saveButtonVisible}, SaveAs=${saveAsButtonVisible}`);

    // Screenshot Gallery (check mechanism exists)
    const galleryExists = await page.locator('#screenshotsSection').isVisible();
    metrics['Screenshot Gallery Present'] = galleryExists ? 1 : 0;
    log(`Screenshot gallery present: ${galleryExists}`);

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
    testSupervisorVersion,
    countLinesOfCode
};
