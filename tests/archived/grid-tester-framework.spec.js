/**
 * Grid Tester Framework
 *
 * Tests three versions of index.html (PDF Grid Viewer) and generates comparative results.
 * Output directory: test-results/grid-tester/
 *
 * Versions:
 * - A (Current): index.html
 * - B (Checkpoint): index-checkpoint.html
 * - C (Baseline): index-baseline.html
 */

const { test, expect } = require('@playwright/test');
const { testGridVersion, countLinesOfCode } = require('./grid-suite.js');
const fs = require('fs').promises;
const path = require('path');

// Version configuration
const VERSIONS = {
    A: {
        file: 'index.html',
        label: 'Current',
        description: 'Current working version'
    },
    B: {
        file: 'index-checkpoint.html',
        label: 'Checkpoint',
        description: 'Last known good version'
    },
    C: {
        file: 'index-baseline.html',
        label: 'Baseline',
        description: 'Stable reference version'
    }
};

// Output directory
const TESTER_DIR = path.join(__dirname, '../test-results/grid-tester');

// Session tracking
let sessionStartTime = Date.now();
let sessionDuration = 0;
const allResults = {
    versionA: {},
    versionB: {},
    versionC: {}
};

test.describe('Grid Tester Framework', () => {
    // Setup: Create output directory
    test.beforeAll(async () => {
        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║  Grid Tester Framework - Testing 3 Versions of index.html     ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');

        // Create output directories
        await fs.mkdir(TESTER_DIR, { recursive: true });
        for (const versionKey of Object.keys(VERSIONS)) {
            const versionDir = path.join(TESTER_DIR, `version-${versionKey}`);
            await fs.mkdir(versionDir, { recursive: true });
        }

        sessionStartTime = Date.now();
    });

    // Test each version
    for (const [versionKey, versionInfo] of Object.entries(VERSIONS)) {
        test(`Version ${versionKey}: ${versionInfo.label}`, async ({ page, browser }, testInfo) => {
            console.log(`\n${'='.repeat(70)}`);
            console.log(`Testing Version ${versionKey}: ${versionInfo.file}`);
            console.log(`Description: ${versionInfo.description}`);
            console.log('='.repeat(70));

            const versionDir = path.join(TESTER_DIR, `version-${versionKey}`);

            // Run test suite
            const result = await testGridVersion(page, versionInfo.file, versionKey, versionDir);

            // Add lines of code metric
            const filePath = path.join(__dirname, '..', versionInfo.file);
            result.metrics['Lines of Code'] = await countLinesOfCode(filePath);

            // Store results for session summary
            allResults[`version${versionKey}`] = result.metrics;

            // Save per-version results
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

            console.log(`\nVersion ${versionKey} Results:`);
            console.log(`  Load Time: ${result.metrics['Load Time (ms)']}ms`);
            console.log(`  Console Errors: ${result.metrics['Console Errors']}`);
            console.log(`  Pages Cached: ${result.metrics['Pages Cached']}`);
            console.log(`  Tiles Cached: ${result.metrics['Tiles Cached']}`);
            console.log(`  Zoom Functional: ${result.metrics['Zoom Functional'] ? 'YES' : 'NO'}`);
            console.log(`  Pan Functional: ${result.metrics['Pan Functional'] ? 'YES' : 'NO'}`);
            console.log(`  Help Panel: ${result.metrics['Help Panel Functional'] ? 'YES' : 'NO'}`);
            console.log(`  Debug Panel: ${result.metrics['Debug Panel Opens'] ? 'YES' : 'NO'}`);
            console.log(`  Mobile Responsive: ${result.metrics['Mobile Responsive'] ? 'YES' : 'NO'}`);
            console.log(`  Lines of Code: ${result.metrics['Lines of Code']}`);

            // Basic assertions
            expect(result.metrics['Console Errors']).toBe(0);
            expect(result.metrics['Pages Cached']).toBeGreaterThan(0);
            expect(result.metrics['Zoom Functional']).toBe(1);
            expect(result.metrics['Pan Functional']).toBe(1);
        });
    }

    // Generate session summary
    test.afterAll(async () => {
        sessionDuration = Date.now() - sessionStartTime;

        const sessionSummary = {
            timestamp: new Date(sessionStartTime).toISOString(),
            duration_ms: sessionDuration,
            test_subject: 'index.html (PDF Grid Viewer)',
            versions_tested: VERSIONS,
            tester_version: '1.0.0',
            metrics: {
                versionA: allResults.versionA,
                versionB: allResults.versionB,
                versionC: allResults.versionC
            }
        };

        // Save session summary
        await fs.writeFile(
            path.join(TESTER_DIR, 'session-summary.json'),
            JSON.stringify(sessionSummary, null, 2)
        );

        console.log('\n╔════════════════════════════════════════════════════════════════╗');
        console.log('║  Session Summary                                               ║');
        console.log('╚════════════════════════════════════════════════════════════════╝');
        console.log(`  Duration: ${sessionDuration}ms`);
        console.log(`  Output: ${TESTER_DIR}`);
        console.log(`  Summary: ${path.join(TESTER_DIR, 'session-summary.json')}`);
        console.log('');
    });
});
