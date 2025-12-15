# Vector 12: Resolution Fallback - Deep Analysis

**Date**: 2025-12-02
**Status**: Root cause identified, solution proposed

---

## ROOT CAUSE: Tile Cache Keys Missing Resolution

### The Smoking Gun (index.html:2281)

```javascript
const key = `${level}_${fingerprint}`;  // ❌ NO RESOLUTION IN KEY!
ts.tileCache.set(key, tileUrl);
```

**Cache key format**: `"7_1-3"` (level 7, pages 1-3)
**Missing**: Whether tile was made with low-res or high-res pages

---

## How the Bug Manifests

### Scenario: User Zooms In

1. **Initial state**: Viewing at low zoom (level 3), low-res pages cached
2. **User zooms in**: OSD requests level 7 tiles (high zoom)
3. **Resolution determined** (line 3550): `resolution = 'high'` ✓ Correct!
4. **High-res pages not ready**: Falls back to low-res (lines 3554-3560) ✓ Correct!
5. **Tile rendered**: Uses low-res content, looks blurry
6. **Tile cached** (line 2313): Key = `"7_1-3"` (no resolution marker!)
7. **High-res pages finish rendering**: Invalidation called (line 829)
8. **Invalidation runs** (line 2976): Deletes tile `"7_1-3"` from cache ✓
9. **BUT**: OSD has its own tile cache - it doesn't know about invalidation
10. **User pans slightly**: OSD re-requests tile, finds it in OSD's cache
11. **Result**: Stuck displaying blurry low-res content at high zoom

---

## Contributing Problems

### Problem 1: Resolution Not Tracked in Cache

**Current**: Tile cache key = `level_fingerprint`
**Needed**: Tile cache key = `level_fingerprint_actualResolution`

Without resolution in the key, can't distinguish:
- Tile at level 7 made with low-res pages
- Tile at level 7 made with high-res pages

### Problem 2: Invalidation Ignores Resolution

**Function signature** (line 2957):
```javascript
_invalidateTilesUsingPages(pageNums, resolution)  // resolution parameter EXISTS
```

**But parameter never used!** (lines 2968-2983)
- Only checks if tile uses the page numbers
- Doesn't check if tile was made with wrong resolution
- Invalidates ALL tiles with those pages, not just outdated ones

### Problem 3: OSD's Internal Cache

Even when we invalidate our tile cache:
- OSD keeps tiles in its own cache
- OSD won't re-request tiles it already has
- Our invalidation is invisible to OSD

**Current workaround**: `tiledImage.reset()` nukes OSD's cache
- But causes visible flicker (blank gap)
- Only called for retries (Vector 2), not for resolution upgrades

### Problem 4: No Resolution Upgrade Tracking

**Vector 2 solved missing pages**:
- Tracks `pendingRetries` - tiles waiting for missing pages
- When page renders, checks `pendingRetries`, calls `_forceRetryReset()`

**Vector 12 has no equivalent**:
- No tracking of tiles using fallback resolution
- When high-res page renders, doesn't know which tiles need upgrading
- No trigger to call `_forceRetryReset()` for resolution upgrades

### Problem 5: Mixed Resolution Tiles

If tile needs pages [1, 2, 3]:
- Page 1 available at high-res
- Pages 2, 3 only at low-res
- Tile rendered with mixed resolution

Later when pages 2, 3 render at high-res:
- No way to detect tile needs partial upgrade
- Tile stays cached with mixed resolution

---

## Why recreateTiledImage() Existed

Document mentions `recreateTiledImage()` as a workaround that:
- Removes entire TiledImage
- Waits 50ms
- Re-adds TiledImage
- Forces OSD to start fresh

**This was a hack because proper invalidation doesn't work.**

It's been replaced by `_forceRetryReset()` (line 2887) which does `tiledImage.reset()`, but only gets called for pending retries, not resolution upgrades.

---

## PROPOSED SOLUTION

### Stage 1: Track Resolution in Tile Metadata (NOT in cache key)

**Problem with adding resolution to cache key**:
- Would need to regenerate ALL cache keys throughout codebase
- Complex fingerprint calculation would get messier
- Cache lookups would need resolution parameter everywhere

**Better approach**: Track resolution separately

```javascript
// NEW: Parallel map to track tile resolution
this.tileResolutions = new Map(); // Key: cacheKey → actualResolution

// When caching tile (line 2313)
const key = `${level}_${fingerprint}`;
const actualResolution = determineActualUsedResolution(neededPages, resolution);
ts.tileCache.set(key, tileUrl);
ts.tileResolutions.set(key, actualResolution); // NEW

function determineActualUsedResolution(neededPages, requestedResolution) {
  const pageCache = pageStreamer._getPageCache(requestedResolution);
  const allAvailableAtRequested = neededPages.every(p =>
    pageCache.has(`${p}_${requestedResolution}`)
  );
  return allAvailableAtRequested ? requestedResolution : 'fallback';
}
```

### Stage 2: Make Invalidation Resolution-Aware

