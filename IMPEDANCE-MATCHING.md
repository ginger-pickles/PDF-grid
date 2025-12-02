# Impedance Matching: TileStreamer ↔ OpenSeadragon

**Date**: 2025-12-02
**Objective**: Rearchitect tile delivery to match OSD's progressive loading expectations

---

## Current Impedance Characteristics

### TileStreamer Output Impedance

**Signal type**: 2 discrete resolutions
- `low`: PDF rendered at 0.3x scale (~200 KB per page)
- `high`: PDF rendered at 4.0x scale (~500 KB per page)
- **Ratio**: 13.3x resolution difference (huge gap!)

**Mapping strategy**:
```javascript
// Line 3301: minimapMaxLevel = maxLevel * 0.3
// Line 3550: resolution = level <= minimapMaxLevel ? 'low' : 'high'

// Example: maxLevel = 10
// Levels 0-3  → low (0.3x PDF)
// Levels 4-10 → high (4.0x PDF)
```

**Problem**: Binary output with fallback creates ambiguous signals

### OpenSeadragon Input Impedance

**Signal type**: N pyramid levels (continuous zoom hierarchy)
- Each level = `2^(level - maxLevel)` scale factor
- Example (maxLevel=10):
  - Level 0: 0.000977x (whole grid visible)
  - Level 3: 0.0078x
  - Level 5: 0.03125x
  - Level 7: 0.125x
  - Level 10: 1.0x (full detail)

**Expectations**:
- Each level is **stable** - Level 7 always looks the same
- Each level is **independent** - can be served in any order
- Progressive enhancement via **level replacement**, not tile updates

**Problem**: Expects continuous spectrum, gets binary choice

---

## Impedance Mismatch Symptoms

### Signal Reflection (Vector 12)
```
OSD: "Request Level 7 tile" (expects 0.125x grid scale)
TS:  "Level 7 needs 4x PDF... not ready... serve 0.3x PDF instead"
OSD: "Received Level 7" [caches]
TS:  "4x PDF ready! Invalidate Level 7"
OSD: "I already have Level 7" [ignores]
Result: Standing wave - blurry tile stuck in cache
```

### Signal Distortion (Vector 17)
```
OSD: "Request Level 9 tile at startup"
TS:  "Need pages 1,2,3 at 4x... starting renders"
     "Render order: p2→p1→p3 (non-deterministic)"
     "p2 ready... p1 ready... tile done!"
     "p3 still rendering - CACHE MISS"
Result: Incomplete signal - missing pages in delivered tile
```

---

## Architecture Options

### Option 1: Multi-Resolution Pyramid (Impedance Transformer)

**Concept**: Map PDF resolutions to **separate level ranges**

```javascript
// Instead of binary (low=0-3, high=4-10)
// Use graduated mapping:

function getPDFScaleForLevel(level, maxLevel) {
  const normalizedLevel = level / maxLevel;  // 0.0 to 1.0

  // Exponential curve: 0.25x → 0.5x → 1x → 2x → 4x
  const minScale = 0.25;
  const maxScale = 4.0;
  const scale = minScale * Math.pow(maxScale / minScale, normalizedLevel);

  return scale;
}

// Example results (maxLevel=10):
// Level 0  → 0.25x PDF
// Level 2  → 0.35x PDF
// Level 5  → 1.0x PDF  (sweet spot)
// Level 7  → 2.0x PDF
// Level 10 → 4.0x PDF
```

**Rendering strategy**: Quantize to available resolutions
```javascript
const requestedScale = getPDFScaleForLevel(level, maxLevel);

// Quantize to available resolutions: [0.3, 1.0, 2.0, 4.0]
const availableScales = [0.3, 1.0, 2.0, 4.0];
const targetScale = availableScales.find(s => s >= requestedScale) || 4.0;

// Check if pages at targetScale are ready
if (pagesReadyAt(targetScale)) {
  serveTile(targetScale);
} else {
  // DON'T fallback - queue for later
  queuePendingJob(targetScale);
}
```

**Pros**:
- Smooth impedance matching - each level has appropriate resolution
- No fallback ambiguity - level waits for correct resolution
- More render resolutions = smoother progressive loading

**Cons**:
- Need to render pages at multiple scales (0.3x, 1x, 2x, 4x)
- More cache memory required (4 versions of each page)
- More complex rendering logic

**Memory analysis** (12-page PDF):
```
Current: 12 pages × 2 resolutions = 24 cached canvases
Option 1: 12 pages × 4 resolutions = 48 cached canvases (2x memory)
```

**Optimization**: Only render scales that are actually requested
- Start with 0.3x (for overview)
- Render 1x, 2x, 4x on-demand as user zooms
- Evict lower resolutions as higher ones load

