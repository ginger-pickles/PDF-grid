# PDF Grid Viewer - Development Notes

## NEXT: Fix iOS Safari Crash on Broad Zoom-Out

**Issue**: iOS Safari crashes when zooming out to show entire grid, especially with large PDFs (300+ pages).

**Root Cause (Suspected)**: Unlimited PageStreamer.pageCache causes memory exhaustion on iOS Safari:
- PageCache is a Map with no size limit - grows unbounded
- At broad zoom-out, many pages rendered and cached forever
- Both low-res AND high-res versions kept in cache simultaneously
- For 300-page PDF: potentially 600 large canvases in memory (300 low + 300 high)
- iOS Safari has strict memory limits (~100-200MB for canvas memory)
- TileCache has LRU eviction (max 300 tiles), but PageCache does not

**Current State**:
- `PageStreamer.pageCache = new Map()` (line 438) - unlimited
- `TileCache` has LRU eviction with max 300 entries (line 805)
- No memory diagnostics or warnings

**Proposed Solution**:
1. **Add diagnostics first** to confirm memory is the issue:
   - Log PageCache size during zoom: `pageCache.size`, low vs high counts
   - Add keyboard shortcut (e.g., 'M') to log cache stats
   - Test on iOS Safari and watch for correlation between cache size and crashes

2. **Implement LRU eviction for PageCache**:
   - Similar to TileCache, add maxSize parameter (suggest 100-150 pages)
   - Evict least recently used pages when limit exceeded
   - Prioritize keeping low-res pages over high-res at low zoom levels
   - Consider separate limits for low-res vs high-res

3. **Additional optimizations**:
   - Clear high-res pages when zoom level drops below threshold
   - More aggressive eviction on mobile devices (detect iOS Safari)
   - Consider removing pages that aren't visible in viewport

**Files to modify**:
- Line 438: `PageStreamer` class constructor - add LRU cache
- Line 457-474: `renderPage()` - implement eviction logic
- Add cache stats logging for diagnostics

**Reference**:
- TileCache implementation (lines 804-860) as reference for LRU pattern

## Antialiasing Halo Issue (Dark Hairlines at Tile Edges)

**Issue**: Dark hairlines visible at tile boundaries, especially at broad zoom levels.

**Root Cause Identified**: Canvas antialiasing blends white page edges with dark background during tile rendering:
- Tiles cleared with dark gray background (`BACKGROUND_COLOR: '#1f2937'`, line 121)
- Pages rendered with `imageSmoothingEnabled = true` at low zoom (line 1475)
- Canvas antialiasing blends page edges with background → creates semi-transparent edge pixels
- JPEG encoding bakes blended pixels as dark halos around white page content
- Visible as dark hairlines where tiles meet