```javascript
_invalidateTilesUsingPages(pageNums, resolution) {
  const ts = this.tileStreamer;
  const pageSet = new Set(pageNums);
  let invalidated = 0;

  for (const [key, value] of ts.tileCache.cache.entries()) {
    const pageMatch = key.match(/^\d+_(\d+)(?:-(\d+))?/);
    if (pageMatch) {
      const firstPage = parseInt(pageMatch[1]);
      const lastPage = pageMatch[2] ? parseInt(pageMatch[2]) : firstPage;

      // Check if tile uses any of these pages
      let usesThesPages = false;
      for (let p = firstPage; p <= lastPage; p++) {
        if (pageSet.has(p)) {
          usesThesPages = true;
          break;
        }
      }

      if (usesThesPages) {
        // NEW: Check if tile needs resolution upgrade
        const tileResolution = ts.tileResolutions.get(key);
        const needsUpgrade = (
          tileResolution === 'fallback' && resolution === 'high'
        );

        if (needsUpgrade) {
          ts.tileCache.cache.delete(key);
          ts.tileResolutions.delete(key); // Clean up tracking
          invalidated++;

          if (CONFIG.VERBOSE_LOGGING) {
            console.log(`[RESOLUTION UPGRADE] Invalidated ${key} (low→high)`);
          }
        }
      }
    }
  }
}
```

### Stage 3: Track Resolution Upgrades (Like Vector 2 Retries)

```javascript
// In TileStreamer constructor (line 3007)
this.pendingUpgrades = new Map(); // Key: "pageNum_high" → Set of tile keys

// In _renderTileToContext when using fallback
if (actualResolution === 'fallback' && requestedResolution === 'high') {
  // Track this tile as needing upgrade
  neededPages.forEach(pageNum => {
    const upgradeKey = `${pageNum}_high`;
    if (!this.pendingUpgrades.has(upgradeKey)) {
      this.pendingUpgrades.set(upgradeKey, new Set());
    }
    this.pendingUpgrades.get(upgradeKey).add(cacheKey);
  });
}

// In renderPage() completion (line 833), ADD:
const upgradeKey = `${pageNum}_${resolution}`;
const pendingTiles = window.tileStreamerRef.pendingUpgrades.get(upgradeKey);
if (pendingTiles && pendingTiles.size > 0) {
  console.log(`[UPGRADE TRIGGERED] page ${pageNum} ${resolution} ready, ${pendingTiles.size} tiles to upgrade`);

  // Invalidate tiles needing upgrade
  pendingTiles.forEach(tileKey => {
    window.tileStreamerRef.tileCache.cache.delete(tileKey);
    window.tileStreamerRef.tileResolutions.delete(tileKey);
  });

  window.tileStreamerRef.pendingUpgrades.delete(upgradeKey);

  // Force OSD reset (like Vector 2)
  window.tileStreamerRef.cacheManager._forceRetryReset();
}
```

### Stage 4: Surgical Reset Instead of Full Reset

**Problem**: `_forceRetryReset()` calls `tiledImage.reset()` which nukes ALL tiles.

**Better**: Only reset tiles that need upgrading.

**Challenge**: OSD doesn't provide per-tile invalidation API.

**Options**:
A. Accept brief flicker from full reset (current approach)
B. Investigate OSD's `tile.loaded = false` or `tile.exists = false` (Vector 20)
C. Don't use fallback - wait for correct resolution (Vector 19 placeholders)

---

## ALTERNATIVE: Eliminate Fallback (Radical)

Instead of fallback + upgrade complexity:

```javascript
// In tryGenerateTile (line 3557)
const missingPages = neededPages.filter(p => {
  const hasCorrectRes = pageCache.has(`${p}_${resolution}`);
  return !hasCorrectRes; // DON'T check fallback!
});

if (missingPages.length > 0) {
  // Show placeholder (Vector 19) instead of fallback
  context.fillStyle = 'rgb(240, 240, 240)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  // Don't finish - wait for correct resolution
  return { ready: false, missingPages, resolution, neededPages, tileBounds };
}
```

**Pros**:
- Deterministic: level 7 always shows high-res (no guessing)
- No upgrade complexity
- No stuck tiles

**Cons**:
- Slower initial display (gray boxes while rendering)
- Loses progressive enhancement benefit

---

## RECOMMENDED IMPLEMENTATION PATH

### Phase 1: Quick Fix (Stages 1-2)
- Add `tileResolutions` Map to track actual resolution used
- Make `_invalidateTilesUsingPages()` check resolution
- **Result**: Tiles get invalidated correctly, but OSD still caches them

### Phase 2: Upgrade Tracking (Stage 3)
- Add `pendingUpgrades` Map (like `pendingRetries`)
- Track tiles using fallback resolution
- Trigger `_forceRetryReset()` when high-res ready
- **Result**: Tiles upgrade, but with brief flicker

### Phase 3: Optimize (Stage 4 or Alternative)
- Either: Find way to do surgical OSD reset
- Or: Eliminate fallback, use placeholders
- **Result**: Smooth upgrades without flicker

---

## ESTIMATED COMPLEXITY

**Phase 1**: ~50 lines changed, low risk
**Phase 2**: ~100 lines changed, medium risk (mirrors Vector 2)
**Phase 3**: High complexity, depends on approach

**Recommendation**: Implement Phase 1+2, measure results, then decide Phase 3.

---

## KEY INSIGHT

Vector 2 solved "missing pages" but created "wrong resolution" problem.

The retry mechanism works because it tracks tiles waiting for missing pages.
Resolution upgrades need the same tracking pattern for tiles using fallback resolution.

**The architecture exists - it just needs to be applied to resolution upgrades.**
