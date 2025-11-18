# Testing Bidirectional Rendering Strategy

This document outlines how to test the bidirectional rendering implementation that solves cache thrashing.

## Problem Being Solved

**Scenario:** 126-page PDF with 120-page cache limit
- L2 tiles need ALL 126 pages when zoomed out to show whole grid
- Pages 121-126 evict pages 1-6, then pages 1-6 evict 121-126 (infinite loop)
- Result: 6 pages always missing, manual tile recreation changes which 6

**Solution:** Bidirectional rendering (viewport-first + L0-down progressive)

## Test Prerequisites

1. Load a PDF with **pages > cache size** (e.g., 126 pages with 120-page low-res cache)
2. Open browser console (F12)
3. Ensure `CONFIG.VERBOSE_LOGGING = true` for detailed logs (optional but helpful)

## Diagnostic Functions Available

Three global functions are exposed for testing:

```javascript
// 1. Check background rendering progress
window.backgroundRenderingStatus()
// Returns: { enabled, isRunning, currentLevel, levelProgress, percentComplete, ... }

// 2. Verify no incomplete tiles at a specific level or all levels
window.verifyNoIncompleteTiles(level)
// level = null → check all levels
// level = 2 → check only L2
// Returns: { passed: true/false, issues: [...] }

// 3. Test page-locality batching (verify tiles grouped by page range)
window.testPageLocalityBatching(level)
// level = 2 → shows L2 tile batching
// Returns: { totalTiles, sortedTiles }
```

## Manual Testing Procedure

### Test 1: Verify Background Rendering Starts and Progresses

**Goal:** Confirm background rendering starts from L0 and progresses through levels

**Steps:**
1. Load PDF (e.g., 126-page PDF)
2. Immediately check status:
   ```javascript
   window.backgroundRenderingStatus()
   ```
3. **Expected Result:**
   ```javascript
   {
     enabled: true,
     isRunning: true,
     currentLevel: 0,  // Starts at L0
     levelProgress: "0/1",  // L0 typically has 1-4 tiles
     percentComplete: "0.0",
     maxLevel: 8  // Depends on PDF size
   }
   ```

4. Wait 5-10 seconds and check again
5. **Expected Result:** `currentLevel` increases (0 → 1 → 2 → ...)

**Console logs to watch for:**
```
[Background Rendering] Starting L0-down progressive rendering
[Background Rendering] Level 0: 1 tiles to render
[Background Rendering] Completed level 0
[Background Rendering] Level 1: 4 tiles to render
[Background Rendering] Completed level 1
[Background Rendering] Level 2: 16 tiles to render
...
```

**✓ Pass Criteria:**
- Background rendering starts immediately after PDF load
- Progresses from L0 → L1 → L2 → ... sequentially
- `isRunning: true` during rendering
- `percentComplete` increases over time

---

### Test 2: Verify Page-Locality Batching at L2+

**Goal:** Confirm L2+ tiles are sorted by page range to minimize cache thrashing

**Steps:**
1. Wait for background rendering to reach at least L2
2. Run:
   ```javascript
   window.testPageLocalityBatching(2)
   ```

3. **Expected Output:**
   ```
   [Page-Locality Batching Test] Level 2
   Total tiles at L2: 16

   First 10 tiles (should be grouped by page range):
     1. L2(0,0): pages 1-25
     2. L2(1,0): pages 20-45
     3. L2(2,0): pages 40-65
     4. L2(3,0): pages 60-85
     5. L2(0,1): pages 10-35
     ...
   ```

4. **Verify:** Page ranges should be **grouped** (consecutive tiles need overlapping/adjacent page ranges)

**✓ Pass Criteria:**
- Tiles are sorted by `minPage` (primary) then `maxPage` (secondary)
- Consecutive tiles in output have similar page ranges
- NOT randomly ordered (would cause cache thrashing)

**❌ Fail Example:**
```
1. L2(0,0): pages 1-25
2. L2(3,3): pages 100-126   ← BAD: jumps to end
3. L2(0,1): pages 10-35     ← BAD: jumps back to start
```

---

### Test 3: Verify No Incomplete Tiles After L0-L2 Complete

**Goal:** Confirm cache thrashing is solved (all tiles at L2 have all pages)