**Workaround (Confirmed)**: Changing background to white (#ffffff) eliminates hairlines by matching page color, but this is UX regression (dark background preferred).

**Proper Solutions to Investigate**:
1. **Disable smoothing for tile rendering** - Set `imageSmoothingEnabled = false` globally, accept aliasing
2. **Two-stage rendering** - Fill tiles with white, render pages, composite final result (complex)
3. **Pre-multiply alpha approach** - Render to temp canvas with alpha, composite without antialiasing
4. **Padding/cropping** - Render tiles slightly larger, crop edge pixels that have halos
5. **Different antialiasing strategy** - Use manual downsampling instead of canvas smoothing

**Trade-offs**:
- Solution #1 (disable smoothing): Simple but may reintroduce moiré artifacts
- Solutions #2-5: More complex, performance impact unclear

**Next Steps**: Test disabling imageSmoothingEnabled to see if moiré returns, compare visual quality trade-offs.

## Performance Optimization Ideas

### Sophisticated Lazy-LRU Cache (Future Reference)

The current simple FIFO cache works well for static tiles, but if we need true LRU behavior in the future (e.g., for dynamic content, memory pressure scenarios, or cache analytics), here's a more sophisticated approach:

```javascript
class LazyLRUCache {
  constructor(maxSize) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.accessCounter = 0;
    this.accessTimes = new Map(); // key -> last access counter
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
      // Lazy LRU: just record access time, don't reorganize Map
      // This avoids the expensive delete() + set() on every read
      this.accessTimes.set(key, ++this.accessCounter);
    }
    return value || null;
  }

  set(key, value) {
    this.cache.set(key, value);
    this.accessTimes.set(key, ++this.accessCounter);

    if (this.cache.size > this.maxSize) {
      this._evict();
    }
  }

  has(key) {
    return this.cache.has(key);
  }

  size() {
    return this.cache.size;
  }

  clear() {
    this.cache.clear();
    this.accessTimes.clear();
    this.accessCounter = 0;
  }

  _evict() {
    // Find least recently used (lowest access counter)
    // Only runs on eviction, not on every access
    let oldestKey = null;
    let oldestTime = Infinity;

    for (const [key, time] of this.accessTimes) {
      if (time < oldestTime) {
        oldestTime = time;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      this.accessTimes.delete(oldestKey);
    }
  }

  // Bonus: Can add analytics
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      totalAccesses: this.accessCounter,
      averageAccessesPerItem: this.accessCounter / this.cache.size
    };
  }
}
```

#### Benefits of Lazy-LRU:
- **Performance**: O(1) for get/set operations (hot path)
- **Only pays eviction cost when needed**: O(n) only when cache is full
- **Extensible**: Easy to add different eviction strategies (LFU, adaptive, etc.)
- **Analytics ready**: Already tracking access patterns
- **Can add features**: TTL, size-based eviction, cache warming, prefetching

#### When to Use:
- Dynamic content that changes over time
- Need to track which tiles are most frequently accessed
- Want to implement cache metrics/monitoring
- Multiple cache strategies needed (dev can swap strategies)
- Memory-constrained environments where true LRU matters

#### Why We Didn't Use It Now:
For static PDF tiles that never change, the simpler FIFO cache is 3-5x faster because:
- No access time tracking overhead
- No counter increment on every read
- Minimal code complexity
- Tiles are equally valuable (no "hot" tiles)

## Other Performance Ideas

### Tile Size Optimization
Current: Dynamic based on page dimensions
Consider: Fixed larger tiles (1024x1024) for deeper zoom - see TODO.md

### Web Worker for Tile Generation
Move tile rendering off main thread to prevent UI blocking during pan/zoom

### Progressive Rendering
Render lower-quality tiles first, then upgrade to high-quality

### Predictive Prefetching
Based on pan/zoom direction, prefetch adjacent tiles

## CORS Proxy Implementation

### Current Approach (v1.4)
- Configurable CORS proxy in `CONFIG.CORS_PROXY`
- Automatically detects external URLs
- Only applies proxy to cross-origin requests
- Local files (demo.pdf) and same-origin URLs bypass proxy

### Available Proxies
1. **corsproxy.io** (default) - `https://corsproxy.io/?`
   - Simple, fast
   - Prepend to URL

2. **allorigins.win** - `https://api.allorigins.win/raw?url=`
   - Reliable
   - Good uptime

3. **cors-anywhere** (not recommended) - Rate-limited, requires API key

### Security Considerations
- CORS proxies are third-party services
- PDFs are routed through their servers
- Don't use for sensitive/confidential documents
- Consider self-hosting a CORS proxy for production use

### Future: Self-Hosted Proxy
Could add a simple Node.js/Python CORS proxy that runs locally:
```javascript
// Simple CORS proxy example (Node.js)
const express = require('express');
const fetch = require('node-fetch');
const app = express();

app.get('/proxy', async (req, res) => {
  const url = req.query.url;
  const response = await fetch(url);
  const buffer = await response.buffer();
  res.header('Access-Control-Allow-Origin', '*');
  res.send(buffer);
});

app.listen(3000);
```

## Browser History Support for Local PDFs

### Current Behavior (v1.4.4)
- Uses `history.replaceState()` to clear URL parameters when loading local files
- Single-file storage policy (one PDF at a time in sessionStorage/IndexedDB)
- No back/forward navigation between different local PDFs
- Pressing back/forward goes to pages visited before the app

### Proposed Implementation

To support browser back/forward navigation between local PDFs:

#### 1. Use `pushState()` Instead of `replaceState()`

```javascript
// Current (replaces history entry):
window.history.replaceState({}, '', newUrl);

// Proposed (creates new history entry):
window.history.pushState({
  pdfId: uniqueId,
  filename: file.name
}, '', newUrl);
```

#### 2. Multi-File Storage Model

Change from single-file to multi-file storage:

```javascript
// Current storage structure:
{
  pdfData: ArrayBuffer,
  filename: string,
  timestamp: number
}

// Proposed storage structure:
{
  pdfs: {
    [uniqueId]: {
      pdfData: ArrayBuffer,
      filename: string,
      timestamp: number,
      lastAccessed: number
    }
  },
  history: [uniqueId1, uniqueId2, uniqueId3...] // Ordered list
}
```

#### 3. Listen to `popstate` Events

```javascript
window.addEventListener('popstate', (event) => {
  if (event.state && event.state.pdfId) {
    // Load PDF from storage using pdfId
    const stored = await PDFStorage.loadById(event.state.pdfId);
    if (stored) {
      await loadPDF(stored.pdf, stored.filename);
    }
  }
});
```

#### 4. Storage Cleanup Strategy

Need to prevent storage bloat:

**Option A: LRU with size limit**
- Keep last N PDFs (e.g., 10)
- Evict least recently accessed when limit reached
- Use lastAccessed timestamp

**Option B: History-based**
- Keep only PDFs in browser history
- Clean up when history entry is removed (difficult to detect)

**Option C: Hybrid**
- Keep last N PDFs OR last 7 days (whichever is more restrictive)
- Track total storage size, warn if > X MB

#### 5. Configuration

Add to CONFIG:

```javascript
CONFIG: {
  // ...existing config
  MAX_STORED_PDFS: 10,          // Maximum local PDFs to keep
  MAX_STORAGE_MB: 100,           // Maximum total storage size
  ENABLE_HISTORY: true           // Enable back/forward navigation
}
```

### Trade-offs

**Pros:**
- Natural browser navigation (back/forward buttons work)
- Better user experience for comparing multiple PDFs
- Matches user expectations from web browsing

**Cons:**
- Increased storage usage (multiple PDFs instead of one)
- More complex state management
- Need cleanup logic to prevent bloat
- Higher memory usage if many large PDFs loaded

### Implementation Complexity

**Medium complexity:**
- Modify PDFStorage module to support multiple PDFs
- Add popstate event listener
- Implement LRU cleanup logic
- Update file upload/load logic to use pushState()
- Test edge cases (storage full, expired PDFs, etc.)

**Estimated effort:** 2-3 hours

## Page Refresh Performance Optimization

### Current Behavior (v1.4.4)

When refreshing the page with a stored local PDF:
1. PDF binary data (ArrayBuffer) is loaded from storage (~original file size)
2. PDF.js parses the PDF
3. **All pages are re-rendered to canvases** (expensive operation)
4. OpenSeadragon viewer initializes with rendered canvases

This means every refresh "chews through all the pages" again, which is slow for large PDFs (50+ pages).

### Why This Happens

**Storage contains:** Raw PDF binary data (compact, ~5MB for typical PDF)
**Not stored:** Rendered page canvases (would be massive, ~1-2MB per page)

**Trade-off:**
- Compact storage (good for 7-day expiry model)
- Slow refresh (must re-render every time)

### Proposed Solutions

#### Option A: Store Rendered Canvases

**Approach:** Store both PDF binary AND rendered canvases in IndexedDB

```javascript
// Current storage:
{
  pdfData: ArrayBuffer,  // ~5MB
  filename: string,
  timestamp: number
}

// Proposed storage:
{
  pdfData: ArrayBuffer,     // ~5MB (keep for download)
  pageCanvases: [           // ~50-100MB for 50 pages!
    { dataUrl: string },    // Base64 encoded canvas
    { dataUrl: string },
    ...
  ],
  filename: string,
  timestamp: number
}
```

**Pros:**
- Instant refresh (no re-rendering)
- Best user experience for frequent refreshes

**Cons:**
- Massive storage increase (10-20x larger)
- 50-page PDF: ~100MB in storage vs ~5MB currently
- May hit IndexedDB quota limits
- Longer initial upload time (must serialize canvases)

**Implementation complexity:** Low (straightforward serialization)

#### Option B: Keep Current Approach

**Approach:** Accept re-rendering as necessary trade-off

**Pros:**
- Compact storage (~5MB per PDF)
- Fits well with 7-day expiry model
- Simple implementation

**Cons:**
- Slow refresh for large PDFs
- Users must wait through "chewing" every time

**Best for:**
- PDFs < 30 pages (refresh is reasonably fast)
- Users who rarely refresh
- Storage-constrained environments

#### Option C: Progressive/On-Demand Rendering

**Approach:** Don't render all pages upfront; render tiles as needed during pan/zoom

**Current architecture:**
```javascript
// All pages rendered at load time
const pageCanvases = await PDFUtils.renderAllPages(pdf);
// Store in memory for tile generation
```

**Proposed architecture:**
```javascript
// Pages rendered on-demand
const tileSource = new ProgressiveTileSource(pdf);
// Renders pages only when tiles from that page are requested
// Caches rendered pages in memory (LRU)
```

**How it works:**
1. Load PDF from storage (fast)
2. Initialize viewer immediately (instant)
3. Render pages progressively as user pans/zooms
4. Keep last N rendered pages in memory cache
5. Initial view loads first page only

**Pros:**
- Fast initial load (show viewer immediately)
- Compact storage (no canvases stored)
- Handles huge PDFs (100+ pages)
- Better memory usage (only cache visible pages)

**Cons:**
- Complex architectural change
- Need to modify TileSource to render on-demand
- Potential tile pop-in during fast panning
- Need LRU cache for rendered pages in memory

**Implementation complexity:** High

**Changes required:**
1. Modify TileStreamer to accept PDF object instead of pre-rendered canvases
2. Implement page rendering inside getTileUrl()
3. Add in-memory LRU cache for rendered pages
4. Handle async rendering (tiles may appear with delay)
5. Add loading indicators for tiles being rendered

**Estimated effort:** 6-8 hours

### Recommendation

**For current use case:**
- If PDFs are typically < 30 pages: Keep Option B (current approach)
- If PDFs are 50+ pages and refresh is common: Implement Option C (progressive)
- If storage space is abundant: Consider Option A (canvas storage)

**Long-term best solution:** Option C (progressive rendering)
- Handles all PDF sizes
- Minimal storage footprint
- Best UX (instant viewer initialization)
- Aligns with TODO item "support more than a hundred pages"

## Exploiting Grid Pattern Periodicity

### Observation (v1.7.1)

The staggered diagonal grid pattern creates **spatial periodicity** - the arrangement of pages repeats in a predictable pattern across the grid. This is especially visible at minimap/overview scales.

### Pattern Characteristics

**Grid pattern example (5 pages):**
```
0 0 1 2 3
0 1 2 3 4
1 2 3 4 5
2 3 4 5 0
3 4 5 0 0
```

**Periodicity properties:**
- Pattern repeats every N rows/columns (where N = number of pages)
- At certain scales, tiles contain identical page arrangements
- The diagonal structure creates predictable spatial relationships
- Most pronounced at overview scales where full pattern is visible

### Optimization Opportunities

#### 1. Content-Based Tile Caching

**Current approach:**
- Cache key: `"${level}_${x}_${y}"` (position-based)
- Same content at different positions = different cache entries
- No exploitation of repeated patterns

**Periodic approach:**
```javascript
// Generate content signature for tile
function getTileContentSignature(level, x, y) {
  // Calculate which pages intersect this tile
  const pages = calculateIntersectingPages(level, x, y);

  // Sort and hash page numbers + their relative positions
  // Tiles with same pages in same arrangement = same signature
  return hashPageArrangement(pages);
}

class PeriodicCache {
  get(level, x, y) {
    const signature = getTileContentSignature(level, x, y);
    return this.cache.get(signature);  // Reuse tiles with same content
  }
}
```

**Benefits:**
- Tiles with identical content share cache entries
- Reduced memory footprint at overview scales
- Fewer tile renders needed

**Challenges:**
- Computing content signature cost
- Handling slight variations (partial page intersections)
- More complex cache key management

#### 2. Pattern Period Recognition

**Observation:**
- Grid size = N×N where N = number of pages
- Pattern period = N (repeats every N rows/columns)
- At certain zoom levels, tiles align with period boundaries

**Optimization:**
```javascript
class PeriodicTileStreamer {
  constructor(gridDims, pattern, pageStreamer, numPages) {
    // Calculate pattern period
    this.period = numPages;  // Grid repeats every N units

    // At minimap scale, determine tile-to-period alignment
    this.calculatePeriodicAlignment();
  }

  getTileUrl(level, x, y) {
    // Check if we can reuse a tile from previous period
    if (level <= this.minimapMaxLevel) {
      const canonicalPos = this.mapToCanonicalPeriod(x, y);
      const key = `${level}_${canonicalPos.x}_${canonicalPos.y}`;

      if (this.cache.has(key)) {
        return this.cache.get(key);
      }
    }

    // Generate tile normally
    return this._renderTile(level, x, y, ...);
  }

  mapToCanonicalPeriod(x, y) {
    // Map tile position to canonical position within one period
    return {
      x: x % this.period,
      y: y % this.period
    };
  }
}
```

**Benefits:**
- Dramatic cache reduction at overview scales
- Predictable memory usage
- Exploits mathematical properties of the grid

**Challenges:**
- Only works at specific scales where tiles align with periods
- Edge cases (partial periods at grid boundaries)
- Complexity in determining when periodicity applies

#### 3. Smart Eviction with Period Awareness

**Concept:**
LRU cache that understands periodicity and prioritizes keeping one complete period in cache over scattered tiles.

```javascript
class PeriodicLRUCache {
  evict() {
    // Prefer evicting tiles outside the canonical period
    // Keep one complete period worth of tiles
    const canonical = this.findCanonicalPeriodTiles();
    const nonCanonical = this.findNonCanonicalTiles();

    if (nonCanonical.length > 0) {
      this.evictLRU(nonCanonical);  // Evict duplicates first
    } else {
      this.evictLRU(canonical);      // Standard LRU
    }
  }
}
```

**Benefits:**
- Better cache hit rate for periodic content
- Intelligent about what to keep/evict
- Exploits content structure

### When Periodicity Matters Most

**High impact:**
- Minimap/overview scales (pattern fully visible)
- Large documents (many periods repeat)
- Users zooming between overview and detail repeatedly

**Low impact:**
- Deep zoom (single page or partial pages visible)
- Small documents (< 10 pages)
- Linear exploration patterns

### Implementation Complexity

**Low complexity (2-3 hours):**
- Add period calculation and documentation
- Simple modulo-based canonical position mapping
- Test with existing cache structure

**Medium complexity (4-6 hours):**
- Content-based tile signatures
- Periodic cache key generation
- Handle edge cases (partial periods)

**High complexity (8-12 hours):**
- Full periodic-aware cache with smart eviction
- Content hashing for identical tile detection
- Performance profiling to verify gains

### Recommendation

**Phase 1: Document and analyze**
- Measure cache hit rates with current LRU
- Profile which tiles are rendered most often
- Determine if periodicity optimization would provide significant gains

**Phase 2: If worthwhile**
- Start with simple canonical position mapping
- Add period awareness to existing LRU cache
- Measure improvement before adding complexity

**Phase 3: Advanced (if needed)**
- Content-based signatures
- Smart eviction with period awareness
- Only if profiling shows clear benefit

The key question: **Does the cache hit rate suffer from not recognizing periodicity?** With LRU (v1.7.1), frequently-accessed tiles already stay cached. Periodicity optimization may provide diminishing returns unless the cache is under significant memory pressure.

## Rectangular Tiles

### Current Implementation (v1.7.1)

**Square tiles:**
```javascript
// index.html line ~927-930
this.tileSize = Math.max(
  CONFIG.MIN_TILE_SIZE,
  Math.ceil(Math.max(gridDims.pageWidth, gridDims.pageHeight) / CONFIG.TILE_SIZE_MULTIPLIER) * CONFIG.TILE_SIZE_MULTIPLIER
);
this.tileCanvas.width = this.tileSize;
this.tileCanvas.height = this.tileSize;  // Same as width
```

Tile size is determined by the larger dimension of the page (width or height), creating square tiles.

### OpenSeadragon Support for Rectangular Tiles

**Good news:** OpenSeadragon fully supports rectangular tiles via the tile source API:

```javascript
getTileWidth() {
  return this.tileWidth;   // Can differ from height
}

getTileHeight() {
  return this.tileHeight;  // Independent dimension
}
```

The tile source simply needs to return different values for width and height. All coordinate calculations and rendering work with rectangular tiles.

### Potential Benefits

#### 1. Match Page Aspect Ratio

**Standard US Letter:** 8.5" × 11" at 72 DPI = 612 × 792 pixels
- Aspect ratio: ~1:1.3 (portrait)
- Current square tiles: Larger dimension determines both
- Rectangular tiles: Could match natural page proportions

**Example:**
```javascript
// Current: Square tiles sized to max(612, 792) = 792×792
// Rectangular: Could use 612×792 or scaled proportionally

this.tileWidth = Math.ceil(gridDims.pageWidth / CONFIG.TILE_SIZE_MULTIPLIER) * CONFIG.TILE_SIZE_MULTIPLIER;
this.tileHeight = Math.ceil(gridDims.pageHeight / CONFIG.TILE_SIZE_MULTIPLIER) * CONFIG.TILE_SIZE_MULTIPLIER;
```

#### 2. More Efficient Content Packing

**Square tiles on rectangular content:**
- Wasted space in tiles (blank areas)
- Pages span across more tile boundaries
- More tiles needed for full coverage

**Rectangular tiles aligned to pages:**
- Better utilization of tile canvas
- Fewer tile boundaries intersecting pages
- Potentially fewer total tiles for same coverage

#### 3. Align with Grid Periodicity

**Opportunity:**
- Design tile dimensions to align with grid period
- Tiles could cover exact multiples of pages
- Exploit staggered pattern structure

**Example:**
```javascript
// Tiles sized to contain exactly 1 page width × 1.5 page heights
// Optimally captures the diagonal stagger pattern
this.tileWidth = gridDims.pageWidth + gridDims.spacing;
this.tileHeight = Math.floor(1.5 * (gridDims.pageHeight + gridDims.spacing));
```

### Trade-offs

**Benefits:**
- Better match to rectangular PDF pages
- Potentially more efficient tile packing
- Could reduce total tile count
- May align better with grid structure
- Smaller tile data URLs (less wasted canvas space)

**Challenges:**
- More complex coordinate math (width ≠ height)
- Cache considerations (aspect ratio variations)
- Need to handle both dimensions independently
- Testing required to verify performance gains
- May not improve performance if pages are nearly square

### Implementation Approach

**Phase 1: Analysis (1-2 hours)**
1. Measure current tile utilization (how much of each tile is blank?)
2. Calculate optimal rectangular tile dimensions for typical PDFs
3. Estimate potential memory/performance savings

**Phase 2: Prototype (3-4 hours)**
1. Modify TileStreamer to support separate width/height
2. Update getTileWidth() and getTileHeight() methods
3. Adjust coordinate calculations for rectangular tiles
4. Update tile canvas sizing

**Phase 3: Testing (2-3 hours)**
1. Test with various PDF aspect ratios
2. Measure tile count and memory usage vs square tiles
3. Verify no visual artifacts
4. Profile rendering performance

**Phase 4: Optimization (2-4 hours, if needed)**
1. Tune tile dimensions for optimal coverage
2. Consider aspect-ratio-aware tile sizing
3. Align with grid periodicity (advanced)

### Key Questions to Investigate

1. **What's the current tile utilization?**
   - Measure: % of tile canvas containing page content vs blank
   - If high (>80%), square tiles may already be optimal

2. **What are typical page aspect ratios in target PDFs?**
   - US Letter: 1:1.3
   - A4: 1:1.4
   - If close to square, rectangular tiles won't help much

3. **Do rectangular tiles reduce total tile count?**
   - Count tiles needed for full coverage: square vs rectangular
   - Consider tile boundary intersections with pages

4. **Does it improve cache efficiency?**
   - Smaller tiles (less blank space) = more tiles fit in cache
   - But more tiles needed overall might offset this

5. **Does it align with grid periodicity?**
   - Can tile dimensions be chosen to match pattern period?
   - Would this compound benefits with periodic caching?

### Recommendation

**Start with measurement:**
- Profile current tile utilization (content vs blank space)
- Calculate theoretical improvement with rectangular tiles
- Only implement if gains are significant (>20% improvement)

**Quick win potential:**
If typical PDFs have strong portrait/landscape bias, rectangular tiles could provide easy memory savings without significant complexity.

**Defer if:**
- Current square tiles already have high utilization
- Pages in typical PDFs are near-square
- Performance is already acceptable

**Best case scenario:**
Rectangular tiles + periodic caching could compound benefits at overview scales, where tiles could be sized to optimally capture the repeating diagonal pattern.

### Related Work

See TODO.md line 39 for periodicity exploitation and tile optimization tasks.

## Background Rendering and Progressive Loading (v1.7.2)

### Implementation

Changed from upfront rendering (all pages before showing viewer) to progressive rendering with background loading:

**Phase 1: Priority high-res (10 pages)**
- Initial viewport pages (first 10 pages)
- Covers visible area at startup

**Phase 2: Initial low-res batch (20 pages)**
- Scattered order (bit-reversal) for even minimap coverage
- Provides initial minimap tiles

**Phase 3: Show viewer (non-blocking)**
- User can interact immediately
- Initial load time dramatically improved

**Phase 4: Background low-res rendering (remaining pages)**
- Renders asynchronously without blocking UI
- Forces OpenSeadragon redraw every 10 pages
- Progressive minimap population

### Performance Improvement

**Before (v1.7.1):**
- 126-page PDF: Render 126 low-res + 43 high-res = ~15-20 seconds
- User waits for all minimap pages

**After (v1.7.2):**
- 126-page PDF: Render 10 high-res + 20 low-res = ~3-5 seconds
- User sees viewer immediately
- Remaining 106 pages render in background

**Result: ~75% reduction in initial load time**

### Bidirectional Fallback

Implemented bidirectional resolution fallback in TileStreamer:
- High-res tiles can use low-res pages (existing)
- **New:** Low-res tiles can use high-res pages
- Critical for progressive loading where high-res renders first

### Blank Tile Handling

When no page data available (neither resolution):
- Return valid blank tile (background color) instead of null
- Prevents "Tile failed to load" errors
- Tiles get replaced when pages render

### Known Issue: OpenSeadragon Blank Tile Caching

**Problem:** OpenSeadragon may cache blank tiles and not automatically refresh when page data becomes available.

**Symptoms:**
- Tiles remain blank even after background rendering completes
- Minimap doesn't fully populate
- Requires manual pan/zoom to trigger refresh

**Current mitigation:**
- Call `viewer.forceRedraw()` every 10 pages during background rendering
- Final `forceRedraw()` when background rendering completes

**Potential solutions to investigate:**

1. **Invalidate tile cache explicitly**
   ```javascript
   // Clear OSD's internal tile cache for specific tiles
   viewer.world.getItemAt(0).invalidate();
   ```

2. **Use tile update events**
   ```javascript
   // Notify OSD when new pages become available
   viewer.world.getItemAt(0).setOpacity(0.99); // Force redraw
   viewer.world.getItemAt(0).setOpacity(1.0);
   ```

3. **Don't cache blank tiles**
   ```javascript
   // In generateTile(): Don't cache blank tiles, return fresh each time
   if (!canRenderWithFallback) {
     return this._renderBlankTile(); // Don't cache!
   }
   ```

4. **Dynamic tile source**
   ```javascript
   // Mark blank tiles as "temporary" so OSD doesn't cache them
   // Requires custom tile caching strategy
   ```

5. **Progressive cache invalidation**
   ```javascript
   // As each page renders, invalidate affected tiles
   onPageRendered(pageNum) {
     const affectedTiles = this._tilesContainingPage(pageNum);
     affectedTiles.forEach(tile => this.cache.delete(tile));
     viewer.forceRedraw();
   }
   ```

**Best approach:** Option 3 (don't cache blank tiles) combined with option 5 (invalidate affected tiles when pages render). This ensures tiles always reflect latest page availability without manual refresh.

**Implementation priority:** Medium - current workaround (forceRedraw) is adequate but not optimal. User can also manually pan/zoom to trigger refresh.
