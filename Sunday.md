# Sunday Issues

## 1. Stale Tiles in Initial View

**Symptom**: Striped tiles appear in the initial view. They disappear upon zooming out or in.

**Suspected cause**: Something not working with on-demand rendering or tiledImage recreation. Likely sending striped placeholder tiles when requested, but not doing the right things to replace and display them once real content is available.

## 2. Fallback Renders in Deep-Zoom Tiles

**Symptom**: Low-res tiles appearing at high-zoom levels instead of being replaced with hi-res tiles.

**Suspected cause**: Unknown.

---

## Fix Strategy

Two directions to approach fixes:

### A. Preventive: Get in Front of the Issue
- Understand the root cause
- Fix the logic that creates the problem in the first place

### B. Corrective: Feedback Control
- Detect when the issue has occurred
- Apply correction to replace/refresh affected tiles

---

## Deep Analysis

### The Core Problem: Intermediary vs. Actual Display

Previous attempts used internal "tile health checks" and "tile registries" - but these measure what **we think** OSD has, not what **OSD actually displays**. There's a disconnect between:

1. Our tile generation/tracking code
2. OSD's internal tile cache and display logic
3. The actual rendered pixels on screen

Measuring intermediaries (1 or 2) doesn't catch the real problem. True feedback control requires measuring **the output** (3).

### Why Over-Compensation Hurts Us

If our CustomTileSource returns a striped placeholder when content isn't ready, OSD thinks: "I have a valid tile for this position." It caches it. It won't re-request.

We're being too "helpful" - trying to always return something. This prevents OSD's natural fallback/retry behavior from working.

**Current (problematic) flow:**
```
OSD requests tile → We return placeholder → OSD caches it → Page renders → ??? OSD never asks again
```

**Better flow:**
```
OSD requests tile → Content not ready → Return null/signal "not ready" → OSD uses its own fallback → Page renders → OSD re-requests → We return real content
```

### Two-Pronged Approach

#### Prong 1: Feed OSD Better (Preventive)

**Don't over-compensate.** Let OSD handle fallback when content isn't ready:
- Return `null` or signal unavailability when page not yet rendered
- Only return actual tile data when it's genuinely ready
- Trust OSD's built-in fallback (upscale lower-level tiles)
- This keeps OSD in "waiting for better tile" state

**Question to investigate:** What does OSD expect when a tile isn't ready? Does returning null trigger retry? Is there a "tile loading" state we should use?

#### Prong 2: Measure Actual Display (Corrective)

**Don't measure our tile cache. Measure the screen.**

Options for measuring actual display:
1. **Canvas pixel sampling** - Read pixels from OSD's canvas element, detect stripe patterns or blur
2. **Resolution analysis** - At high zoom, sharp edges expected. Blurry = wrong resolution tile displayed
3. **Pattern detection** - Our placeholder stripes have known pattern, can detect them in output

When bad tiles detected in viewport:
- Trigger targeted refresh
- Or full `tiledImage.reset()` as nuclear option
- Or minimal zoom jiggle to force OSD re-request

### Questions to Resolve

1. What is OSD's expected behavior when getTileUrl returns null vs placeholder?
2. How does OSD decide when to re-request a tile vs use cached?
3. Can we hook into OSD's tile-loaded event to verify what it actually received?
4. What's the simplest way to sample the actual viewer canvas?

---

## Deeper Thinking: The Feedback Control Model

### What We're Actually Building

A **closed-loop control system** for tile quality:

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┴───────┐
│  Page    │───▶│  Tile    │───▶│   OSD    │───▶│  Actual Canvas │
│ Renderer │    │ Generator│    │  Cache   │    │    (Output)    │
└──────────┘    └──────────┘    └──────────┘    └────────┬───────┘
                    ▲                                     │
                    │         ┌──────────────┐            │
                    └─────────│   Feedback   │◀───────────┘
                              │   Sensor     │
                              └──────────────┘
