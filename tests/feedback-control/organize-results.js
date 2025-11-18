#!/usr/bin/env node

/**
 * Organize Playwright test results into latest-session directory
 *
 * Playwright stores video/trace in test-results/. This script moves
 * the most recent feedback-control test artifacts to latest-session/
 * for easy access by supervisor.html
 */

const fs = require('fs').promises;
const path = require('path');

async function organize() {
    console.log('[Organize] Moving test artifacts to latest-session/...');

    const testResultsDir = path.join(__dirname, '../../test-results');
    const sessionDir = path.join(__dirname, 'latest-session');

    try {
        // Find the most recent test result directory
        const dirs = await fs.readdir(testResultsDir);
        const feedbackDirs = dirs.filter(d => d.includes('feedback-control'));

        if (feedbackDirs.length === 0) {
            console.log('[Organize] No feedback-control test results found');
            return;
        }

        // Get the most recent directory
        const latestDir = feedbackDirs.sort().reverse()[0];
        const sourcePath = path.join(testResultsDir, latestDir);

        console.log(`[Organize] Found test results: ${latestDir}`);

        // Copy video
        const videoFiles = await fs.readdir(sourcePath);
        const videoFile = videoFiles.find(f => f.endsWith('.webm'));

        if (videoFile) {
            const videoSource = path.join(sourcePath, videoFile);
            const videoDest = path.join(sessionDir, 'video.webm');
            await fs.copyFile(videoSource, videoDest);
            console.log('[Organize] ✓ Video copied to latest-session/video.webm');
        } else {
            console.log('[Organize] ⚠ No video file found');
        }

        // Copy trace
        const traceDir = path.join(sourcePath, 'trace.zip') || path.join(sourcePath, 'trace');
        try {
            // Playwright creates trace.zip
            const traceDest = path.join(sessionDir, 'trace.zip');
            await fs.copyFile(traceDir, traceDest);
            console.log('[Organize] ✓ Trace copied to latest-session/trace.zip');
        } catch (err) {
            console.log('[Organize] ⚠ No trace file found');
        }

        // Screenshots are already saved directly by the test
        console.log('[Organize] ✓ Screenshots already in latest-session/');

        // JSON files are already saved directly by the test
        console.log('[Organize] ✓ JSON files already in latest-session/');

        console.log('[Organize] Organization complete!');
        console.log(`[Organize] Session available at: ${sessionDir}`);

    } catch (error) {
        console.error('[Organize] Error:', error.message);
        process.exit(1);
    }
}

organize();
