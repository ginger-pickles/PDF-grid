const { test, expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');

/**
 * Agent Test: Operates tester.html to perform A/B/C comparison
 *
 * This test simulates an agent operating the tester.html interface
 * exactly as a human would, then extracts and saves the results.
 */

test.describe('Agent operates tester.html', () => {
    const sessionDir = path.join(__dirname, 'latest-session');
    const startTime = Date.now();
    const testLog = [];

    function log(message) {
        const entry = {
            timestamp: new Date().toISOString(),
            message
        };
        testLog.push(entry);
        console.log(`[Agent] ${message}`);
    }

    test.beforeAll(async () => {
        // Ensure session directory exists
        await fs.mkdir(sessionDir, { recursive: true });
        log('Session directory prepared');
    });

    test('Agent performs A/B/C comparison via tester.html', async ({ page }) => {
        log('Navigating to tester.html');

        // Navigate to tester
        await page.goto('http://localhost:8000/tester.html');

        // Wait for tester interface to be ready (not networkidle - iframes load PDFs indefinitely)
        await page.waitForSelector('#pdfSelect', { state: 'visible' });
        await page.waitForSelector('#actionSelect', { state: 'visible' });
        await page.waitForTimeout(2000); // Allow iframes to start loading

        log('Tester interface loaded');

        // Configure test parameters (operating UI like a human would)
        log('Selecting test PDF: demo/demo-1.pdf');
        await page.selectOption('#pdfSelect', 'demo/demo-1.pdf');

        log('Selecting test action: load');
        await page.selectOption('#actionSelect', 'load');

        log('Enabling synchronized testing across all versions');
        await page.check('#syncActions');

        // Take screenshot before execution
        await page.screenshot({
            path: path.join(sessionDir, 'screenshot-before-test.png'),
            fullPage: true
        });
        log('Screenshot captured: before test execution');

        // Execute the test action
        log('Executing test action (load PDF)');
        await page.click('button:has-text("Execute Test")');

        // Wait for action to complete
        log('Waiting for PDF load to complete across all versions...');
        await page.waitForTimeout(5000); // Allow time for PDF loading

        // Take screenshot after execution
        await page.screenshot({
            path: path.join(sessionDir, 'screenshot-after-load.png'),
            fullPage: true
        });
        log('Screenshot captured: after PDF load');

        // Collect metrics (operating UI like a human would)
        log('Collecting metrics from all versions');
        await page.click('button:has-text("Collect Metrics")');
        await page.waitForTimeout(2000); // Allow time for metrics collection

        // Take screenshot of metrics
        await page.screenshot({
            path: path.join(sessionDir, 'screenshot-metrics.png'),
            fullPage: true
        });
        log('Screenshot captured: metrics collected');

        // Extract metrics from the DOM (same as human sees)
        log('Extracting metrics from visible table');
        const metrics = await page.evaluate(() => {
            const table = document.querySelector('#metricsTable tbody');
            if (!table) return null;

            const rows = Array.from(table.querySelectorAll('tr'));

            const versionA = {};
            const versionC = {};

            rows.forEach(row => {
                const cells = row.querySelectorAll('td');
                if (cells.length < 4) return;

                const metric = cells[0].textContent.trim();
                const valueA = cells[1].textContent.trim();
                const valueC = cells[2].textContent.trim();
                const status = cells[3].textContent.trim();

                // Parse numeric values
                const parseValue = (val) => {
                    if (val === 'N/A' || val === '-') return null;
                    const num = parseFloat(val);
                    return isNaN(num) ? null : num;
                };

                versionA[metric] = parseValue(valueA);
                versionC[metric] = parseValue(valueC);
            });

            return { versionA, versionC };
        });

        log(`Metrics extracted: ${Object.keys(metrics?.versionA || {}).length} metrics per version`);

        // Check for regressions (analyze like human would)
        log('Analyzing for regressions...');
        const hasRegressions = await page.evaluate(() => {
            const statusCells = document.querySelectorAll('#metricsTable tbody tr td:nth-child(4)');
            return Array.from(statusCells).some(cell =>
                cell.textContent.includes('worse')
            );
        });

        if (hasRegressions) {
            log('⚠️  REGRESSIONS DETECTED');
        } else {
            log('✅ NO REGRESSIONS - Safe to proceed');
        }

        // Extract console logs from tester
        log('Extracting console output from test versions');
        const consoleLogs = await page.evaluate(() => {
            const logs = document.querySelectorAll('.console-output .console-entry');
            return Array.from(logs).map(log => ({
                version: log.dataset.version,
                type: log.classList.contains('console-error') ? 'error' :
                      log.classList.contains('console-warn') ? 'warn' : 'log',
                message: log.textContent.trim()
            }));
        });

        log(`Captured ${consoleLogs.length} console messages`);

        // Count errors per version
        const errorsA = consoleLogs.filter(l => l.version === 'a' && l.type === 'error').length;
        const errorsC = consoleLogs.filter(l => l.version === 'c' && l.type === 'error').length;

        log(`Console errors - Version A: ${errorsA}, Version C: ${errorsC}`);

        // Add error counts to metrics
        if (metrics) {
            metrics.versionA.consoleErrors = errorsA;
            metrics.versionC.consoleErrors = errorsC;
        }

        // Save metrics to JSON
        const metricsPath = path.join(sessionDir, 'metrics.json');
        await fs.writeFile(metricsPath, JSON.stringify(metrics, null, 2));
        log(`Metrics saved to ${metricsPath}`);

        // Save console logs
        const logsPath = path.join(sessionDir, 'console-logs.json');
        await fs.writeFile(logsPath, JSON.stringify(consoleLogs, null, 2));
        log(`Console logs saved to ${logsPath}`);

        // Determine test status
        const testStatus = hasRegressions ? 'warning' : 'passed';
        log(`Test status: ${testStatus}`);

        // Save session metadata
        const duration = Date.now() - startTime;
        const metadata = {
            timestamp: new Date(startTime).toISOString(),
            duration_ms: duration,
            status: testStatus,
            test_pdf: 'demo/demo-1.pdf',
            action: 'load',
            regressions_detected: hasRegressions,
            log: testLog
        };

        const metadataPath = path.join(sessionDir, 'session-metadata.json');
        await fs.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
        log(`Session metadata saved to ${metadataPath}`);

        // Assert test passed (even with warnings, the test itself succeeded)
        expect(metrics).not.toBeNull();
        log('Test completed successfully');
    });

    test.afterAll(async () => {
        const duration = Date.now() - startTime;
        log(`Total session duration: ${(duration / 1000).toFixed(2)}s`);
        log('Agent session complete - results available in tests/feedback-control/latest-session/');
    });
});

/**
 * Playwright Configuration for this test
 *
 * This test is configured to record video and trace automatically.
 * See playwright.config.js for settings, or override here:
 */
test.use({
    // Record video of agent session
    video: 'on',

    // Record full trace for detailed analysis
    trace: 'on',

    // Take screenshots at key moments
    screenshot: 'on',

    // Slower actions for better video visibility
    actionTimeout: 10000
});

// Set longer timeout for this test (loading 3 PDFs in iframes takes time)
test.setTimeout(120000); // 2 minutes