```

The **sensor** must measure the actual canvas output - not any intermediate stage.

### Why Stripe Detection is a Good Sensor

Our placeholder stripes are a **known signal** we inject. They're like a "test pattern" in broadcast TV. If we see stripes in output:
- We know exactly what went wrong (placeholder not replaced)
- We can detect them with simple pattern matching
- High confidence: stripes = bug, no stripes = probably fine

### Resolution Mismatch is Harder to Detect

For issue #2 (low-res at high zoom), detection is trickier:
- Need to know "what resolution should this viewport region be?"
- Compare expected sharpness vs actual
- Could use edge detection, frequency analysis, or comparison to known-good render

**Simpler approach:** If we stop over-compensating (Prong 1), OSD's natural behavior should handle this. Focus detection on the striped placeholder problem first.

### Implementation Sketch: Canvas Health Monitor

```javascript
class CanvasHealthMonitor {
  constructor(viewer) {
    this.viewer = viewer;
    this.stripePattern = this.generateStripeSignature();
  }

  // Run after viewport settles
  checkHealth() {
    const canvas = this.viewer.drawer.canvas;
    const ctx = canvas.getContext('2d');
    const samples = this.sampleViewport(ctx);

    for (const sample of samples) {
      if (this.detectStripes(sample)) {
        return { healthy: false, reason: 'stripes', location: sample.location };
      }
    }
    return { healthy: true };
  }

  // Sample several points across visible viewport
  sampleViewport(ctx) { /* ... */ }

  // Check if pixel region matches stripe pattern
  detectStripes(sample) { /* ... */ }

  // Trigger correction
  heal() {
    // Option A: Nuclear - reset everything
    this.viewer.world.getItemAt(0).reset();

    // Option B: Surgical - force redraw
    this.viewer.forceRedraw();

    // Option C: Trigger re-request for specific tiles
    // (if OSD supports it)
  }
}
```

### The Stripe Detection Algorithm

Our placeholder has alternating diagonal stripes. To detect:

1. Sample a small region (e.g., 32x32 pixels)
2. Check for periodic intensity variation along diagonals
3. Compare period to known stripe frequency
4. If match confidence > threshold → stripes detected

This is robust: real PDF content rarely has perfect diagonal stripes matching our exact pattern.

### When to Run Health Checks

- After initial load completes (all pages rendered)
- After viewport animation ends (zoom/pan settles)
- On a timer during idle (every N seconds?)
- NOT during active zoom/pan (waste of cycles)

### Open Question: Healing Strategy

When stripes detected, what's the minimum intervention?

1. **Full reset** - `tiledImage.reset()` - works but expensive
2. **Force redraw** - may not trigger re-request
3. **Invalidate specific tile** - ideal but need OSD API support
4. **Zoom jiggle** - hack but known to work (zoom out 0.01, zoom back)

Need to experiment with what actually triggers OSD to re-request cached tiles.

---

## Investigation: The Null Return Problem

### History

Previously, returning `null` from tile source methods did not behave as expected. This led to falling back to placeholder tiles. However, we may have given up too early.

**Hypothesis:** There's an impedance mismatch between what we're returning and what OSD expects. We need to understand OSD's tile source contract properly.

### Questions to Investigate

1. **What method are we implementing?** OSD has multiple tile source patterns:
   - `getTileUrl(level, x, y)` - returns URL string
   - `getTileAtPoint(level, point)` - returns tile object
   - `downloadTileStart` / `downloadTileAbort` - async pattern
   - Custom `getTileAjax` or context-based methods

2. **What does OSD do with null?**
   - Treat as "no tile exists at this position" (permanent)?
   - Treat as "tile not ready yet" (retry later)?
   - Throw an error?
   - Different behavior per method?

3. **What did "not going as expected" look like?**
   - Blank regions?
   - Console errors?
   - Infinite retry loops?
   - OSD falling back but never re-requesting?

4. **Is there a "loading" or "pending" signal?**
   - Some tile sources support returning a Promise
   - Or signaling "in progress" vs "failed" vs "unavailable"

### OSD Tile Source Types

From OSD documentation, there are different source patterns:

```javascript
// Pattern A: Synchronous URL return
getTileUrl: function(level, x, y) {
  return "https://...";  // URL to fetch
  // What happens if we return null here?
}

