#!/usr/bin/env node

/**
 * Feedback Control Server
 *
 * Provides API endpoints for executing Playwright tests from web interfaces.
 * Enables both supervisor.html and tester.html to trigger automated testing.
 */

const express = require('express');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Track running tests
let currentTest = null;

/**
 * Execute Playwright test and stream output
 */
app.post('/api/run-test', async (req, res) => {
    if (currentTest && !currentTest.killed) {
        res.status(409).json({
            error: 'Test already running',
            message: 'Please wait for current test to complete'
        });
        return;
    }

    // Get test file from query parameter or request body (default to grid-tester-framework)
    const testFile = req.query.testFile || req.body?.testFile || 'tests/grid-tester-framework.spec.js';

    console.log(`[Server] Starting Playwright test: ${testFile}`);

    // Set headers for SSE (Server-Sent Events)
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // Send initial message
    res.write(`data: ${JSON.stringify({ type: 'start', message: `Test starting: ${testFile}` })}\n\n`);

    // Spawn Playwright test
    currentTest = spawn('npx', [
        'playwright',
        'test',
        testFile,
        '--reporter=list'
    ], {
        cwd: __dirname
    });

    // Stream stdout
    currentTest.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('[Test]', output);
        res.write(`data: ${JSON.stringify({ type: 'stdout', message: output })}\n\n`);
    });

    // Stream stderr
    currentTest.stderr.on('data', (data) => {
        const output = data.toString();
        console.error('[Test Error]', output);
        res.write(`data: ${JSON.stringify({ type: 'stderr', message: output })}\n\n`);
    });

    // Handle completion
    currentTest.on('close', async (code) => {
        console.log(`[Server] Test completed with code ${code}`);

        // Determine results path based on test file
        let resultsPath = 'test-results/grid-tester/';
        if (testFile.includes('tester-framework')) {
            resultsPath = 'test-results/tester/';
        } else if (testFile.includes('grid-tester-framework')) {
            resultsPath = 'test-results/grid-tester/';
        }

        res.write(`data: ${JSON.stringify({
            type: 'complete',
            code,
            message: code === 0 ? 'All tests passed' : 'Some tests failed',
            resultsPath: resultsPath
        })}\n\n`);

        res.end();
        currentTest = null;
    });

    // Handle errors
    currentTest.on('error', (error) => {
        console.error('[Server] Error running test:', error);
        res.write(`data: ${JSON.stringify({
            type: 'error',
            message: 'Failed to start test: ' + error.message
        })}\n\n`);
        res.end();
        currentTest = null;
    });

    // Cleanup on client disconnect
    req.on('close', () => {
        if (currentTest && !currentTest.killed) {
            console.log('[Server] Client disconnected, keeping test running');
        }
    });
});

/**
 * Get test status
 */
app.get('/api/test-status', (req, res) => {
    res.json({
        running: currentTest && !currentTest.killed,
        pid: currentTest?.pid || null
    });
});

/**
 * Stop running test
 */
app.post('/api/stop-test', (req, res) => {
    if (currentTest && !currentTest.killed) {
        currentTest.kill('SIGTERM');
        res.json({ message: 'Test stopped' });
    } else {
        res.status(404).json({ error: 'No test running' });
    }
});

/**
 * Get latest session data
 */
app.get('/api/latest-session', async (req, res) => {
    try {
        const sessionDir = path.join(__dirname, 'tests/feedback-control/latest-session');

        // Read session metadata
        const metadataPath = path.join(sessionDir, 'session-metadata.json');
        const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));

        // Read metrics
        const metricsPath = path.join(sessionDir, 'metrics.json');
        const metrics = JSON.parse(await fs.readFile(metricsPath, 'utf8'));

        res.json({
            metadata,
            metrics,
            files: {
                video: 'tests/feedback-control/latest-session/video.webm',
                trace: 'tests/feedback-control/latest-session/trace.zip',
                screenshots: [
                    'tests/feedback-control/latest-session/screenshot-before-test.png',
                    'tests/feedback-control/latest-session/screenshot-after-load.png',
                    'tests/feedback-control/latest-session/screenshot-metrics.png'
                ]
            }
        });
    } catch (error) {
        res.status(404).json({
            error: 'No session data found',
            message: error.message
        });
    }
});

/**
 * Save supervisor summary JSON
 */
app.post('/api/save-summary', async (req, res) => {
    try {
        const sessionDir = path.join(__dirname, 'tests/feedback-control/latest-session');
        const summaryPath = path.join(sessionDir, 'supervisor-summary.json');

        await fs.writeFile(summaryPath, JSON.stringify(req.body, null, 2));

        res.json({ message: 'Summary saved successfully', path: summaryPath });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to save summary',
            message: error.message
        });
    }
});

/**
 * Organize test results (same as organize-results.js)
 */
async function organizeResults() {
    const testResultsDir = path.join(__dirname, 'test-results');
    const sessionDir = path.join(__dirname, 'tests/feedback-control/latest-session');

    // Find most recent test result directory
    const dirs = await fs.readdir(testResultsDir);
    const feedbackDirs = dirs.filter(d => d.includes('feedback-control'));

    if (feedbackDirs.length === 0) {
        throw new Error('No test results found');
    }

    const latestDir = feedbackDirs.sort().reverse()[0];
    const sourcePath = path.join(testResultsDir, latestDir);

    // Copy video
    const sourceFiles = await fs.readdir(sourcePath);
    const videoFile = sourceFiles.find(f => f.endsWith('.webm'));
    if (videoFile) {
        await fs.copyFile(
            path.join(sourcePath, videoFile),
            path.join(sessionDir, 'video.webm')
        );
    }

    // Copy trace
    const traceFile = sourceFiles.find(f => f === 'trace.zip');
    if (traceFile) {
        await fs.copyFile(
            path.join(sourcePath, traceFile),
            path.join(sessionDir, 'trace.zip')
        );
    }

    console.log('[Server] Results organized to latest-session/');
}

// Start server
app.listen(PORT, () => {
    console.log(`
╔════════════════════════════════════════════════════════════════╗
║  Feedback Control Server                                       ║
╠════════════════════════════════════════════════════════════════╣
║  Server:      http://localhost:${PORT}                              ║
║  API:         http://localhost:${PORT}/api/                         ║
║                                                                ║
║  Interfaces:                                                   ║
║  - supervisor.html:    http://localhost:${PORT}/supervisor.html     ║
║  - grid-tester.html:   http://localhost:${PORT}/grid-tester.html   ║
║                                                                ║
║  Test: tests/tester-framework.spec.js (3 versions: A/B/C)      ║
║  Output: test-results/tester/                                  ║
║                                                                ║
║  API Endpoints:                                                ║
║  POST /api/run-test        - Execute Playwright test           ║
║  GET  /api/test-status     - Check if test is running          ║
║  POST /api/stop-test       - Stop running test                 ║
║  GET  /api/latest-session  - Get latest session data           ║
╚════════════════════════════════════════════════════════════════╝
    `);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[Server] Shutting down gracefully...');
    if (currentTest && !currentTest.killed) {
        currentTest.kill('SIGTERM');
    }
    process.exit(0);
});
