# THIS-BRANCH: Peppers

COMPACT THIS DOCUMENT AS NECESSARY
LENGTH NOT TO EXCEED 500 LINES


## Problem Behavior

Missing pages in initial view

Tiles at wrong resolution

Missing pages & tiles when cache is limited 

## Requirements

No missing tiles that should reasonably be present

Tiles shall be displayed at correct resolution, eventually

## Test Suite

### SFT: Short-Form Test

Quick validation with both interoceptive and exteroceptive checks.

- States: Initial view, Overview

### LFT: Long-Form Test

Comprehensive flicker detection using page screenshots.

- Phases: Load, Pan, Grid, Detail

---



## Development Vectors

### Core Principles

**Vector -2: Remove code & features rather than add code & features.**

**Vector -1: Improve tile loading.**

**Vector 0: Eliminate Flicker.**

---

### Completed Vectors

**Vector 1: PDF.js Render Timing Race Condition (ROOT CAUSE IDENTIFIED)**

**Date**: 2024-12-02
**Status**: Complete

**Problem**: Pages 2,3 missing in initial mobile viewport (375x667). Root cause confirmed: Tiles complete BEFORE all needed pages finish rendering.

**Timeline from passing test (shows race even when "passing"):**
```
350138ms - Render START: pages 1,2,3 high-res (all same ms!)
350500ms - Render COMPLETE: page 2 high (FIRST)
350617ms - Render COMPLETE: page 1 high
350633ms - Tile 3_3_0 COMPLETE ← Tile finishes here
350633ms - Cache miss: page 3 (not ready yet!)
350641ms - Render COMPLETE: page 3 high (8ms AFTER tile!)
```

**Key findings:**
1. PDF.js renders pages in non-deterministic order (p2→p1→p3, not sequential)
2. Tiles complete with whatever pages are ready at that moment
3. Late pages show as low-res (from L0 fallback) or missing entirely
4. Race outcome varies: pass (all ready), partial (mixed res), fail (pages missing)

**Solution**: Proceeded with Option 3 (retry mechanism) - see Vector 2.

---

**Vector 2: Tile Composition Integrity**

**Date**: 2024-12-02
**Status**: Complete (Simplified 2024-12-02)

**Principle**: Never deliver incomplete tiles. Abort composition and wait for correct pages rather than deliver partial/incorrect content.

**Original implementation** (2024-12-02, now removed):
- Retry mechanism with `pendingRetries` Map
- Called `_forceRetryReset()` to invalidate OSD cache
- Caused flicker from `tiledImage.reset()`

**Simplified implementation** (2024-12-02):
- `_drawPageIntersection()` returns false if required page missing (line 2577)
- `_renderTileToContext()` tracks composition success, returns boolean (line 2699)
- `tryGenerateTile()` checks composition success before delivering tile (line 3507)
- `finishPendingJobs()` checks composition success before calling `context.finish()` (line 3606)
- Tiles stay queued in `pendingJobs` until all pages available
- No retry tracking, no cache resets, no flicker

**Key insight**: Return `true` (success) for non-intersecting pages and blank cells - these represent successful completion with nothing to draw, not failure.

**Testing**: All tests pass, no flicker, cleaner code.

---

**Vector 3: tiledImage.reset() Elimination**

**Date**: 2024-12-02
**Status**: Complete

**Current usage in codebase**:

| Location | Line | Status | When Called |
|----------|------|--------|-------------|
| `_scheduleReset()` | 2820 | **DISABLED** | Was called by `scheduleRedraw()` |
| `_forceRetryReset()` | - | **REMOVED** | (Eliminated during Vector 2 simplification) |
| `_requestPagesAsync()` | 2901-2902 | Comment only | Uses `needsDraw()` instead |

**Rationale**: `tiledImage.reset()` causes visible flicker by forcing OSD to discard and re-request ALL tiles. Originally added as workaround for cache invalidation issues.

**Solution**: Eliminate need for reset by never delivering incomplete tiles (Vector 2). Tiles stay queued until all pages available, OSD never receives incorrect content to cache.

