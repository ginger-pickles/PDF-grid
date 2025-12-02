# THIS-BRANCH: Peppers

Status: In progress (test implementation)

## Problem Behavior

1. **Slow tile build-in**: Tiles visibly populate as view is zoomed and panned
2. **Flickering**: Display briefly blanks during load and while idle

## Requirements

1. Tile display speed shall be improved
2. Flickering issues shall be reduced

## Test Files

Files that exhibit issues (large bitmap images):
- `ginger-pickles.pdf`
- `marie-neurath.pdf`

These files flicker during load AND while idle.

---



## Test Suite

### SFT: Short-Form Test

Quick validation with both interoceptive and exteroceptive checks.

- Duration: <30 seconds
- PDF: `demo/test-pattern.pdf`
- States: Initial view, Overview

### LFT: Long-Form Test

Comprehensive flicker detection using page screenshots.

- Duration: Minutes
- PDF: `demo/ginger-pickles.pdf`
- Phases: Load, Pan, Grid, Detail

---



## Development Vectors

## Vector -2: Remove things rather than add things.

## Vector -1: Improve tile loading.

## Vector 0: Reduce Flicker


### Vector 1: Exteroceptive over Interoceptive

Tests should verify what the user **sees**, not what the code **reports**.

| Approach      | Risk                                                   |
|---------------|--------------------------------------------------------|
| Interoceptive | False positives - internal state correct, screen blank |
| Exteroceptive | Catches real failures the user would experience        |

**Direction**: Every pass/fail criterion should have an exteroceptive component.

### Vector 2: Screenshot Comparison, Not Canvas Sampling

Canvas `getImageData()` misses visual flickers. Page screenshots capture what user sees.

```javascript
// Do this
const screenshot = await page.screenshot({ type: 'png' });

// Not this
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
```

**Direction**: All visual assertions should use page screenshots.

### Vector 3: Distinguish Loading from Flickering

During load, screen changes are expected. After settling, they are not.

| Phase     | Change Expected  | Failure Criterion      |
|-----------|------------------|------------------------|
| Loading   | Yes              | Content never appears  |
| Settled   | No               | Any significant change |
| Pan/Zoom  | Yes, then settle | Fails to settle        |

**Direction**: Implement "monotonicity" check - during load, content should only increase (pixels filling in), never decrease (content disappearing).

### Vector 4: Immediate Logging

Test results must not be lost on abort. Log findings immediately, not at end.

```javascript
// Log immediately when detected
console.log(`⚠ FLICKER frame ${i}: ${pct}%`);
```

**Direction**: Every significant observation logged in real-time.





## Commands

```bash
# SFT - quick validation
npx playwright test tests/short-form-test.spec.js --project=chromium

# LFT - comprehensive flicker detection (optionally headed for observation)
npx playwright test tests/long-form-test.spec.js --project=chromium --headed
```

---

## Code Analysis (2024-12-01)

### Dead Code Identified

The async `downloadTileStart` pattern (v1.11.0) does not generate stripe placeholders. The following code is now dead:

| Component                    | Purpose                        | Status                              |
|------------------------------|--------------------------------|-------------------------------------|
| `_renderBlankTile()`         | Red stripe placeholder         | Dead - never called                 |
| `inspectVisual()`            | Stripe pattern detector        | Dead - no stripes to detect         |
| Auto-Inspector               | Periodic stripe check + heal   | Dead - triggers on non-existent     |
| `FALLBACK_RENDERING_ENABLED` | Config toggle                  | Dead - fallback logic unused        |

### Potential Flicker Sources

