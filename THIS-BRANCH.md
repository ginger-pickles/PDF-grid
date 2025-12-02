# THIS-BRANCH: Peppers

Status: In progress (test implementation)

## Problem Behavior

Missing pages in initial view

Tiles at wrong resolution

Missing pages & tiles when cache is limited 

## Requirements

No missing tiles that should reasonably be present

Tiles at correct resolution

## Test Files

Files that exhibit issues (large bitmap images):
test-pattern.pdf -- missing pages in intital view, but only intermittent


- `ginger-pickles.pdf`
- `marie-neurath.pdf`
These are heavy files


## Test Suite

### SFT: Short-Form Test

Quick validation with both interoceptive and exteroceptive checks.

- States: Initial view, Overview

### LFT: Long-Form Test

Comprehensive flicker detection using page screenshots.

- Phases: Load, Pan, Grid, Detail

---



## Development Vectors

## Vector -2: Remove things rather than add things.

## Vector -1: Improve tile loading.

## Vector 0: Eliminate Flicker


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

### Vector 7: Desktop Viewport Testing

Current test uses mobile viewport (375x667) for economy. Desktop viewports may exhibit different behavior due to more tiles loaded simultaneously.

### Vector 8: Performance Metrics

Add timing metrics to LFT: time-to-first-tile, time-to-fully-loaded, memory usage during load.

---

## Grid Oracle & Visual Verification (2024-12-02)

### Problem: Missing Tiles in Initial View

SFT State 1 shows missing tiles where pages 2 and 3 should appear. The bug persists regardless of wait timing - it's a rendering issue, not a test timing issue.

### Test Oracle Approach

A **test oracle** is a simplified reference implementation that calculates expected output without the complexity of the full system. Created `lib/grid-oracle.js`:

```javascript
const GridOracle = require('./lib/grid-oracle.js');

// What pages should be visible in the initial view?
const result = GridOracle.getExpectedInitialPages(12, 612, 792, 375, 667);
// → { pages: [1, 2, 3], viewBounds: {...}, gridDims: {...} }
```

### Key Functions

| Function | Purpose |
|----------|---------|
| `generatePattern(numPages)` | Create triangular stagger pattern |
| `calculateDimensions()` | Pure grid geometry calculation |
| `getPagesInBounds()` | Find pages intersecting a viewport |
| `getExpectedInitialPages()` | High-level API for tests |
| `osdBoundsToGrid()` | Convert OSD normalized coords to grid pixels |

### Visual Verification Principle

> **"No accounting tricks"** - The test must verify actual pixels, not internal state.

Pass/fail must be determined by visual inspection of rendered output:

1. Oracle says: "Pages [1, 2, 3] should be visible"
2. Test calculates: "Page 2 should appear at screen region (x1, y1, x2, y2)"
3. Test samples: Actual pixels in that region
4. Decision: Does region contain content (not black/background)?

Invalid shortcuts that **must not** be used:
- `pendingJobs.size === 0` (internal state)
- `pageCache.has(key)` (cache state)
- `waitForTimeout(3000)` (arbitrary delay)

### Current Bug Status

| Viewport | Expected Pages | Actual | Status |
|----------|---------------|--------|--------|
| 375x667 | [1, 2, 3] | [1] | **FAIL** |

Pages 2 and 3 are not rendering in the initial zoomed view, though they render correctly when zooming out to grid overview.

### Next Step

Implement visual verification in SFT:
1. Use oracle to get expected pages
2. For each page, calculate screen region from viewport bounds
3. Sample pixels in each region
4. Pass if all expected regions have content; fail otherwise

---

## Visual Verification: Coordinate System Discovery (2024-12-02)

### Vector 9: Use App's Actual Pattern, Not Oracle's

The oracle generates a 5-row triangular pattern for 12 pages. The app uses a 12x12 overlapping/sliding pattern.

| Source | Pattern Size | Page 1 Position | Column |
|--------|-------------|-----------------|--------|
| Oracle | 5 rows      | Row 0, Col 4    | 4      |
| App    | 12 rows     | Row 0, Col 6    | 6      |

