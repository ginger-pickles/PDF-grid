/**
 * TESTER Framework
 *
 * Tests 3 versions of supervisor.html (A=current, B=checkpoint, C=baseline)
 * Generates comparative test results for SUPERVISOR to analyze.
 *
 * Outputs:
 *   - test-results/tester/version-{A,B,C}/* (per-version raw results)
 *   - test-results/supervisor/* (amalgamated comparison data)
 */

const { test, expect } = require('@playwright/test');
const fs = require('fs').promises;
const path = require('path');
const { testSupervisorVersion, countLinesOfCode } = require('./supervisor-suite');

// Version configuration
const VERSIONS = {
    A: {
        file: 'supervisor.html',
        label: 'Current',
        description: 'Current working version'
    },
    B: {
        file: 'supervisor-checkpoint.html',
        label: 'Checkpoint',
        description: 'Last known good version'
    },
    C: {
        file: 'supervisor-baseline.html',
        label: 'Baseline',
        description: 'Stable reference version'
    }
};

// Output directory (TESTER only outputs to its own directory)
const TESTER_DIR = path.join(__dirname, '../test-results/tester');

// Shared state for collecting all version results
const allResults = {
    versionA: {},
    versionB: {},
    versionC: {}
};

test.describe('TESTER: Multi-version comparative testing', () => {
    const sessionStartTime = Date.now();

    test.beforeAll(async () => {
        // Create output directory
        await fs.mkdir(TESTER_DIR, { recursive: true });

        // Create version subdirectories
        for (const [key, _] of Object.entries(VERSIONS)) {
            const versionDir = path.join(TESTER_DIR, `version-${key}`);
            await fs.mkdir(versionDir, { recursive: true });
        }

        console.log('🧪 TESTER Framework initialized');
        console.log(`   Output: ${TESTER_DIR}`);
        console.log(`   SUPERVISOR will read from this directory`);
    });

    // Test each version
    for (const [versionKey, versionInfo] of Object.entries(VERSIONS)) {
        test(`Version ${versionKey}: ${versionInfo.label}`, async ({ page, browser }, testInfo) => {
            console.log(`\n${'='.repeat(60)}`);
            console.log(`Testing Version ${versionKey}: ${versionInfo.label}`);
            console.log(`File: ${versionInfo.file}`);
            console.log(`${'='.repeat(60)}\n`);

            const versionDir = path.join(TESTER_DIR, `version-${versionKey}`);

            // Count lines of code
            const filePath = path.join(__dirname, `../${versionInfo.file}`);
            const loc = await countLinesOfCode(filePath);
            console.log(`[Version ${versionKey}] Lines of Code: ${loc}`);

            // Run test suite
            const result = await testSupervisorVersion(
                page,
                versionInfo.file,
                versionKey,
                versionDir
            );

            // Add LOC to metrics
            result.metrics['Lines of Code'] = loc;

            // Save per-version results to tester directory
            await fs.writeFile(
                path.join(versionDir, 'metrics.json'),
                JSON.stringify(result.metrics, null, 2)
            );

            await fs.writeFile(
                path.join(versionDir, 'console-logs.json'),
                JSON.stringify(result.consoleErrors, null, 2)
            );

            await fs.writeFile(
                path.join(versionDir, 'test-log.json'),
                JSON.stringify(result.testLog, null, 2)
            );

            // Copy video to version directory
            const videoPath = await page.video()?.path();
            if (videoPath) {
                await page.context().close(); // Ensure video is saved
                const targetVideoPath = path.join(versionDir, 'video.webm');
                // Video might not be ready immediately, wait a bit
                await new Promise(resolve => setTimeout(resolve, 1000));
                try {
                    await fs.copyFile(videoPath, targetVideoPath);
                    console.log(`[Version ${versionKey}] Video saved: ${targetVideoPath}`);
                } catch (error) {
                    console.warn(`[Version ${versionKey}] Could not copy video:`, error.message);
                }
            }

            // Store in shared results for amalgamation
            allResults[`version${versionKey}`] = result.metrics;

            console.log(`[Version ${versionKey}] ✅ Testing complete\n`);
        });
    }

    test.afterAll(async () => {
        console.log('\n' + '='.repeat(60));
        console.log('GENERATING TESTER SUMMARY');
        console.log('='.repeat(60) + '\n');

        const sessionDuration = Date.now() - sessionStartTime;

        // Generate session summary in tester directory
        const sessionSummary = {
            timestamp: new Date(sessionStartTime).toISOString(),
            duration_ms: sessionDuration,
            test_subject: 'supervisor.html',
            versions_tested: VERSIONS,
            tester_version: '1.0.0',
            metrics: {
                versionA: allResults.versionA,
                versionB: allResults.versionB,
                versionC: allResults.versionC
            }
        };

        await fs.writeFile(
            path.join(TESTER_DIR, 'session-summary.json'),
            JSON.stringify(sessionSummary, null, 2)
        );
        console.log(`✅ Saved: ${TESTER_DIR}/session-summary.json`);

        console.log('\n' + '='.repeat(60));
        console.log('TESTER COMPLETE');
        console.log('='.repeat(60));
        console.log(`\nResults directory: ${TESTER_DIR}/`);
        console.log(`  - version-A/`);
        console.log(`  - version-B/`);
        console.log(`  - version-C/`);
        console.log(`  - session-summary.json`);
        console.log(`\nNext: Open http://localhost:8000/supervisor.html`);
        console.log(`      SUPERVISOR will read from ${TESTER_DIR}/ and perform analysis\n`);
    });
});

// Configure Playwright
test.use({
    video: 'on',
    trace: 'on',
    screenshot: 'on',
    viewport: { width: 1920, height: 1080 }
});

test.setTimeout(90000); // 90 seconds per test