| Component              | Behavior                              | Concern                    |
|------------------------|---------------------------------------|----------------------------|
| `recreateTiledImage()` | Removes TiledImage, waits 50ms, re-adds | Creates visible blank gap |
| Called at line 4675    | After initial batch complete          | One-time during load       |
| Called at line 5101    | After all low-res pages complete      | One-time during load       |
| Called by Auto-Inspector | When stripes detected               | Periodic (but stripes don't exist) |

Note: Do not remove code yet. iOS may have cache limitations requiring stripe reintroduction.

### Hypotheses and Proposed Corrections

| Hypothesis                          | Evidence                                      | Proposed Correction                          | Status        |
|-------------------------------------|-----------------------------------------------|----------------------------------------------|---------------|
| `recreateTiledImage()` 50ms gap     | Function explicitly waits 50ms during swap    | Disabled both call sites (lines 4675, 5101)  | **APPLIED**   |
| Auto-Inspector false triggers       | Checks for stripes that no longer exist       | Already disabled (line 5543 commented)       | **N/A**       |
| React state change triggers redraw  | Debug panel updates cause visible refresh     | Memoize OSD interaction, isolate from state  | Untested      |
| OSD tile cache invalidation         | Tiles re-request after initial display        | Increase cache size or prevent invalidation  | Untested      |
| Multiple `forceRedraw()` calls      | Lines 2907, 4075-4076, 6316-6318              | Debounce or consolidate redraw triggers      | **NEXT**      |

### Investigation Order

1. ~~**Disable Auto-Inspector**~~ - Already disabled
2. ~~**Disable `recreateTiledImage()` calls**~~ - Done (2 call sites disabled)
3. **Review `forceRedraw()` call sites** - Map all triggers, look for redundancy
4. **Isolate React from OSD** - Check if debug panel state affects display

### Current Test Results

- **LFT at 5% threshold**: **0 flickers** - PASSED
- **Root cause fixed**: `tiledImage.reset()` disabled (line 2899)
- **Report**: `test-results/lft-report.html` (with animation controls, live viewer, run button)

---

## Resolution (2024-12-02)

### Root Cause Identified

The `tiledImage.reset()` call in `_scheduleReset()` was clearing OpenSeadragon's internal tile cache, causing a visual gap when content was re-rendered. This was triggering after a 500ms debounce and causing 6.1% pixel changes detected as flicker.

### Fix Applied

```javascript
// Line 2898-2900 in index.html
// Reset clears OSD's internal tile cache
// DISABLED: tiledImage.reset() causes visual flicker
// tiledImage.reset();
this._lastResetTime = Date.now();
```

### Test Infrastructure

- **File-based screenshots**: PNGs saved to `test-results/screenshots/` instead of base64 in JSON
- **Visual diff chart**: Bar chart with threshold line showing frame-to-frame differences
- **Live viewer**: Iframe in report showing PDF at test viewport size
- **Run Test button**: Triggers Playwright test from report UI via `test-server.js`

---

## Next Development Vectors

With the core flicker fix in place, these are potential next steps:

### Vector 5: Re-enable Disabled LFT Phases

The Pan, Grid, and Detail phases were disabled during debugging. Now that base flicker is fixed, re-enable to ensure no flicker during navigation operations.

| Phase  | Operation                  | Status   |
|--------|----------------------------|----------|
| Pan    | Pan to 3 positions         | Disabled |
| Grid   | Zoom to show all pages     | Disabled |
| Detail | Zoom into center at 4x     | Disabled |

### Vector 6: Multi-PDF Test Coverage

Current test uses only `ginger-pickles.pdf`. Verify fix works across different documents:

| PDF                        | Characteristic           |
|----------------------------|--------------------------|
| `test-pattern.pdf`         | Synthetic test image     |
| `marie-neurath.pdf`        | Known flicker exhibitor  |
| `mixed-dimensions.pdf`     | Variable page sizes      |
| `Popular_Mechanics_*.pdf`  | Large magazine scans     |

### Vector 7: Desktop Viewport Testing

Current test uses mobile viewport (375x667) for economy. Desktop viewports may exhibit different behavior due to more tiles loaded simultaneously.

### Vector 8: Performance Metrics

Add timing metrics to LFT: time-to-first-tile, time-to-fully-loaded, memory usage during load.

---

## Background

See the equivalent file in parent branch(es) for earlier notes. See also Changelog.