**Result**: Zero calls to `tiledImage.reset()` in normal operation, zero flicker.

---

### Current Test Vectors

**Vector 4: Distinguish Loading from Flickering**

During load, screen changes are expected. After settling, they are not.

| Phase     | Change Expected  | Failure Criterion      |
|-----------|------------------|------------------------|
| Loading   | Yes              | Content never appears  |
| Settled   | No               | Any significant change |
| Pan/Zoom  | Yes, then settle | Fails to settle        |

**Direction**: Implement "monotonicity" check - during load, content should only increase (pixels filling in), never decrease (content disappearing).

---

**Vector 5: Use App's Actual Pattern, Not Oracle's**

The oracle generates a 5-row triangular pattern for 12 pages. The app uses a 12x12 overlapping/sliding pattern.

| Source | Pattern Size | Page 1 Position | Column |
|--------|-------------|-----------------|--------|
| Oracle | 5 rows      | Row 0, Col 4    | 4      |
| App    | 12 rows     | Row 0, Col 6    | 6      |

**Direction**: Visual verification must use app's actual `ts.pattern` property, not regenerate pattern from oracle.

---

**Vector 6: Exteroceptive Resolution Detection**

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

---

**Vector 7: Parametric Test Waits**

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

### Future Enhancements


**Vector 10: OSD placeholderFillStyle**

**OSD Feature**: `placeholderFillStyle` option draws a colored placeholder while tiles load.

**Usage**:
```javascript
viewer.addTiledImage({
  tileSource: mySource,
  placeholderFillStyle: 'rgb(200, 200, 200)'  // Gray placeholder
});
```

**Potential application**: Show gray rectangles while PDF pages render, providing visual feedback during initial load.

**Known issues**: Had bugs in OSD 2.3.0 where placeholder wasn't drawn when `lastDrawn` array was empty ([Issue #1283](https://github.com/openseadragon/openseadragon/issues/1283)).

**Status**: Not implemented. Consider for progressive loading UX.

---

**Vector 11: OSD Tile State Properties**

**OSD Tile properties** for state management:
- `tile.loaded` (Boolean) - Is tile data loaded?
- `tile.loading` (Boolean) - Is tile currently loading?
- `tile.exists` (Boolean) - Set `false` for sparse images or failed tiles
- `tile.opacity` (Number) - Current opacity (for fade animations)

**Retry via `tile.exists`**:
```javascript
viewer.addHandler('tile-load-failed', function(event) {
  setTimeout(function() {
    event.tile.exists = true;  // Reset to trigger retry
  }, 1);
});
```

**Events**:
- `tile-loaded` - Fires when tile completes
- `tile-load-failed` - Fires when tile fails (can reset `exists` to retry)
- `fully-loaded-change` - Fires when all visible tiles loaded/unloaded

**Status**: Not used. Our approach avoids delivering incomplete tiles entirely (Vector 2), eliminating need for retries.

---

**Vector 12: Resolution Fallback**

**Date**: 2024-12-02
**Status**: Complete (Option 3 - No Fallback)

Fix resolution upgrade mechanism for smoother transitions from low-res to high-res tiles.

**Root cause identified**: Impedance mismatch between TileStreamer output (binary 0.3x/4x resolutions with fallback) and OSD input (continuous pyramid levels expecting stable tiles).

**Problem**: Fallback logic served wrong-resolution tiles, OSD cached them, tiles got stuck.
- Levels 0-3 requested low-res → got low-res (correct)
- Levels 4-10 requested high-res → got low-res as fallback → **stuck at low-res** (Vector 12)
- Later high-res ready → invalidation failed because OSD already cached the tile

**Solution implemented (Option 3 - No Fallback)**:
- Removed fallback resolution logic from 4 locations:
  1. `tryGenerateTile()` (line ~3557)
  2. `finishPendingJobs()` (line ~3586)
  3. `generateTile()` (line ~2292)
  4. `_drawPageIntersection()` (line ~2570)
