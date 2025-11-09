# Selective Tile Invalidation Attempts

## Problem Statement

During progressive PDF loading, we need to update tiles as new pages are rendered. The original implementation recreated the entire TiledImage every 3 pages, which caused console warnings:

```
Ignoring tile 1/1_0 loaded before reset: data:image/...
```

These warnings occur because tiles from the old TiledImage continue loading after the TiledImage is removed.

## Goal

Update only the tiles that contain newly rendered pages, avoiding:
- Full TiledImage recreation
- Console warnings
- Unnecessary tile regeneration
- Blank tiles at level 0 zoom

---

## Attempt 1: Suppress Warnings with debugMode

**Approach:** Set `debugMode: false` in OpenSeadragon viewer config

**Code:**
```javascript
const viewerConfig = {
  debugMode: false, // Suppress warnings, keep errors
  // ... other config
};
```

**Result:** ❌ Hides symptoms, doesn't solve root cause

**Reason:** Warnings are suppressed but the underlying problem (TiledImage recreation) remains.

---

## Attempt 2: Use tiledImage.reset() Instead of Recreation

**Approach:** Call `reset()` on existing TiledImage instead of removing/re-adding

**Code:**
```javascript
const tiledImage = viewer.world.getItemAt(0);
tiledImage.reset();
```

**Result:** ❌ Blank tiles at level 0 zoom

**Reason:** `reset()` clears the cache but doesn't trigger proper re-rendering of level 0 tiles. Tiles only appear when zoomed in.