---

### Option 2: Dual Pyramid (Parallel TileSources)

**Concept**: Two separate OSD TileSource instances

```javascript
// Low-res pyramid: Levels 0-10 using 0.3x PDF
const lowResPyramid = {
  maxLevel: 10,
  pdfScale: 0.3,
  getTileUrl: (level, x, y) => `lowres://${level}/${x}/${y}`
};

// High-res pyramid: Levels 0-10 using 4x PDF
const highResPyramid = {
  maxLevel: 10,
  pdfScale: 4.0,
  getTileUrl: (level, x, y) => `highres://${level}/${x}/${y}`
};

// Add both to viewer
viewer.addTiledImage({ tileSource: lowResPyramid, opacity: 1.0 });
viewer.addTiledImage({ tileSource: highResPyramid, opacity: 0.0 });

// As high-res loads, cross-fade
viewer.world.getItemAt(1).setOpacity(1.0);  // Fade in high-res
viewer.world.getItemAt(0).setOpacity(0.0);  // Fade out low-res
```

**Progressive loading**:
1. Low-res pyramid loads immediately (0.3x pages render fast)
2. User sees blurry but complete view
3. High-res pyramid loads in background (4x pages render slower)
4. Cross-fade from low-res to high-res

**Pros**:
- Clean separation - no resolution ambiguity
- Leverages OSD's built-in cross-fade
- Can load low-res immediately, high-res progressively
- Simple logic - no fallback needed

**Cons**:
- OSD renders two complete pyramids (2x draw calls)
- Need to coordinate two TileSource instances
- More complex viewer setup

**Memory**: Same as current (2 resolutions), but both pyramids loaded simultaneously during transition

---

### Option 3: Stable Level Mapping (No Fallback)

**Concept**: Keep current architecture but **eliminate fallback**

```javascript
// Line 3550: Determine resolution
const resolution = level <= this.minimapMaxLevel ? 'low' : 'high';

// In tryGenerateTile (line 3557): CHANGE THIS
const missingPages = neededPages.filter(p => {
  const hasCorrectRes = pageCache.has(`${p}_${resolution}`);
  return !hasCorrectRes;  // ← Don't check fallback!
});

if (missingPages.length > 0) {
  // DON'T serve fallback resolution - queue and wait
  return { ready: false, missingPages, resolution, neededPages, tileBounds };
}
```

**What happens**:
- User zooms in → OSD requests Level 7
- High-res pages not ready → Tile queued, NOT delivered
- **OSD keeps displaying Level 6** (already rendered at lower zoom)
- High-res pages finish → Level 7 tiles complete
- OSD replaces Level 6 with Level 7 (natural progression)

**Pros**:
- Minimal code change (~10 lines)
- Eliminates "wrong resolution" problem completely
- Leverages OSD's built-in tile scaling

**Cons**:
- Slower initial display (must wait for correct resolution)
- User might see scaled-up lower levels during zoom
- No progressive enhancement within a level

**User experience**:
```
Time 0ms:   Load document
Time 100ms: Low-res pages ready → Levels 0-3 display (overview)
Time 200ms: User zooms in
Time 201ms: OSD requests Level 7 → queued (high-res not ready)
            OSD scales up Level 3 tiles temporarily (blurry but immediate)
Time 500ms: High-res pages ready → Level 7 completes → replaces scaled Level 3
```

**This is how OSD is designed to work!** The "scaled-up lower level" is a feature, not a bug.

---

### Option 4: Content-Availability Levels (Dynamic Impedance)

**Concept**: Levels represent **what's currently available**, not target zoom

```javascript
// Dynamic level calculation based on available content
function getMaxAvailableLevel() {
  if (highResPagesReady.size === numPages) {
    return 10;  // All high-res ready - serve full pyramid
  } else if (lowResPagesReady.size === numPages) {
    return 3;   // Only low-res ready - limit to L0-L3
  } else {
    return 0;   // Nothing ready - only L0
  }
}