**App pattern structure** (truncated):
```
[[0,0,0,0,0,0,1,2,3,4,5,6],
 [0,0,0,0,0,1,2,3,4,5,6,7],
 [0,0,0,0,1,2,3,4,5,6,7,8],
 ...diagonal sliding continues...]
```

**Coordinate calculation error**:
- Test computed page 1 at gridX=9900 (triangular col 4)
- App has page 1 at gridX≈14832 (actual col 6)
- Viewport at 14220-17892
- Triangular says no intersection; app pattern shows intersection

**Direction**: Visual verification must use app's actual `ts.pattern` property, not regenerate pattern from oracle.

### Vector 10: Exteroceptive Resolution Detection

Tests should detect not just page presence but also rendering quality:

| Check | Method | Pass Criterion |
|-------|--------|----------------|
| Presence | Pixel color diversity | >5 unique colors in region |
| Resolution | Edge sharpness | High gradient values at content boundaries |

```javascript
// Edge sharpness for resolution detection
const gradient = Math.abs(pixel - neighbor);
const sharpness = gradients.filter(g => g > threshold).length / total;
// sharpness > 0.3 indicates hi-res; low values suggest blurry/low-res tiles
```

**Direction**: Report "page visible but low-res" vs "page visible and hi-res" vs "page missing".

### Vector 11: Intermittent Tile Rendering Bug Detected

SFT visual verification is now detecting a real rendering bug:

| Page | Expected Screen Region | Pixel Result | Status |
|------|------------------------|--------------|--------|
| 1    | (63, 158)-(314, 512) [251x354] | 82 colors | ✓ visible |
| 2    | (316, 158)-(375, 512) [59x354] | 2 colors  | ✗ MISSING |
| 3    | (316, 513)-(375, 667) [59x154] | 1 color   | ✗ MISSING |

**User observation**: "The behavior of the app is intermittent. Sometimes it works, sometimes it does not."

**Root cause hypothesis**: Tiles at viewport edge are not always rendered. Race condition in tile prioritization or visibility calculation.

**New finding (2024-12-02)**: Bug is **viewport-size dependent**:
- Occurs in mobile viewport (375x667) used by SFT
- Does NOT occur in larger desktop windows
- Suggests tile visibility calculation or priority queue behaves differently at small viewport sizes

**Investigation direction**:
1. Check OSD tile loading priority for edge tiles
2. Examine if viewport bounds check has off-by-one or timing issue
3. Run test multiple times to confirm intermittency rate
4. Compare tile queue behavior between mobile and desktop viewports
5. Check if OSD's `visibilityRatio` or similar parameter affects small-viewport behavior

### Vector 13: OSD Tile Request Analysis (Promising)

**Hypothesis**: OSD never requests tiles for edge regions in small viewports.

The async tile system (`downloadTileStart` → `pendingJobs` → `finishPendingJobs`) works correctly. But if OSD doesn't request tiles for the edge regions, no job is ever created.

| Layer | Behavior | Status |
|-------|----------|--------|
| OSD tile request | Decides which tiles to request | **SUSPECT** |
| downloadTileStart | Queues jobs for missing pages | Working |
| finishPendingJobs | Completes tiles when pages ready | Working |

**Why small viewports are affected**:
- Pages 2 and 3 occupy only ~59px width at viewport edge
- OSD's internal tile coverage calculation may:
  - Consider them "barely visible" and deprioritize
  - Have a minimum coverage threshold
  - Abort during initial settling animation

**Diagnostic approach**:
```javascript
// Add to downloadTileStart to log all tile requests
console.log(`[OSD Request] Tile ${level}_${x}_${y}`);
```

Compare tile request patterns between:
- Mobile viewport (375x667) - bug present
- Desktop viewport (1200x800) - bug absent

**Related code**:
- `downloadTileStart` at line 3270
- `downloadTileAbort` at line 3311 - tiles may be aborted during animation
- OSD config `immediateRender: true` at line 3598

### Vector 14: Initial View Animation Abort