**Source:** [OpenSeadragon.TiledImage Documentation](https://openseadragon.github.io/docs/OpenSeadragon.TiledImage.html)

---

## Attempt 3: Use viewer.world.resetItems()

**Approach:** Use World-level reset method

**Code:**
```javascript
viewer.world.resetItems();
```

**Result:** ❌ Same as Attempt 2 - blank level 0 tiles

**Reason:** Same underlying issue as `tiledImage.reset()`.

**Source:** [OpenSeadragon.World.resetItems()](https://openseadragon.github.io/docs/OpenSeadragon.World.html#resetItems)

---

## Attempt 4: Improved TiledImage Recreation Order

**Approach:** Add new TiledImage FIRST, then remove old one in success callback

**Code:**
```javascript
viewer.addTiledImage({
  tileSource: tileSource.getOSDConfig(),
  x: currentBounds ? currentBounds.x : 0,
  y: currentBounds ? currentBounds.y : 0,
  width: currentBounds ? currentBounds.width : 1,
  success: function() {
    if (oldTiledImage) {
      viewer.world.removeItem(oldTiledImage);
    }
  }
});
```

**Result:** ✅ Partial success
- Level 0 tiles update properly
- Faster, less flicker
- Still occasional "Ignoring tile..." warnings

**Reason:** Reduces gap between old/new TiledImage but doesn't eliminate it. Some tiles still load after removal.

**Source:** [GitHub Issue - OpenSeadragon/openseadragon#1742](https://github.com/openseadragon/openseadragon/issues/1742) (Recommended pattern: add first, remove in callback)

---

## Attempt 5: Custom clearTile() Prototype Extension

**Approach:** Add custom method to OSD's TileCache to clear specific tiles

**Code:**
```javascript
OpenSeadragon.TileCache.prototype.clearTile = function(tile) {
  OpenSeadragon.console.assert(tile, '[TileCache.clearTile] tile is required');
  var tileRecord;
  for (var i = 0; i < this._tilesLoaded.length; ++i) {
    tileRecord = this._tilesLoaded[i];
    if (tileRecord.tile === tile) {
      this._unloadTile(tileRecord);
      this._tilesLoaded.splice(i, 1);
      return;
    }
  }
};

// Usage:
viewer.tileCache.clearTile(tile);
```

**Infrastructure added:**
- `incompleteTiles` Map - track tiles and their tile objects
- `dataUrlToKey` Map - map dataUrls to tile keys
- `tile-loaded` event listener - capture tile object references
- Clear affected tiles after rendering pages

**Result:** ❌ Failed with errors
- `tileSource.cache.remove is not a function` (fixed by adding `delete()` method)
- clearTile() doesn't work as expected
- Relies on private API (`_tilesLoaded`)

**Reason:** The prototype extension accesses OSD's internal/private APIs which are not officially supported and may not work correctly.

**Source:** [Stack Overflow - OpenSeadragon update specific tiles](https://stackoverflow.com/questions/38635032/openseadragon-update-specific-tiles/38705163)

---

## Attempt 6: Timestamped URLs (Version-Based Cache Busting)

**Approach:** Add version parameter to tile URLs; increment version for affected tiles

**Code:**
```javascript
// In CustomTileSource:
this.tileVersions = new Map(); // track version per tile

generateTile(level, x, y) {
  const baseKey = `${level}_${x}_${y}`;
  const version = this.tileVersions.get(baseKey) || 0;
  const key = `${baseKey}_v${version}`;

  // Check cache with versioned key
  const cached = this.cache.get(key);
  if (cached) return cached;

  // Generate and cache tile
  // ...
}

// After rendering pages:
for (const [baseKey, missingPages] of tileSource.incompleteTiles) {
  if (needsUpdate) {
    const currentVersion = tileSource.tileVersions.get(baseKey) || 0;
    tileSource.tileVersions.set(baseKey, currentVersion + 1);
  }
}

viewer.world.update();
```

**Result:** ❌ Blank level 0 tiles (same as Attempt 2 & 3)

**Reason:** Version bumping changes the URL, but OSD doesn't automatically re-request tiles. The old tiles remain in OSD's cache. Calling `viewer.world.update()` alone doesn't force re-requests.

**Note:** This is a standard web cache-busting technique, but doesn't work here because OSD's tile cache is internal and not based on HTTP caching.

---

## Attempt 7: Timestamped URLs + clearTilesFor()

**Approach:** Combine version bumping with official `clearTilesFor()` API

**Code:**
```javascript
// After incrementing versions:
if (tilesInvalidated > 0) {
  const tiledImage = viewer.world.getItemAt(0);
  if (tiledImage) {
    viewer.tileCache.clearTilesFor(tiledImage); // Official API
  }
}
```

**Result:** ❌ Blank level 0 tiles (same issue again)

**Reason:** `clearTilesFor()` clears ALL tiles for the TiledImage, not just specific ones. When combined with version bumping, OSD requests tiles with new URLs, but our cache has them under old versioned keys. The regeneration doesn't happen correctly for level 0 tiles.

**Source:** [OpenSeadragon.TileCache Documentation](https://openseadragon.github.io/docs/OpenSeadragon.TileCache.html) - `clearTilesFor(tiledImage)` method

---

## Key Findings

### OpenSeadragon TileCache API

Official methods available:
- `cacheTile(options)` - Cache tiles with automatic eviction
- `clearTilesFor(tiledImage)` - Clear ALL tiles for a TiledImage (not selective)
- `numTilesLoaded()` - Get count of loaded tiles

**No selective tile invalidation in public API.**

### The Level 0 Tiles Problem

All approaches that avoid full TiledImage recreation result in blank level 0 tiles:
- `reset()`
- `resetItems()`
- Version bumping + `clearTilesFor()`

**Hypothesis:** OSD's rendering pipeline doesn't properly trigger level 0 tile re-requests after cache clearing unless the TiledImage is fully recreated.

### Working Solution (Current)

**Approach 4** (improved TiledImage recreation order) works best:
- ✅ Level 0 tiles update correctly
- ✅ Faster, less flicker than original
- ⚠️ Still occasional warnings (reduced)
- Uses official APIs only

---

## Possible Future Directions

### Option A: Accept Approach 4 as "good enough"
- Keep improved recreation order
- Use `debugMode: false` to suppress remaining warnings
- Document known limitation

### Option B: Investigate OSD's rendering pipeline
- Deep dive into OSD source code
- Understand why level 0 tiles don't refresh after cache clearing
- Possibly contribute fix to OSD upstream

### Option C: Two-tier rendering approach
- Render ALL pages at low-res first (fast, complete grid)
- Then progressive high-res on zoom
- Different architecture, might avoid invalidation problem entirely
- See: `PROGRESSIVE_LOADING_NOTES.md`

### Option D: Fork and patch OpenSeadragon
- Add proper selective tile invalidation API
- Maintain custom OSD build
- High maintenance cost

---

## Related Documentation

- [OpenSeadragon API Documentation](https://openseadragon.github.io/docs/)
- [OpenSeadragon GitHub Issues](https://github.com/openseadragon/openseadragon/issues)
- [Stack Overflow - Update specific tiles](https://stackoverflow.com/questions/38635032/openseadragon-update-specific-tiles/38705163)
- Internal: `PROGRESSIVE_LOADING_NOTES.md`
- Internal: `notes.md` - Performance optimization ideas
- Internal: `TODO.md` - Feature roadmap

---

## Current State (v1.6.11)

**Implementation:** Approach 4 (improved TiledImage recreation order)

**Code location:** `index.html:1622-1676`

**Status:** Working but with occasional warnings

**Settings:**
- `debugMode: false` - Suppresses OSD warnings
- Recreation frequency: Every 3 pages
- Progressive loading: Enabled by default

**Known issues:**
- Occasional "Ignoring tile..." warnings when tiles load between TiledImage swap
- Version tracking infrastructure still present but unused