// In TileSource config:
maxLevel: function() {
  return tileStreamer.getMaxAvailableLevel();
}
```

**Progressive behavior**:
1. Initially: maxLevel=0 → OSD only requests Level 0
2. Low-res ready: maxLevel=3 → OSD requests up to Level 3
3. High-res ready: maxLevel=10 → OSD requests up to Level 10
4. OSD naturally requests higher levels as they become available

**Pros**:
- Impedance self-adjusts to available content
- OSD never requests unavailable levels
- Clean progressive disclosure

**Cons**:
- OSD doesn't support dynamic maxLevel changes well
- Might need to recreate TileSource when maxLevel changes
- Complex coordination between rendering and tile requests

---

## Recommended Architecture: Option 3 (Stable Levels, No Fallback)

### Why Option 3?

**Simplicity**: Minimal code change, maximum impedance matching

**Correctness**: Each level is stable and predictable
- Level 0-3 always use 0.3x PDF
- Level 4-10 always use 4x PDF
- No ambiguity, no "wrong resolution" tiles

**Leverages OSD's design**:
- OSD naturally scales lower levels while waiting for higher levels
- User sees *something* immediately (scaled tiles)
- Smooth upgrade when correct resolution ready

**Performance**:
- No wasted rendering (don't render wrong resolution)
- No cache invalidation churn (no need to upgrade tiles)
- No flicker (no tiledImage.reset() needed)

### Implementation Changes

**File**: `index.html`

**Change 1**: Remove fallback check (line 3557)
```javascript
// BEFORE (checks fallback):
const missingPages = neededPages.filter(p => {
  const hasPrimary = pageCache.has(`${p}_${resolution}`);
  const hasFallback = fallbackCache.has(`${p}_${fallbackRes}`);
  return !hasPrimary && !hasFallback;  // ← Accept fallback
});

// AFTER (strict resolution):
const missingPages = neededPages.filter(p => {
  const hasPrimary = pageCache.has(`${p}_${resolution}`);
  return !hasPrimary;  // ← Only accept correct resolution
});
```

**Change 2**: Remove fallback check in finishPendingJobs (line 3590)
```javascript
// BEFORE:
const stillMissing = job.missingPages.filter(p => {
  const hasPrimary = pageCache.has(`${p}_${job.resolution}`);
  const hasFallback = fallbackCache.has(`${p}_${fallbackRes}`);
  return !hasPrimary && !hasFallback;
});

// AFTER:
const stillMissing = job.missingPages.filter(p => {
  const hasPrimary = pageCache.has(`${p}_${job.resolution}`);
  return !hasPrimary;
});
```

**Change 3**: Remove fallback resolution variables (cleanup)
```javascript
// Delete these lines (3554-3555, 3587-3588):
const fallbackRes = resolution === 'high' ? 'low' : 'high';
const fallbackCache = this.pageStreamer._getPageCache(fallbackRes);
```

**That's it!** ~20 lines changed, Vector 12 solved.

---

## Expected User Experience After Fix

### Before (with fallback):
```
1. User zooms in quickly
2. High-level tiles delivered with low-res content (blurry)
3. High-res pages finish rendering
4. Tiles stay blurry (stuck!) ← VECTOR 12
```

### After (no fallback):
```
1. User zooms in quickly
2. High-level tiles NOT delivered yet (waiting for high-res)
3. OSD scales up low-level tiles (slightly blurry but updating)
4. High-res pages finish rendering
5. High-level tiles delivered with high-res content (sharp!)
6. OSD replaces scaled tiles with native high-res tiles (smooth)
```

**Key difference**: User sees **temporary scaled-up blur** (OSD's doing) instead of **permanent stuck blur** (our cache's fault).

---

## Alternative: Option 1 (Multi-Resolution) for Future

If Option 3's "scaled tile" experience isn't smooth enough, consider Option 1:

**Graduated PDF scales**: 0.3x, 1x, 2x, 4x

**Level mapping**:
- Level 0-2: 0.3x PDF (overview)
- Level 3-5: 1x PDF (comfortable reading)
- Level 6-8: 2x PDF (detailed examination)
- Level 9-10: 4x PDF (maximum detail)

**Progressive rendering strategy**:
1. Pre-render 0.3x (fast, for immediate display)
2. Render 1x on-demand when zooming to comfortable reading level
3. Render 2x, 4x on-demand when zooming further

**Memory**: Only cache what's needed
- Evict 0.3x versions after 1x loaded
- Evict 1x versions after 2x loaded
- Keep only currently-visible resolution + one level up/down

---

## Impedance Matching Summary

| Architecture | Impedance Match | Code Complexity | Memory | User Experience |
|--------------|----------------|-----------------|--------|-----------------|
| Current (fallback) | **Mismatch** | Low | 2x | Broken (stuck tiles) |
| Option 1 (Multi-res) | **Perfect** | High | 4x | Excellent (smooth) |
| Option 2 (Dual pyramid) | **Good** | Medium | 2x | Good (cross-fade) |
| **Option 3 (No fallback)** | **Excellent** | **Very Low** | **2x** | **Good (OSD scaling)** |
| Option 4 (Dynamic) | Good | High | 2x | Good (but complex) |

**Recommendation**: Implement Option 3 immediately (fixes Vector 12 with minimal risk), consider Option 1 for future enhancement if needed.