// Pattern B: Custom tile fetching (more control)
getTileAjax: function(level, x, y, callback) {
  // We control the entire fetch
  // Can we signal "not ready" differently here?
}

// Pattern C: Context-based (newer OSD)
getTileContext2D: function(level, x, y, context) {
  // Draw directly to provided context
  // Return value meaning?
}
```

### Action Items

1. **Read OSD source code** - Find exactly what OSD does when getTileUrl returns null
2. **Check our CustomTileSource** - Which pattern are we using? What are we returning?
3. **Find the mismatch** - Where does our expectation diverge from OSD's behavior?
4. **Test systematically** - Try null, undefined, empty string, Promise, etc.

---

## BREAKTHROUGH: The Impedance Mismatch Found

### Current Implementation

We use **synchronous `getTileUrl`** (line 3315):
```javascript
getTileUrl: this.tileGenerator.generateTile.bind(this.tileGenerator)
```

When pages aren't ready, `generateTile` returns `_renderBlankTile()` - a striped placeholder data URL.

**Problem:** OSD receives a valid data URL, caches it, considers the tile "loaded", and never re-requests.

### OSD's Async Pattern: `downloadTileStart`

OSD has a callback-based async mechanism we're not using:

```javascript
downloadTileStart(context) {
  // context.src - URL to download (optional)
  // context.finish(data, request, errMessage) - call when tile ready
  // context.abort() - cancellation
  // context.timeout - max wait time
}
```

This allows:
1. **True async loading** - Start loading, call `finish()` when ready
2. **Explicit states** - OSD knows tile is "loading" vs "loaded" vs "failed"
3. **Re-request capability** - OSD can retry failed/pending tiles

### The Fix

Instead of returning placeholder immediately via `getTileUrl`, use `downloadTileStart`:

```javascript
// Instead of getTileUrl, implement:
downloadTileStart: function(context) {
  const { level, x, y } = context.tile;

  // Check if tile content is ready
  const tileData = this.tryGenerateTile(level, x, y);

  if (tileData) {
    // Tile ready - complete immediately
    context.finish(tileData);
  } else {
    // Not ready - queue for later, OSD knows it's pending
    this.pendingTiles.add({ context, level, x, y });
    // When pages render, call context.finish(tileData)
  }
}
```

### Why This Solves Both Issues

**Issue 1 (Stale stripes):**
- No more returning placeholder data URLs
- OSD keeps tile in "loading" state until we call `finish()`
- When page renders, we call `finish()` with real tile
- OSD displays it immediately (no re-request needed)

**Issue 2 (Low-res at high zoom):**
- Same pattern: don't return low-res fallback as "complete"
- Keep high-res tile pending until actually rendered
- Call `finish()` with high-res when available
- OSD replaces fallback with proper tile

### Implementation Considerations

1. **Need to track pending tile contexts** - Store context objects to call `finish()` later
2. **Timeout handling** - OSD may abort if we take too long
3. **Memory management** - Don't hold contexts forever for tiles user scrolled away from
4. **Fallback display** - OSD should still show upscaled low-res while waiting (its natural behavior)

---

## Working Example: Async Tile Generation

### From OSD Advanced Data Model (Fractal Example)

```javascript
downloadTileStart: function(context) {
  // Get tile info from context
  let size = this.getTileBounds(context.postData.level,
      context.postData.dx, context.postData.dy, true);

  // Create canvas for this tile
  let canvas = document.createElement("canvas");
  let ctx = canvas.getContext('2d');
  canvas.width = Math.floor(size.width);
  canvas.height = Math.floor(size.height);

  // Generate tile content (could be async!)
  var imagedata = ctx.createImageData(size.width, size.height);
  // ... populate imagedata ...
  ctx.putImageData(imagedata, 0, 0);

  // CRITICAL: Call finish() with the 2D context
  context.finish(ctx);
}
```

**Key insight:** `context.finish()` accepts a `CanvasRenderingContext2D`, not just Image/URL!

### OSD's Internal Protections

From `imageloader.js`:

1. **Duplicate call protection:** `if (!this.jobId) { return; }` - safe to call finish() late
2. **Timeout handling:** OSD sets timeout, calls `fail()` if exceeded
3. **Job queue:** Respects `jobLimit`, queues excess requests
4. **Retry logic:** `failedTiles` array with `tileRetryDelay` and `tileRetryMax`

### Our Async Pattern

```javascript
downloadTileStart: function(context) {
  const { level, x, y } = extractTileCoords(context);

  // Try to generate tile immediately
  const result = this.tryGenerateTile(level, x, y);

  if (result.ready) {
    // Tile content available - finish immediately
    context.finish(result.ctx);
    return;
  }

  // Not ready - store context for later
  const jobKey = `${level}_${x}_${y}`;
  this.pendingJobs.set(jobKey, {
    context,
    level, x, y,
    requestTime: Date.now()
  });

  // Request the pages we need
  this.requestPages(result.missingPages, () => {
    // Callback when pages render
    const job = this.pendingJobs.get(jobKey);
    if (job) {
      const tile = this.generateTile(level, x, y);
      job.context.finish(tile.ctx);
      this.pendingJobs.delete(jobKey);
    }
  });
},