**Steps:**
1. Load 126-page PDF
2. Wait for background rendering to complete L0, L1, L2
   ```javascript
   // Check status every few seconds
   window.backgroundRenderingStatus()
   // Wait until currentLevel > 2
   ```

3. Zoom out to L2 (show whole grid in viewport)
4. Run verification:
   ```javascript
   window.verifyNoIncompleteTiles(2)
   ```

5. **Expected Output:**
   ```
   [Tile Quality Check] Level 2
   Total quality issues: 0
   ✓ No quality issues found - all tiles complete!
   ```

**✓ Pass Criteria:**
- `passed: true`
- `issues: []` (no missing pages at L2)
- All L2 tiles rendered with complete page sets

**❌ Fail Example (OLD BEHAVIOR):**
```
[Tile Quality Check] Level 2
Total quality issues: 6

Issues by level:
  L2: 6 issues
    2_p121-126: missing pages [121,122,123,124,125,126]
    2_p1-6: missing pages [1,2,3,4,5,6]
```

---

### Test 4: Verify Viewport-First Prioritization

**Goal:** Confirm viewport tiles render immediately during user interaction

**Steps:**
1. Load PDF and zoom in to L5 (deep zoom)
2. **Observe:** Viewport tiles should appear immediately (not waiting for background L2 to finish)
3. Check console logs for immediate tile rendering:
   ```
   [TileStreamer] RENDER FULL: 5_p45_x2_y3 (pages: 45, resolution: high) - cached
   ```

4. Pan around while background rendering is still at L2
5. **Expected:** New viewport tiles render immediately as you pan

**✓ Pass Criteria:**
- Viewport tiles visible immediately on zoom
- Pan is responsive (no waiting for background rendering)
- Background rendering pauses during pan/zoom (check console logs)

**Console logs to watch for:**
```
[Background Rendering] Stopping at level 2  ← Pauses during interaction
... (user pans/zooms) ...
[Background Rendering] Resuming from level 2  ← Resumes after 500ms
```

---

### Test 5: Verify Background Rendering Pauses/Resumes

**Goal:** Confirm background rendering doesn't interfere with user interaction

**Steps:**
1. Load PDF and start panning/zooming immediately
2. While panning, check:
   ```javascript
   window.backgroundRenderingStatus()
   ```

3. **During interaction:**
   ```javascript
   { isRunning: false, ... }  // Should stop
   ```

4. Stop panning and wait 1 second
5. **After interaction settles:**
   ```javascript
   { isRunning: true, ... }  // Should resume
   ```

**✓ Pass Criteria:**
- `isRunning: false` during pan/zoom
- `isRunning: true` resumes ~500ms after interaction stops
- Viewport remains responsive during background rendering

---

## Automated Test Scenarios

### Test Scenario 1: Cache Thrashing Verification

```javascript
// Automated test for 126-page PDF with 120-page cache
async function testNoIncompleteTilesAtL2() {
  // Wait for background rendering to complete L2
  await waitForLevel(2);

  // Zoom to L2
  viewer.viewport.zoomTo(getZoomForLevel(2));

  // Verify no incomplete tiles
  const result = window.verifyNoIncompleteTiles(2);

  assert(result.passed === true, 'L2 should have no incomplete tiles');
  assert(result.issues.length === 0, 'L2 should have no missing pages');
}

function waitForLevel(targetLevel) {
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const status = window.backgroundRenderingStatus();
      if (status.currentLevel > targetLevel) {
        clearInterval(interval);
        resolve();
      }
    }, 100);
  });
}
```

### Test Scenario 2: Page-Locality Batching

