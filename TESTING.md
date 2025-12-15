# Automated Testing Guide

## Effectivity

v1.11.0+

## Executive Summary

Playwright tests validate PDF Grid Viewer functionality through visual feedback and automated measurement. Tests are organized into functional, visual, and memory categories.

## Requirements

Tests shall use visual feedback to detect correct operation. Traceability: Eyes & Ears principle.
Tests shall use automated measurement and data collection, not manual guess-and-check. Traceability: Mechanisation of effort.
Tests shall not involve user console inspection. Traceability: Mechanisation of effort. User specification of requirements, not implementation.
Tests shall retain test results for inspection in test-results folder until overwritten by next test. Traceability: Review of test results.
Tests shall output a human-readable report.html file showing screenshots.
Tests shall not rm or mv the test-results/ folder.
Tests shall not rm or mv the report.html files within test-results/,

There shall be functional tests.
There shall be short-form and long-form functional tests.
There should additional tests as required, but the number of tests should be kept to a practical minimum.
There shall be performance tests. Performance tests should be kept to a practical minimum.

Test patterns shall be used that reveal common failure modes.

Tests shall not be constructed in a way that allows reward hacking.


## Testing Principles

### Vector 1: Exteroceptive tests over Interoceptive tests

Tests should verify what the user **sees**, not what the code **reports**.

| Approach      | Risk                                                   |
|---------------|--------------------------------------------------------|
| Interoceptive | False positives - internal state correct, screen blank |
| Exteroceptive | Catches real failures the user would experience        |

**Direction**: Every pass/fail criterion should have an exteroceptive component.

### Vector 2: Screenshot Comparison, Not Canvas Sampling

Canvas `getImageData()` misses visual flickers. Page screenshots capture what user sees.

**Direction**: All visual assertions should use page screenshots.

### Vector 4: Immediate Logging

Test results must not be lost on abort. Log findings immediately, not at end.

```javascript
// Log immediately when detected
console.log(`⚠ FLICKER frame ${i}: ${pct}%`);
```

**Direction**: Every significant observation logged in real-time.


## Test Organization



  1. Have the test write results to lft-results.json
  2. Create a standalone lft-report.html that fetches and renders that JSON


## Running Tests

```bash
# Start dev server (required)
python3 -m http.server 8000

# Run tests
npm test                 # Headless, cleans old reports
npm run test:headed      # Visible browser
npm run test:ui          # Interactive UI mode
npm run test:report      # View HTML report
```



## Diagnostics API

```javascript
window.__PDFGridDiagnostics.getCacheStats()       // Cache sizes
window.__PDFGridDiagnostics.getMemoryEstimate()   // Memory estimate (MB)
window.__PDFGridDiagnostics.getCurrentZoom()      // Current zoom level
window.__PDFGridDiagnostics.clearCaches()         // Clear all caches
window.__PDFGridDiagnostics.getLastDrawnAnalysis() // OSD lastDrawn tiles + quality issues
window.__PDFGridDiagnostics.getDrawnPriorityPages() // Pages to prioritize based on lastDrawn
```