- Tiles now only accept correct resolution for their level
- If high-res not ready, tile waits (queued via `pendingJobs`)
- OSD scales up lower levels temporarily - this is OSD's design!

**Impedance matching achieved**:
- Each OSD level maps to stable resolution (no substitution)
- TileStreamer only delivers what it actually has
- OSD handles gaps gracefully with built-in tile scaling

**User experience after fix**:
1. User zooms in quickly
2. High-level tiles not ready yet (high-res pages rendering)
3. OSD temporarily scales up low-level tiles (slight blur)
4. High-res pages finish rendering
5. High-level tiles complete with correct resolution
6. OSD smoothly replaces scaled tiles with native high-res tiles

**Changes**: ~60 lines modified across 4 functions
**Documentation**: See `VECTOR-12-ANALYSIS.md` and `IMPEDANCE-MATCHING.md`

**Future enhancement (Option 1 - Multi-Resolution Pyramid)**:

For even smoother progressive loading, consider graduated PDF scales:
- Current: Binary choice (0.3x or 4x - 13x jump!)
- Option 1: Graduated scales (0.3x → 1x → 2x → 4x)
- Each OSD level gets appropriate PDF resolution
- Smoother progression, less visual discontinuity
- Trade-off: 2x memory (4 resolutions vs 2)
- See `IMPEDANCE-MATCHING.md` for full analysis

**Relation to existing vectors**:
- Combined with Vector 2 (tile composition integrity) and Vector 3 (reset elimination)
- All three vectors work together: strict resolution matching + abort on missing pages + no flicker
- Result: Clean, predictable tile delivery without cache invalidation complexity

---

## Code Analysis (2024-12-01)

### Dead Code Removed

| Component                    | Purpose                        | Status                              |
|------------------------------|--------------------------------|-------------------------------------|
| `_renderBlankTile()`         | Red stripe placeholder         | Removed (no stripes in async pattern) |
| `inspectVisual()`            | Stripe pattern detector        | Removed                             |
| Auto-Inspector               | Periodic stripe check + heal   | Removed                             |
| `FALLBACK_RENDERING_ENABLED` | Config toggle                  | Removed (fallback logic eliminated) |

### Potential Flicker Sources

| Component              | Behavior                              | Concern                    |
|------------------------|---------------------------------------|----------------------------|
| `recreateTiledImage()` | Removes TiledImage, waits 50ms, re-adds | Creates visible blank gap |
---


### Test Infrastructure

- **File-based screenshots**: PNGs saved to `test-results/screenshots/` instead of base64 in JSON
- **Visual diff chart**: Bar chart with threshold line showing frame-to-frame differences
- **Live viewer**: Iframe in report showing PDF at test viewport size
- **Run Test button**: Triggers Playwright test from report UI via `test-server.js`

---

## Historical Context

### Grid Oracle & Visual Verification (2024-12-02)

A **test oracle** approach was developed: `lib/grid-oracle.js` provides simplified reference implementation that calculates expected output without the complexity of the full system.

```javascript
const GridOracle = require('./lib/grid-oracle.js');
const result = GridOracle.getExpectedInitialPages(12, 612, 792, 375, 667);
// → { pages: [1, 2, 3], viewBounds: {...}, gridDims: {...} }
```

### Visual Verification Principle

> **"No accounting tricks"** - The test must verify actual pixels, not internal state.

Pass/fail determined by visual inspection of rendered output:

1. Oracle says: "Pages [1, 2, 3] should be visible"
2. Test calculates: "Page 2 should appear at screen region (x1, y1, x2, y2)"
3. Test samples: Actual pixels in that region
4. Decision: Does region contain content (not black/background)?

Invalid shortcuts:
- `pendingJobs.size === 0` (internal state)
- `pageCache.has(key)` (cache state)
- `waitForTimeout(3000)` (arbitrary delay)

---

## Background

See the equivalent file in parent branch(es) for earlier notes. See also Changelog.
