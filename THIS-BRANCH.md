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

### Completed Vectors (Summary)

| Vector | Problem | Solution |
|--------|---------|----------|
| **V1**: Race Condition | PDF.js renders pages non-deterministically; tiles complete before pages ready | Queue tiles until pages available (V2) |
| **V2**: Composition Integrity | Incomplete tiles delivered with missing/wrong-res pages | Abort + queue in `pendingJobs` until all pages ready |
| **V3**: Reset Elimination | `tiledImage.reset()` caused flicker | Removed; tiles wait instead of reset + retry |
| **V12**: Resolution Fallback | Wrong-res tiles cached and stuck | No fallback; OSD scales lower levels while waiting |
| **V13**: lastDrawn Feedback | Viewport prediction inaccurate; pages rendered for wrong tiles | Use OSD `lastDrawn` as feed-forward (priority) and feed-back (quality) |

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

## Performance Opportunities

### Current Pipeline

```
PDF.js → Canvas → JPEG → Image Cache → Tile Composition → JPEG → Tile Cache → OSD
         ^                                    ^
         |                                    |
   Semaphore throttled              Single shared canvas
   (5 high-res, 10 low-res)         iterates ALL grid cells
```

### Analysis (2025-12-19)

| Area | Current | Opportunity | Impact |
|------|---------|-------------|--------|
| **Grid periodicity** | Full grid scan per tile | Pre-compute repeating patterns | High - O(n²) → O(1) |
| **Canvas pooling** | New canvas per render | Reuse pool of canvases | Medium - reduce GC |
| **Web Workers** | Main thread renders | OffscreenCanvas in workers | High - unblock UI |
| **Spatial indexing** | O(rows×cols) per tile | R-tree or grid hash | Medium - faster lookups |
| **Tile batching** | One tile at a time | Batch tiles sharing pages | Medium - reduce lookups |

### Quick Wins

1. Tune semaphore limits based on device capability
2. Prefetch pages for tiles OSD will request next (extrapolate from lastDrawn)
3. Reduce JPEG quality for minimap tiles (currently same as high-res)

### Deeper Work

1. **Exploit periodicity** - diagonal pattern repeats; tiles at equivalent positions share identical page combinations
2. **Canvas pooling** - avoid allocation churn during page rendering
3. **Web Worker offloading** - requires OffscreenCanvas support

---

## Code Analysis

### Dead Code Removed

| Component                    | Purpose                        |
|------------------------------|--------------------------------|
| `_renderBlankTile()`         | Red stripe placeholder         |
| `inspectVisual()`            | Stripe pattern detector        |
| Auto-Inspector               | Periodic stripe check + heal   |
| `FALLBACK_RENDERING_ENABLED` | Config toggle for fallback     |
| `_scheduleReset()`           | Debounced tiledImage.reset()   |
| Fallback status check        | getVisibleTiles() 'fallback' filter |

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