```javascript
function testPageLocalityBatching() {
  const result = window.testPageLocalityBatching(2);

  // Verify tiles are sorted by page range
  const scale = Math.pow(2, 2);
  const tileWidthInGrid = window.tileStreamerRef.tileWidth / scale;
  const tileHeightInGrid = window.tileStreamerRef.tileHeight / scale;

  const pageRanges = result.sortedTiles.slice(0, 20).map(tile => {
    const tileLeft = tile.x * tileWidthInGrid;
    const tileTop = tile.y * tileHeightInGrid;
    const tileRight = Math.min(tileLeft + tileWidthInGrid, window.tileStreamerRef.gridDims.totalWidth);
    const tileBottom = Math.min(tileTop + tileHeightInGrid, window.tileStreamerRef.gridDims.totalHeight);

    const pages = window.tileStreamerRef._calculateIntersectingPages(tileLeft, tileTop, tileRight, tileBottom);
    return { minPage: Math.min(...pages), maxPage: Math.max(...pages) };
  });

  // Verify consecutive tiles have similar page ranges (sorted by minPage)
  for (let i = 1; i < pageRanges.length; i++) {
    assert(
      pageRanges[i].minPage >= pageRanges[i - 1].minPage,
      `Tile ${i} minPage should be >= previous tile minPage`
    );
  }

  console.log('✓ Page-locality batching working correctly');
}
```

---

## Expected Console Output (Success)

When loading a 126-page PDF with bidirectional rendering working correctly:

```
[Background Rendering] Starting L0-down progressive rendering
[Background Rendering] Level 0: 1 tiles to render
[TileStreamer] RENDER FULL: 0_p1-126 (pages: 1,2,3,...,126, resolution: low) - cached
[Background Rendering] Completed level 0

[Background Rendering] Level 1: 4 tiles to render
[TileStreamer] RENDER FULL: 1_p1-65 (pages: 1,2,3,...,65, resolution: low) - cached
[TileStreamer] RENDER FULL: 1_p60-126 (pages: 60,61,...,126, resolution: low) - cached
[Background Rendering] Completed level 1

[Background Rendering] Level 2: 16 tiles to render
[TileStreamer] RENDER FULL: 2_p1-35 (pages: 1,2,...,35, resolution: low) - cached
[TileStreamer] RENDER FULL: 2_p30-65 (pages: 30,31,...,65, resolution: low) - cached
...
[Background Rendering] Completed level 2
```

**Key observations:**
1. All tiles rendered with status `FULL` (not `FALLBACK`)
2. No missing pages reported
3. Levels complete sequentially (0 → 1 → 2)
4. L2 completes without cache thrashing

---

## Failure Indicators

**❌ Cache Thrashing Still Occurring:**
```
[TileStreamer] PARTIAL TILE: 2_p1-126 has 120/126 pages (missing: 121,122,123,124,125,126)
[TileStreamer] PARTIAL TILE: 2_p1-126 has 120/126 pages (missing: 1,2,3,4,5,6)  ← Pages changed!
```

**❌ Background Rendering Not Starting:**
```javascript
window.backgroundRenderingStatus()
// { enabled: false, isRunning: false }
```

**❌ Tiles Not Sorted by Page-Locality:**
```
1. L2(0,0): pages 1-25
2. L2(3,3): pages 100-126  ← Jumps to end (cache thrashing!)
3. L2(0,1): pages 10-35    ← Jumps back (cache thrashing!)
```

---

## Quick Test Commands

```javascript
// 1. Check if background rendering is working
window.backgroundRenderingStatus()

// 2. Verify no incomplete tiles at L2 (the critical level)
window.verifyNoIncompleteTiles(2)

// 3. Test page-locality batching
window.testPageLocalityBatching(2)

// 4. Check all levels for incomplete tiles
window.verifyNoIncompleteTiles()

// 5. Manually stop/resume background rendering (for testing)
window.tileStreamerRef.stopBackgroundRendering()
window.tileStreamerRef.resumeBackgroundRendering()
```

---

## Summary

**Pass Criteria for Bidirectional Rendering:**
1. ✓ Background rendering starts from L0 and progresses sequentially
2. ✓ L2+ tiles sorted by page-locality (consecutive page ranges)
3. ✓ No incomplete tiles at L2 after background rendering completes L2
4. ✓ Viewport tiles render immediately during user interaction
5. ✓ Background rendering pauses during interaction, resumes after 500ms
6. ✓ No cache thrashing (same 6 pages always missing)

**The fix is successful if:**
- 126-page PDF loads completely at L2 with 120-page cache
- No missing pages at L2 (verified with `verifyNoIncompleteTiles(2)`)
- Page-locality batching prevents cache thrashing
- User interaction remains snappy (viewport-first prioritization)
