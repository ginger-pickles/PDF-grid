# Automated Testing Guide

## Overview

This project uses [Playwright](https://playwright.dev) for automated memory and performance testing. The tests monitor cache behavior, memory usage, and detect potential memory leaks during zoom operations.

## Prerequisites

- Node.js and npm installed
- Playwright browsers installed (done during setup)

## Setup (One-time)

Already completed:
```bash
npm install
npx playwright install chromium firefox webkit
```

## Running Tests

### 1. Start the Development Server

The tests require a local server running on port 8000. In one terminal:

```bash
python3 -m http.server 8000
```

Keep this server running while you run tests.

### 2. Run Tests

In a separate terminal:

```bash
# Run all tests (headless mode)
# Automatically cleans old reports AND videos before running
npm test

# Run tests with browser visible (useful for debugging)
# Automatically cleans old reports AND videos before running
npm run test:headed

# Run tests in interactive UI mode (recommended for development)
# Does NOT clean reports or videos - keeps history for comparison
npm run test:ui

# View test report after running tests (opens in browser)
npm run test:report

# OR: Open the HTML report file directly in your browser
# File location: playwright-report/index.html

# Manually clean old HTML report only (keeps videos in test-results/)
npm run test:clean

# Manually clean everything including videos
npm run test:clean:all
```

**Note:** Running `npm test` or `npm run test:headed` automatically cleans both reports and videos before each run to prevent cruft accumulation. Videos from the most recent test run are always available for review.

**Quick Report Access:** After tests run, simply double-click one of these files in your file browser:
- `test-report.html` (convenient symlink at project root)
- `playwright-report/index.html` (actual report file)

**Videos Location:** Test videos are in `test-results/` organized by test name. The HTML report has links to view them.

## Test Organization

```
tests/
├── memory/
│   └── zoom-operations.spec.js  # Memory monitoring during zoom
└── fixtures/                     # Test data and helpers (future)
```

## What the Tests Check

### Memory Tests (zoom-operations.spec.js)

1. **PageCache Population** - Verifies pages are cached after initial load
2. **Memory Estimates** - Ensures memory usage stays under reasonable limits
3. **PageCache Growth** - Confirms cache grows when zooming out (more pages visible)
4. **Unbounded Growth Detection** - Documents current issue: PageCache grows indefinitely (⚠️ expected to warn until LRU eviction implemented)
5. **TileCache Limits** - Verifies TileCache respects 300-tile limit
6. **Cache Clearing** - Tests diagnostic cache clear functionality
7. **Zoom Tracking** - Confirms zoom level is trackable

## Diagnostics API

Tests use `window.__PDFGridDiagnostics` API exposed in index.html:

```javascript
// Available in browser console or tests
window.__PDFGridDiagnostics.getCacheStats()      // Get page and tile cache sizes
window.__PDFGridDiagnostics.getMemoryEstimate()  // Get rough memory estimate in MB
window.__PDFGridDiagnostics.getCurrentZoom()     // Get current zoom level
window.__PDFGridDiagnostics.clearCaches()        // Clear all caches
```

## Test Configuration

See `playwright.config.js` for configuration options:

- **Timeout**: 30 seconds per test
- **Browser**: Firefox only (for faster test runs)
  - Chromium, WebKit, and Mobile Safari are commented out but can be enabled if needed
- **Reporters**: HTML report (view with `npm run test:report`)
- **Screenshots/Videos**: Captured on failure only

## Expected Results

✅ All tests should pass with PageCache LRU eviction now implemented. The "PageCache should not grow indefinitely" test verifies that the cache stays under the 100-page limit.

## Adding New Tests

1. Create new test files in appropriate subdirectories under `tests/`
2. Use existing tests as templates
3. Import from `@playwright/test`: `const { test, expect } = require('@playwright/test');`
4. Use `window.__PDFGridDiagnostics` for accessing app state

## CI Integration (Future)

To run tests in CI:
```bash
# Set CI environment variable
CI=true npm test
```

This enables:
- 2 retries on failure
- Fails build if `test.only` is left in code
- Expects server to be already running (no auto-start)

## Troubleshooting

**Tests timeout**: Ensure dev server is running on port 8000 first

**Browser not found**: Run `npx playwright install`

**Port 8000 in use**: Stop other servers or change port in both server command and `playwright.config.js`

**Tests fail intermittently**: Timing-sensitive tests may need adjustment of `waitForTimeout` values
