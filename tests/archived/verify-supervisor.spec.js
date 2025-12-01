const { test, expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

/**
 * Recursive Feedback Control Test for supervisor.html
 *
 * Tests supervisor.html itself and generates metrics for supervisor to analyze.
 * This creates the recursive loop: supervisor tests supervisor.
 */

test.describe('Supervisor recursive feedback control', () => {
    const sessionDir = path.join(__dirname, '../test-results/supervisor');
    const startTime = Date.now();
    const testLog = [];
    let videoPath = null;

    function log(message) {
        const entry = {
            timestamp: new Date().toISOString(),
            message
        };
        testLog.push(entry);
        console.log(`[Supervisor Test] ${message}`);
    }

    test.beforeAll(async () => {
        // Ensure session directory exists
        await fs.mkdir(sessionDir, { recursive: true });
        log('Session directory prepared');
    });

    test('Test supervisor.html against SETPOINT requirements', async ({ page }, testInfo) => {
        const loadStartTime = Date.now();
        log('Navigating to supervisor.html');

        // Capture console errors
        const consoleErrors = [];
        page.on('console', msg => {
            if (msg.type() === 'error') {
                consoleErrors.push({
                    type: 'error',
                    message: msg.text(),
                    timestamp: new Date().toISOString()
                });
                console.error('[Browser Error]', msg.text());
            }
        });

        // Navigate to supervisor
        await page.goto('http://localhost:8000/supervisor.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(2000); // Allow async operations to complete

        const loadEndTime = Date.now();
        const loadTime = loadEndTime - loadStartTime;
        log(`Supervisor loaded in ${loadTime}ms`);

        // Take screenshot before checking metrics
        await page.screenshot({
            path: path.join(sessionDir, 'screenshot-supervisor-loaded.png'),
            fullPage: true
        });
        log('Screenshot captured: supervisor loaded');

        // Check that supervisor rendered correctly
        const sectionCount = await page.locator('.section-card').count();
        log(`Found ${sectionCount} section-card elements`);

        // Check if SETPOINT is displayed
        const setpointVisible = await page.locator('#setpointDisplay').isVisible();
        log(`Setpoint display visible: ${setpointVisible}`);

        // Check responsive design (test narrow viewport)
        await page.setViewportSize({ width: 375, height: 667 }); // Mobile size
        await page.waitForTimeout(500);

        await page.screenshot({
            path: path.join(sessionDir, 'screenshot-supervisor-mobile.png'),
            fullPage: true
        });
        log('Screenshot captured: mobile view');

        // Check if UI is still functional at narrow width
        const mobileVisible = await page.locator('.section-card').first().isVisible();
        log(`Mobile responsive: ${mobileVisible}`);

        // Restore viewport
        await page.setViewportSize({ width: 1920, height: 1080 });

        // Count lines of code in supervisor.html
        const supervisorPath = path.join(__dirname, '../supervisor.html');
        const supervisorContent = await fs.readFile(supervisorPath, 'utf-8');
        const linesOfCode = supervisorContent.split('\n').length;
        log(`Lines of code in supervisor.html: ${linesOfCode}`);

        // Check for dark UI (should have dark background)
        const bgColor = await page.evaluate(() => {
            return window.getComputedStyle(document.body).backgroundColor;
        });
        const isDarkUI = bgColor.includes('rgb(17, 24, 39)') || bgColor.includes('rgb(31, 41, 55)'); // gray-900 or gray-800
        log(`Dark UI detected: ${isDarkUI}, bg-color: ${bgColor}`);

        // Test screenshot gallery displays screenshots
        const screenshotImages = await page.locator('#screenshotsSection img').count();
        const screenshotsDisplayed = screenshotImages > 0;
        log(`Screenshot gallery displays ${screenshotImages} screenshots`);

        // Test file picker buttons are present
        const loadButtonVisible = await page.locator('button:has-text("📂 Load")').isVisible();
        const saveButtonVisible = await page.locator('button:has-text("💾 Save"):not(:has-text("Save As"))').isVisible();
        const saveAsButtonVisible = await page.locator('button:has-text("💾 Save As")').isVisible();
        const filePickerFunctional = loadButtonVisible && saveButtonVisible && saveAsButtonVisible;
        log(`File picker buttons present: Load=${loadButtonVisible}, Save=${saveButtonVisible}, SaveAs=${saveAsButtonVisible}`);

        // Prepare metrics for supervisor to analyze
        // Using single version format since we're testing one version
        const metrics = {
            versionA: {
                'Lines of Code': linesOfCode,
                'Load Time (ms)': loadTime,
                'Console Errors': consoleErrors.length,
                'Section Cards Rendered': sectionCount,
                'Dark UI': isDarkUI ? 1 : 0,
                'Mobile Responsive': mobileVisible ? 1 : 0,
                'Setpoint Displayed': setpointVisible ? 1 : 0,
                'Screenshots Displayed': screenshotsDisplayed ? 1 : 0,
                'File Picker Buttons': filePickerFunctional ? 1 : 0
            },
            versionB: null,
            versionC: null
        };

        log(`Metrics collected: ${JSON.stringify(metrics.versionA)}`);

        // Determine test status
        const hasErrors = consoleErrors.length > 0;
        const locExceeded = linesOfCode >= 1050;
        const loadTooSlow = loadTime > 15000;
        const loadWarning = loadTime > 8000;

        let status = 'passed';
        if (hasErrors || loadTooSlow) {
            status = 'failed';
        } else if (locExceeded || loadWarning) {
            status = 'warning';
        }

        log(`Test status: ${status}`);
        if (hasErrors) log(`⚠️  Console errors detected: ${consoleErrors.length}`);
        if (locExceeded) log(`⚠️  Lines of code (${linesOfCode}) exceeds limit (<1050)`);
        if (loadTooSlow) log(`⚠️  Load time (${loadTime}ms) exceeds max 15000ms`);
        if (loadWarning) log(`⚠️  Load time (${loadTime}ms) exceeds warning 8000ms`);

        // Save metrics to JSON
        const metricsPath = path.join(sessionDir, 'metrics.json');
        await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
        log(`Metrics saved to ${metricsPath}`);

        // Save console logs
        const logsPath = path.join(sessionDir, 'console-logs.json');
        await fs.writeFile(logsPath, JSON.stringify(consoleErrors, null, 2));
        log(`Console logs saved to ${logsPath}`);

        // Save session metadata
        const duration = Date.now() - startTime;
        const metadata = {
            timestamp: new Date(startTime).toISOString(),
            duration_ms: duration,
            status: status,
            test_subject: 'supervisor.html',
            action: 'load_and_verify',
            lines_of_code: linesOfCode,
            load_time_ms: loadTime,
            console_errors: consoleErrors.length,
            sections_rendered: sectionCount,
            dark_ui: isDarkUI,
            mobile_responsive: mobileVisible,
            setpoint_displayed: setpointVisible,
            log: testLog
        };

        const metadataPath = path.join(sessionDir, 'session-metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        log(`Session metadata saved to ${metadataPath}`);

        // Assert key requirements
        expect(sectionCount).toBeGreaterThan(0);
        expect(setpointVisible).toBeTruthy();
        log('✅ Test completed successfully');

        // Capture video path for copying in afterAll
        videoPath = await page.video()?.path();
        if (videoPath) {
            log(`Video recorded at: ${videoPath}`);
        }
    });

    test.afterAll(async () => {
        const duration = Date.now() - startTime;
        log(`Total test duration: ${(duration / 1000).toFixed(2)}s`);

        // Copy video to expected location
        if (videoPath) {
            try {
                const targetPath = path.join(sessionDir, 'video.webm');
                await fs.copyFile(videoPath, targetPath);
                log(`Video copied to ${targetPath}`);
            } catch (error) {
                console.error('Failed to copy video:', error);
            }
        }

        log('Recursive feedback data ready for supervisor.html to analyze');
    });
});

// Configuration
test.use({
    video: 'on',
    trace: 'on',
    screenshot: 'on',
    viewport: { width: 1920, height: 1080 }
});

test.setTimeout(60000); // 1 minute