**iPad observation (2024-12-02)**: Missing **tiles** at viewer edges, not missing pages. Surrounding tiles of incomplete pages beyond the initial view ARE present. This confirms the bug is at the tile level, not page level - OSD's viewport-to-tile intersection is missing edge tiles.

**Hypothesis**: Tiles for edge pages are requested, then aborted during initial view settling.

When viewer opens, OSD animates to initial position. Tiles requested during animation may be aborted via `downloadTileAbort` if viewport moves before they complete.

**Evidence needed**: Log `downloadTileAbort` calls to see if edge tiles are being cancelled.

**Potential fix**: Delay initial tile requests until animation settles, or re-request aborted tiles after settling.

### Vector 15: Level 0 Tile Not Requested (ROOT CAUSE IDENTIFIED)

**Diagnostic tile logging (2024-12-02)** reveals the root cause:

| Run | Status | Tiles Requested | Level 0 (`0_0_0`) |
|-----|--------|-----------------|-------------------|
| PASS | All visible | `0_0_0`, `3_2_0`, `3_3_0` | **Requested** |
| FAIL | [1,2] missing | `3_2_0`, `3_3_0` | **Not requested** |

**Mechanism**: The level 0 tile (`0_0_0`) is a low-resolution fallback that covers the entire viewport. When requested, all pages have at least low-res content. When missing, only high-res tiles (level 3) are rendered, covering only part of the viewport.

**Browser behavior differences**:
- Chromium: Intermittent (level 0 sometimes requested, sometimes not)
- Firefox: 100% failure rate (level 0 never requested in small viewport)

**No aborts observed**: The `aborts` array is empty in all runs. Tiles aren't being cancelled - they're never requested in the first place.

**Investigation direction**:
1. Why does OSD sometimes skip level 0 tile requests?
2. Is there a `minLevel` or `maxLevel` constraint affecting this?
3. Does viewport size affect which tile levels are requested?
4. Can we force level 0 tiles to always be requested?

### Vector 12: Parametric Test Waits

Test waits should be calculated based on input file characteristics, not hardcoded.

| Current | Problem | Future |
|---------|---------|--------|
| `waitForTimeout(500)` | Too long for small files, too short for large | Calculate from page count + tile count |
| `waitForTimeout(3000)` | Arbitrary grid settle time | Wait for OSD animation complete event |

**Direction**:
- Small PDFs (< 20 pages): minimal waits
- Large PDFs (100+ pages): proportionally longer waits
- Prefer event-based waiting over fixed timeouts

---

### Vector 16: immediateRender Investigation (Inconclusive)

**Date**: 2024-12-02

**Hypothesis**: OSD's `immediateRender: true` causes it to skip level 0 fallback tiles.

From [OSD docs](https://openseadragon.github.io/docs/OpenSeadragon.Viewer.html):
- `immediateRender: true` = "Render the best closest level first, ignoring the lowering levels"
- `immediateRender: false` = Progressive loading (loads level 0 first)

**Test**: Changed `immediateRender: true` → `false` at line 3615.

**Results**:
| Setting | Level 0 Requested | Initial View | Grid Overview |
|---------|-------------------|--------------|---------------|
| `true` (original) | Sometimes | Intermittent | **Works** |
| `false` | Yes (always) | More consistent | **BROKEN** |

**Observation**: With `immediateRender: false`:
- Tile log shows `0_0_0` always requested
- Initial view shows all pages (fix works!)
- But grid overview stops rendering (visual regression)

**Status**: Reverted to `immediateRender: true`. The change fixes the initial view but breaks overview rendering. Need to understand why overview breaks.

**Possible explanations**:
1. `immediateRender: false` delays tile rendering when zooming out
2. Need to combine with other OSD settings
3. Grid overview uses different code path affected by this setting

**Next steps** (not yet attempted):
1. Investigate how overview/home view triggers tile loading
2. Check if `preload: true` interacts with `immediateRender`
3. Look for OSD events to wait for after zoom operations
4. Review [OSD issue #1020](https://github.com/openseadragon/openseadragon/issues/1020) - loading too many tiles after similar change

---

## Background

See the equivalent file in parent branch(es) for earlier notes. See also Changelog.