downloadTileAbort: function(context) {
  // OSD calls this on timeout or when tile no longer needed
  const { level, x, y } = extractTileCoords(context);
  const jobKey = `${level}_${x}_${y}`;
  this.pendingJobs.delete(jobKey);
}
```

---

## Edge Cases to Handle

### 1. Timeout Before Tile Ready

**Scenario:** Page takes longer to render than OSD's timeout.

**OSD behavior:** Calls `downloadTileAbort()`, may retry later based on `tileRetryMax`.

**Our handling:**
- Remove from pendingJobs in abort handler
- Let OSD retry naturally
- Consider: OSD default timeout? Can we configure it?

### 2. User Scrolls Away Before Tile Ready

**Scenario:** Tile requested, user pans viewport, tile no longer visible.

**OSD behavior:** May call abort, or may let it complete (wastes effort but harmless).

**Our handling:**
- Clean up pendingJobs on abort
- Could check viewport relevance before finishing (optimization)

### 3. Same Tile Requested Multiple Times

**Scenario:** OSD requests same tile while previous request pending.

**Our handling:**
- Check if job already pending
- Either reuse existing job or update with new context
- Need to understand: does OSD create new context per request?

### 4. Page Renders But Tile No Longer Tracked

**Scenario:** Race condition - page renders, we try to finish job, but job was aborted.

**OSD behavior:** `finish()` has guard: `if (!this.jobId) { return; }`

**Our handling:**
- Safe to call finish() on aborted job - OSD ignores it
- Clean up our pendingJobs map when pages complete

### 5. Level 0 (Minimap) vs Higher Levels

**Scenario:** Different resolution requirements at different levels.

**Our handling:**
- Level ≤ minimapMaxLevel: use low-res pages
- Level > minimapMaxLevel: use high-res pages
- Could have mixed state: low-res ready, high-res not

**Strategy:**
- For minimap levels: finish immediately with low-res (usually ready)
- For detail levels: wait for high-res, let OSD use fallback meanwhile

### 6. Memory Pressure

**Scenario:** Many pending jobs accumulate.

**Our handling:**
- Set reasonable limit on pendingJobs size
- Oldest jobs could be dropped (aborted)
- Or: prioritize viewport-visible tiles

### 7. What Goes Into context.finish()?

**Options we've seen:**
- `context.finish(dataUrl)` - data URL string
- `context.finish(ctx)` - CanvasRenderingContext2D
- `context.finish(blob, request, "rasterBlob")` - Blob with type hint
- `context.finish(imageUrl, null, "imageUrl")` - URL for browser to fetch

**For our case:** Either data URL or context2D should work. Context2D avoids JPEG encoding overhead.

---

## Questions Resolved

### 1. How to extract tile coords from context?

**Answer:** `context.postData.level`, `context.postData.x`, `context.postData.y`

**IMPORTANT CORRECTION:** Coordinates are NOT on `context.tile` - they come from `context.postData`, which is populated by our `getTilePostData(level, x, y)` function.

```javascript
getTilePostData: function(level, x, y) {
  return { level, x, y };
},
downloadTileStart: function(context) {
  const { level, x, y } = context.postData;  // NOT context.tile!
  // ...
}
```

### 2. What's OSD's default timeout?

**Answer:** **30 seconds (30000ms)**

Configurable via `timeout` option in viewer settings. 30 seconds is plenty of time for page rendering.

### 3. Context2D vs data URL - which performs better?

**Answer:** Context2D is better - avoids JPEG encoding overhead.

When returning context2D, we skip the `toDataURL()` call which involves:
- JPEG compression (CPU intensive)
- Base64 encoding (memory overhead)
- String allocation

### 4. Cache override - do we need custom handlers for context2D?

**Answer:** **Yes.** When returning context2D instead of Image, must override:

```javascript
createTileCache: function(cache, data) {
  cache._data = data;
},
destroyTileCache: function(cache) {
  cache._data = null;
},
getTileCacheData: function(cache) {
  return cache._data;
},
getTileCacheDataAsContext2D: function(cache) {
  return cache._data;
}
```

### 5. Can we use inline config or must subclass?

**Answer:** **Inline works!** The Mandelbrot example proves it:

```javascript
tileSources: {
  height: ...,
  width: ...,
  downloadTileStart: function(context) { ... },
  downloadTileAbort: function(context) { ... },
  createTileCache: function(cache, data) { ... },
  // etc.
}
```

### 6. Is getTileUrl required even with downloadTileStart?

**Answer:** **YES!** OSD requires `getTileUrl` for cache key generation even when using `downloadTileStart`.

Without `getTileUrl`, OSD fails with: `"No TileSource was able to open"`

The fix: provide a dummy `getTileUrl` that returns a cache key string:

```javascript
getTileUrl: function(level, x, y) {
  return `tile://${level}/${x}/${y}`;  // Cache key, not real URL
},
downloadTileStart: function(context) {
  // ... actual tile loading logic
}
```

---

## Complete Implementation Plan

### Current Code (getOSDConfig around line 3305)

```javascript
getOSDConfig() {
  return {
    height: this.gridDims.totalHeight,
    width: this.gridDims.totalWidth,
    tileSize: Math.max(this.tileWidth, this.tileHeight),
    getTileWidth: () => this.tileWidth,
    getTileHeight: () => this.tileHeight,
    tileOverlap: this.tileOverlap,
    minLevel: 0,
    maxLevel: this.maxLevel,
    getTileUrl: this.tileGenerator.generateTile.bind(this.tileGenerator)  // ← REMOVE
  };
}
```

### New Code

```javascript
getOSDConfig() {
  const self = this;

  return {
    height: this.gridDims.totalHeight,
    width: this.gridDims.totalWidth,
    tileSize: Math.max(this.tileWidth, this.tileHeight),
    getTileWidth: () => this.tileWidth,
    getTileHeight: () => this.tileHeight,
    tileOverlap: this.tileOverlap,
    minLevel: 0,
    maxLevel: this.maxLevel,

    // NEW: Async tile loading
    downloadTileStart: function(context) {
      const { level, x, y } = context.tile;

      // Each tile gets its own canvas (OSD caches reference, not copy)
      const canvas = document.createElement('canvas');
      canvas.width = self.tileWidth;
      canvas.height = self.tileHeight;
      const ctx = canvas.getContext('2d');

      // Try to generate tile with current page cache
      const result = self.tryGenerateTile(level, x, y, ctx);

      if (result.ready) {
        // All pages available - finish immediately
        context.finish(ctx);
      } else {
        // Pages missing - queue for later
        const jobKey = `${level}_${x}_${y}`;
        self.pendingJobs.set(jobKey, {
          context,
          canvas, ctx,  // Keep canvas alive until job completes
          level, x, y,
          missingPages: result.missingPages,
          resolution: result.resolution,
          requestTime: Date.now()
        });

        // Request missing pages
        self.cacheManager._requestPagesAsync(result.missingPages, result.resolution);
      }
    },

    downloadTileAbort: function(context) {
      const { level, x, y } = context.tile;
      const jobKey = `${level}_${x}_${y}`;
      self.pendingJobs.delete(jobKey);
    },

    // Cache handlers for context2D data
    createTileCache: function(cache, data) {
      cache._data = data;
    },
    destroyTileCache: function(cache) {
      cache._data = null;
    },
    getTileCacheData: function(cache) {
      return cache._data;
    },
    getTileCacheDataAsContext2D: function(cache) {
      return cache._data;
    }
  };
}
```

### New Methods Needed in TileStreamer

#### 1. pendingJobs Map (in constructor)

```javascript
this.pendingJobs = new Map();  // Track pending tile requests
```

#### 2. tryGenerateTile() - Check if tile can be generated

```javascript
tryGenerateTile(level, x, y, ctx) {
  // Calculate needed pages (same logic as current generateTile)
  const neededPages = this.tileGenerator._calculateNeededPages(level, x, y);
  const resolution = level <= this.minimapMaxLevel ? 'low' : 'high';

  // Check which pages are available
  const pageCache = this.pageStreamer._getPageCache(resolution);
  const fallbackRes = resolution === 'high' ? 'low' : 'high';
  const fallbackCache = this.pageStreamer._getPageCache(fallbackRes);

  const missingPages = neededPages.filter(p => {
    const hasPrimary = pageCache.has(`${p}_${resolution}`);
    const hasFallback = fallbackCache.has(`${p}_${fallbackRes}`);
    return !hasPrimary && !hasFallback;
  });

  if (missingPages.length > 0) {
    // Not ready
    return { ready: false, missingPages, resolution, neededPages };
  }

  // Ready - render to provided canvas context
  this.tileGenerator._renderTileToContext(level, x, y, ctx, resolution);
  return { ready: true };
}
```

#### 3. finishPendingJobs() - Called when pages finish rendering

```javascript
finishPendingJobs(renderedPages) {
  // Check each pending job to see if it can now complete
  for (const [jobKey, job] of this.pendingJobs) {
    // Check if all missing pages are now available
    const stillMissing = job.missingPages.filter(p => {
      const pageCache = this.pageStreamer._getPageCache(job.resolution);
      const fallbackRes = job.resolution === 'high' ? 'low' : 'high';
      const fallbackCache = this.pageStreamer._getPageCache(fallbackRes);
      return !pageCache.has(`${p}_${job.resolution}`) &&
             !fallbackCache.has(`${p}_${fallbackRes}`);
    });

    if (stillMissing.length === 0) {
      // All pages ready - render to job's canvas and finish
      this.tileGenerator._renderTileToContext(
        job.level, job.x, job.y, job.ctx, job.resolution
      );
      job.context.finish(job.ctx);
      this.pendingJobs.delete(jobKey);
    }
  }
}
```

#### 4. _renderTileToContext() - Render to provided context

```javascript
_renderTileToContext(level, x, y, ctx, resolution) {
  // Similar to current _renderTile, but renders to provided ctx
  // instead of shared this.tileCtx

  // Clear with background
  ctx.fillStyle = CONFIG.BACKGROUND_COLOR;
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // ... existing page intersection drawing logic ...
  // (using ctx instead of this.tileCtx)
}
```

### Integration Point: When Pages Render

In PageStreamer or wherever pages finish rendering, call:

```javascript
// After page renders successfully
window.tileStreamerRef?.finishPendingJobs([pageNumber]);
```

### Canvas Management: Why Each Tile Needs Its Own

**Key insight:** When we call `context.finish(ctx)`, OSD stores a **reference** to that canvas context in its cache. Later, when drawing tiles, OSD retrieves these references. If multiple tiles share one canvas, they all display whatever was last rendered.

**Solution: Create canvas per job**

```javascript
downloadTileStart(context) {
  const { level, x, y } = context.tile;

  // Each tile gets its own canvas
  const canvas = document.createElement('canvas');
  canvas.width = self.tileWidth;
  canvas.height = self.tileHeight;
  const ctx = canvas.getContext('2d');

  const result = self.tryGenerateTile(level, x, y, ctx);

  if (result.ready) {
    context.finish(ctx);
    // Canvas persists in OSD's cache
  } else {
    self.pendingJobs.set(jobKey, { context, ctx, ... });
    // Canvas persists until job completes
  }
}
```

**Why this is fine:**
- Canvas creation is cheap (~0.1ms)
- Memory bounded by OSD's `maxImageCacheCount` setting
- Canvas lifetime managed by OSD's cache eviction
- Can optimize to pooling later if needed

### Migration Strategy

1. **Phase A:** Add new methods without changing OSD config
   - Add `pendingJobs` Map
   - Add `tryGenerateTile()`
   - Add `finishPendingJobs()`
   - Add `_renderTileToContext()`
   - Test these independently

2. **Phase B:** Switch OSD config
   - Replace `getTileUrl` with `downloadTileStart` + `downloadTileAbort`
   - Add cache handlers
   - Remove `_renderBlankTile()` calls

3. **Phase C:** Integration
   - Hook `finishPendingJobs` into page render completion
   - Test full flow

4. **Phase D:** Cleanup
   - Remove striped placeholder code
   - Remove old tile registry/health check code
   - Optimize if needed

---

## Sources

- [OSD TileSource API](https://openseadragon.github.io/docs/OpenSeadragon.TileSource.html)
- [OSD Advanced Data Model Example](https://openseadragon.github.io/examples/advanced-data-model/)
- [OSD Custom Tile Source](https://openseadragon.github.io/examples/tilesource-custom/)
- [GitHub Issue #1299](https://github.com/openseadragon/openseadragon/issues/1299)

---

## Implementation Status

### Completed (2025-11-30)

**Phase A-C:** Successfully implemented async tile pattern:
- Added `pendingJobs` Map for tracking in-flight tile requests
- Added `tryGenerateTile()` to check page availability
- Added `finishPendingJobs()` to complete tiles when pages render
- Switched `getOSDConfig()` to use `downloadTileStart` pattern
- Hooked `finishPendingJobs` into PageStreamer render completion

**Issues Encountered and Resolved:**

1. **"No TileSource was able to open" error**
   - Cause: Missing `getTileUrl` function
   - Fix: Added `getTileUrl` that returns cache key strings (`tile://level/x/y`)

2. **Tests timing out**
   - Cause: Using `context.tile.level/x/y` instead of `context.postData`
   - Fix: Use `getTilePostData` to provide coordinates, read from `context.postData`

**Test Results:**
- Async tile infrastructure test: ✅ PASS
- Stripe pattern visual check: ✅ PASS (0% red pixels)
- Zoom tile loading: ✅ PASS
- OSD config verification: ✅ PASS

### Cleanup Done

**Background Queue Disabled:**
- The async `downloadTileStart` pattern renders tiles on-demand
- OSD caches tiles internally via the cache handlers we provide
- Our old `tileCache` (data URL cache) is no longer read
- Background queue was populating a cache that's never used
- Disabled at line ~5434-5436

**Code Now Unused (can be removed later):**
- `generateTile()` method - only called by background queue
- `_renderBlankTile()` - only called by generateTile
- `tileCache` - not read by async pattern
- Background queue infrastructure - disabled

**Kept for Safety:**
- Stripe detection (`inspectVisual`) - useful for debugging
- Auto-inspector - fallback safety net if something goes wrong
