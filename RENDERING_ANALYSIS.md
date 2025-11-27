# Dual-View Rendering Analysis: Minimap vs. Deep Zoom

## Executive Summary

This document analyzes the challenge of simultaneously serving two competing rendering jobs in the PDF Grid Viewer:
- **Minimap** (navigator): Needs low-resolution, scattered coverage across the entire grid
- **Main viewer** (deep zoom): Needs high-resolution, viewport-prioritized tiles

The current sequential rendering approach (`renderAllPages()`) doesn't align with consumption patterns, causing poor initial user experience. This report proposes three architectural solutions and recommends a dual-resolution rendering strategy.

---

## Current Architecture Analysis

### Rendering Flow
```
PDF → renderAllPages() → pageCanvases[] → CustomTileSource
                                              ↓
                                    OpenSeadragon (2 views)
                                    ├─ Main viewer
                                    └─ Navigator (minimap)
```

### Current Behavior (index.html:235-254)

```javascript
async renderAllPages(pdf, onProgress) {
  const pageCanvases = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const canvas = await this.renderPageToCanvas(page);
    pageCanvases.push(canvas);

    // Yield to browser occasionally
    if (i % CONFIG.RENDER_BATCH_SIZE === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  return pageCanvases;
}
```

**Problems:**
1. **Sequential order** (1→2→3...) doesn't match spatial distribution
2. **Single resolution** (2.0x scale) - overkill for minimap, but necessary for deep zoom
3. **Blocking initialization** - viewer waits for ALL pages before showing anything
4. **Top-left bias** - early pages render first, causing spatial clustering

### Performance Timeline (50-page PDF)

```
T=0ms:     Start rendering page 1 (sequential)
T=50ms:    Page 1 done, page 2 starts
T=100ms:   Page 2 done, page 3 starts
...
T=2500ms:  Page 50 done (50 pages × 50ms each)
T=2501ms:  Viewer initializes, OpenSeadragon requests tiles

Minimap requests: Tiles covering entire grid (all pages)
Main view requests: Tiles for first page (viewport)

Result: Top-left corner fills in first, rest comes later
User sees: 1/N² of content initially
```

---

## The Core Tension

### Minimap Requirements
- **Coverage**: Scattered pages across entire grid (visual completeness)
- **Speed**: Low resolution acceptable (0.25x - 0.5x scale)
- **Graceful degradation**: Nearest-neighbor substitution acceptable
- **User perception**: "I can see the whole document structure"

### Main Viewer Requirements
- **Quality**: High resolution required (2.0x scale for crisp text)
- **Viewport priority**: What user sees NOW matters most
- **No substitutions**: Users notice blurry text immediately
- **User perception**: "This page is sharp and readable"

### Conflict
Both views pull from the same `pageCanvases[]` array, but:
- Minimap wants pages [1, 10, 20, 30, 40, 50] (scattered)
- Main viewer wants pages [1, 2, 3] (sequential viewport)
- Current rendering gives both: [1, 2, 3, 4, 5, 6...] (sequential)

Neither view gets optimal service!

---

## Solution 1: Dual-Resolution Rendering (RECOMMENDED)

### Concept
Render each page twice at different resolutions, with different ordering strategies:
- **Low-res pass**: 0.5x scale, scattered order → feeds minimap
- **High-res pass**: 2.0x scale, viewport-first order → feeds main viewer

### Implementation Architecture

```javascript
// New rendering method
async renderDualResolution(pdf, viewportPages, onProgress) {
  const lowResCanvases = new Array(pdf.numPages);
  const highResCanvases = new Array(pdf.numPages);

  // PHASE 1: Low-res scattered (minimap population)
  const scatteredOrder = this.calculateScatteredOrder(pdf.numPages);

  for (let i = 0; i < pdf.numPages; i++) {
    const pageNum = scatteredOrder[i];
    const page = await pdf.getPage(pageNum);
    lowResCanvases[pageNum - 1] = await this.renderPageToCanvas(page, 0.5);

    onProgress({
      phase: 'lowRes',
      page: i + 1,
      total: pdf.numPages,
      pageNum: pageNum
    });

    // Yield frequently for smooth UI
    if (i % 3 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
    }
  }

  // PHASE 2: High-res viewport priority (main view clarity)
  const viewportSet = new Set(viewportPages);

  for (const pageNum of viewportPages) {
    const page = await pdf.getPage(pageNum);
    highResCanvases[pageNum - 1] = await this.renderPageToCanvas(page, 2.0);

    onProgress({
      phase: 'highResViewport',
      page: pageNum,
      total: viewportPages.length
    });
  }

  // PHASE 3: High-res remainder (scattered for full deep zoom)
  const remaining = scatteredOrder.filter(p => !viewportSet.has(p));

  for (const pageNum of remaining) {
    const page = await pdf.getPage(pageNum);
    highResCanvases[pageNum - 1] = await this.renderPageToCanvas(page, 2.0);

    onProgress({
      phase: 'highResBackground',
      page: pageNum
    });

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return { lowResCanvases, highResCanvases };
}
```

### Modified CustomTileSource (index.html:617-785)

```javascript
class CustomTileSource {
  constructor(gridDims, pattern, canvases, numPages) {
    this.gridDims = gridDims;
    this.pattern = pattern;
    this.lowResCanvases = canvases.lowResCanvases;
    this.highResCanvases = canvases.highResCanvases;
    this.numPages = numPages;
    this.cache = new TileCache();
    // ... rest of constructor
  }

  generateTile(level, x, y) {
    const key = `${level}_${x}_${y}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const scale = Math.pow(2, level - this.maxLevel);

    // Resolution selection logic
    // Use high-res for zoom >= 25%, low-res for deeper zoom-out
    const useHighRes = scale >= 0.25;
    const canvasSource = useHighRes ? this.highResCanvases : this.lowResCanvases;

    const tileUrl = this._renderTile(level, x, y, scale, key, canvasSource);
    this.cache.set(key, tileUrl);
    return tileUrl;
  }

  _renderTile(level, x, y, scale, key, canvasSource) {
    // Existing rendering logic, but uses canvasSource instead of this.pageCanvases
    // ... rest of implementation
  }

  _drawPageIntersection(row, col, tileLeft, tileTop, tileRight, tileBottom,
                        scale, debugKey, canvasSource) {
    const pageNum = this.pattern[row][col];
    const pageCanvas = canvasSource[pageNum - 1];

    if (!pageCanvas) {
      // Nearest-neighbor fallback
      const nearestCanvas = this._findNearestCanvas(pageNum, canvasSource);
      if (nearestCanvas) {
        // Use nearest as placeholder
        return this._drawCanvasIntersection(nearestCanvas, ...);
      }
      return false;
    }

    // Normal drawing logic
    // ...
  }

  _findNearestCanvas(targetPage, canvasSource) {
    // For rotating grid, spatially close pages have nearby page numbers
    for (let offset = 1; offset < this.numPages; offset++) {
      const candidateUp = targetPage + offset;
      const candidateDown = targetPage - offset;

      if (candidateUp <= this.numPages && canvasSource[candidateUp - 1]) {
        return canvasSource[candidateUp - 1];
      }
      if (candidateDown >= 1 && canvasSource[candidateDown - 1]) {
        return canvasSource[candidateDown - 1];
      }
    }

    // Fallback: first available canvas
    return canvasSource.find(c => c !== undefined);
  }
}
```

### Scattered Order Algorithm: Bit Reversal

**Why bit reversal?** Maximally disperses pages across the grid space.

```javascript
calculateScatteredOrder(numPages) {
  const bits = Math.ceil(Math.log2(numPages));
  const order = [];

  for (let i = 0; i < numPages; i++) {
    const reversed = this._reverseBits(i, bits);
    if (reversed < numPages) {
      order.push(reversed + 1); // Pages are 1-indexed
    }
  }

  return order;
}

_reverseBits(num, bits) {
  let result = 0;
  for (let i = 0; i < bits; i++) {
    result = (result << 1) | (num & 1);
    num >>= 1;
  }
  return result;
}
```

**Example for 16 pages:**
```
Binary:  0000 0001 0010 0011 0100 0101 0110 0111 1000 1001 1010 1011 1100 1101 1110 1111
Reverse: 0000 1000 0100 1100 0010 1010 0110 1110 0001 1001 0101 1101 0011 1011 0111 1111
Decimal: 1    9    5    13   3    11   7    15   2    10   6    14   4    12   8    16

Visual distribution on grid:
  Page 1 (top-left)    → Page 9 (middle)      → Page 5 (quarter)
  Page 13 (3/4 across) → Page 3 (early)       → Page 11 (middle)
  ... maximally scattered!
```

### Performance Analysis

**Memory overhead:**
- Low-res canvas: 0.5x scale = 25% pixel count = 25% memory
- High-res canvas: 2.0x scale = 400% pixel count = 100% memory
- **Total: 125% of current memory** (modest increase)

**Time savings:**
- Low-res render: ~25% of high-res time (fewer pixels)
- Phase 1 completes: 0.25 × 2500ms = **625ms** (vs 2500ms currently)
- User sees distributed minimap: **625ms** (vs 2500ms currently)
- Main viewport sharp: **625ms + (3 pages × 50ms)** = **775ms**

**User experience timeline:**
```
T=0ms:     Start Phase 1 (low-res scattered)
T=625ms:   ✓ Minimap shows distributed pages across grid
T=775ms:   ✓ Main viewport (first 3 pages) sharp at 2.0x
T=3125ms:  ✓ All pages available at high resolution for deep zoom
```

vs. current:
```
T=0ms:     Start rendering
T=2500ms:  ✓ Everything available, but user waited entire time
```

**Improvement: User sees meaningful content 75% faster!**

### Pros and Cons

**Pros:**
- ✅ Minimap gets fast distributed coverage (625ms vs 2500ms)
- ✅ Main viewport gets priority high-res rendering (775ms)
- ✅ Clean architectural separation (two canvas sets)
- ✅ Modest memory increase (25% overhead)
- ✅ Progressive user experience (visible progress in phases)
- ✅ Graceful degradation (nearest-neighbor fallback)

**Cons:**
- ❌ Increased memory usage (125% total)
- ❌ Slightly more complex tile source logic
- ❌ Need viewport calculation (which pages are visible initially)

---

## Solution 2: Interleaved Single-Resolution

### Concept
Keep one canvas set at 2.0x scale, but interleave rendering between viewport pages and scattered pages using priority scheduling.

### Implementation Sketch

```javascript
async renderInterleaved(pdf, viewportPages, onProgress) {
  const pageCanvases = new Array(pdf.numPages);
  const scatteredOrder = this.calculateScatteredOrder(pdf.numPages);

  // Build priority queue
  const queue = [];
  const viewportSet = new Set(viewportPages);

  // High priority: viewport pages (sequential)
  for (const pageNum of viewportPages) {
    queue.push({ pageNum, priority: 'high' });
  }

  // Medium priority: scattered pages (distributed)
  for (const pageNum of scatteredOrder) {
    if (!viewportSet.has(pageNum)) {
      queue.push({ pageNum, priority: 'medium' });
    }
  }

  // Interleaved rendering: 2 high, 1 medium
  let highIndex = 0;
  let mediumIndex = viewportPages.length;

  while (highIndex < queue.length || mediumIndex < queue.length) {
    // Render 2 viewport pages
    for (let i = 0; i < 2 && highIndex < viewportPages.length; i++, highIndex++) {
      const pageNum = queue[highIndex].pageNum;
      const page = await pdf.getPage(pageNum);
      pageCanvases[pageNum - 1] = await this.renderPageToCanvas(page, 2.0);
      onProgress({ phase: 'viewport', page: pageNum });
    }

    // Render 1 scattered page
    if (mediumIndex < queue.length) {
      const pageNum = queue[mediumIndex++].pageNum;
      const page = await pdf.getPage(pageNum);
      pageCanvases[pageNum - 1] = await this.renderPageToCanvas(page, 2.0);
      onProgress({ phase: 'scattered', page: pageNum });
    }

    await new Promise(resolve => setTimeout(resolve, 0));
  }

  return pageCanvases;
}
```

### Pros and Cons

**Pros:**
- ✅ Single canvas set (no memory increase)
- ✅ Viewport pages render first (main view priority)
- ✅ Minimap gets scattered coverage (2:1 interleave ratio)
- ✅ Simpler than dual-resolution (one data structure)

**Cons:**
- ❌ Minimap never gets fast initial load (all pages at 2.0x scale)
- ❌ More complex scheduling logic
- ❌ 2:1 ratio is arbitrary (needs tuning)
- ❌ Still slow for large PDFs (50 pages × 50ms = 2500ms)

---

## Solution 3: Lazy On-Demand Rendering

### Concept
Don't render pages upfront. Render them when tiles request them. Use nearest-neighbor placeholders until pages finish rendering asynchronously.

### Implementation Sketch

```javascript
class LazyTileSource {
  constructor(pdf, gridDims, pattern, numPages) {
    this.pdf = pdf;
    this.gridDims = gridDims;
    this.pattern = pattern;
    this.numPages = numPages;

    this.renderedPages = new Map(); // pageNum -> canvas
    this.pendingPages = new Set();  // pageNum -> in progress
    this.renderQueue = [];

    this.cache = new TileCache();
  }

  async generateTile(level, x, y) {
    const key = `${level}_${x}_${y}`;
    const cached = this.cache.get(key);
    if (cached) return cached;

    const scale = Math.pow(2, level - this.maxLevel);
    const pagesNeeded = this._calculatePagesForTile(level, x, y);

    // Trigger rendering of missing pages (async, non-blocking)
    for (const pageNum of pagesNeeded) {
      if (!this.renderedPages.has(pageNum) && !this.pendingPages.has(pageNum)) {
        this._renderPageAsync(pageNum, scale);
      }
    }

    // Render tile with available pages (use placeholders if needed)
    const tileUrl = this._renderTileWithFallback(level, x, y, scale, pagesNeeded);

    // Don't cache if using placeholders (tile will be regenerated)
    const allAvailable = pagesNeeded.every(p => this.renderedPages.has(p));
    if (allAvailable) {
      this.cache.set(key, tileUrl);
    }

    return tileUrl;
  }

  async _renderPageAsync(pageNum, requestedScale) {
    this.pendingPages.add(pageNum);

    const page = await this.pdf.getPage(pageNum);

    // Choose scale based on request context
    const scale = requestedScale < 0.5 ? 0.5 : 2.0;
    const canvas = await this.renderPageToCanvas(page, scale);

    this.renderedPages.set(pageNum, canvas);
    this.pendingPages.delete(pageNum);

    // Invalidate cache for tiles that used placeholders
    this._invalidateTilesForPage(pageNum);
  }

  _renderTileWithFallback(level, x, y, scale, pagesNeeded) {
    // Build page mapping (real or placeholder)
    const pageMapping = new Map();

    for (const pageNum of pagesNeeded) {
      if (this.renderedPages.has(pageNum)) {
        pageMapping.set(pageNum, this.renderedPages.get(pageNum));
      } else {
        const nearestCanvas = this._findNearestRenderedPage(pageNum);
        if (nearestCanvas) {
          pageMapping.set(pageNum, nearestCanvas); // Placeholder
        }
      }
    }

    return this._renderTileFromPages(level, x, y, scale, pageMapping);
  }

  _findNearestRenderedPage(targetPage) {
    // Search outward from target page
    for (let offset = 1; offset < this.numPages; offset++) {
      const up = targetPage + offset;
      const down = targetPage - offset;

      if (up <= this.numPages && this.renderedPages.has(up)) {
        return this.renderedPages.get(up);
      }
      if (down >= 1 && this.renderedPages.has(down)) {
        return this.renderedPages.get(down);
      }
    }

    // Fallback: any rendered page
    return this.renderedPages.values().next().value;
  }

  _invalidateTilesForPage(pageNum) {
    // Clear cached tiles that contain this page
    // OpenSeadragon will re-request them, getting the real page now
    const keysToDelete = [];

    for (const [key, value] of this.cache.cache.entries()) {
      if (this._tileContainsPage(key, pageNum)) {
        keysToDelete.push(key);
      }
    }

    for (const key of keysToDelete) {
      this.cache.cache.delete(key);
    }

    // Force OpenSeadragon to redraw (TODO: implement viewer notification)
  }

  _calculatePagesForTile(level, x, y) {
    // Determine which pages intersect this tile
    // (Geometric calculation based on grid layout)
    // ... implementation details
  }

  _tileContainsPage(tileKey, pageNum) {
    // Parse tile coordinates and check if page intersects
    // ... implementation details
  }
}
```

### Pros and Cons

**Pros:**
- ✅ Zero upfront rendering (instant viewer initialization!)
- ✅ Perfect demand-driven prioritization
- ✅ Scales to huge PDFs (1000+ pages)
- ✅ Memory efficient (only renders visible pages)
- ✅ Automatic graceful degradation

**Cons:**
- ❌ Complex async coordination and race conditions
- ❌ Tile pop-in during navigation (janky UX)
- ❌ Cache invalidation complexity
- ❌ Difficult integration with OpenSeadragon's caching
- ❌ Requires viewer notification mechanism for redraws
- ❌ Higher implementation risk

---

## Viewport Calculation

All solutions need to know which pages are initially visible. Here's how to calculate that:

```javascript
calculateInitialViewportPages(numPages) {
  // OpenSeadragon initially shows first page (top-left corner)
  // Viewport is typically ~1.2x page dimensions to show context

  // For rotating grid, first page is at (0,0)
  // Adjacent pages are:
  //   - Page 2 at (1,0) - right neighbor
  //   - Page 2 at (0,1) - bottom neighbor
  //   - Page 3 at (1,1) - diagonal

  // Conservative estimate: first 9 pages form a 3×3 grid
  const viewportPages = [];
  for (let i = 1; i <= Math.min(9, numPages); i++) {
    viewportPages.push(i);
  }

  return viewportPages;
}

// Alternative: Dynamic calculation based on grid pattern
calculateViewportPagesFromPattern(pattern, gridDims) {
  // OpenSeadragon opens with first page bounds
  // viewport ≈ 1.2x page dimensions

  const viewportWidth = gridDims.pageWidth * 1.2;
  const viewportHeight = gridDims.pageHeight * 1.2;

  const pagesInViewport = new Set();

  for (let row = 0; row < pattern.length; row++) {
    for (let col = 0; col < pattern[row].length; col++) {
      const pageLeft = col * (gridDims.pageWidth + gridDims.spacing);
      const pageTop = row * (gridDims.pageHeight + gridDims.spacing);
      const pageRight = pageLeft + gridDims.pageWidth;
      const pageBottom = pageTop + gridDims.pageHeight;

      // Check intersection with initial viewport (top-left)
      if (pageLeft < viewportWidth && pageTop < viewportHeight) {
        pagesInViewport.add(pattern[row][col]);
      }
    }
  }

  return Array.from(pagesInViewport);
}
```

---

## Recommendation

**Implement Solution 1: Dual-Resolution Rendering**

### Why?

1. **Best user experience**: Fast minimap + sharp viewport
2. **Reasonable complexity**: Moderate implementation effort
3. **Proven pattern**: Similar to progressive image loading
4. **Graceful degradation**: Fallback to nearest neighbor
5. **Measurable improvement**: 75% faster time-to-interactive

### Implementation Priority

**Phase 1: Core dual-resolution** (3-4 hours)
- Implement `renderDualResolution()` in PDFUtils
- Add bit-reversal scattered order
- Modify CustomTileSource constructor to accept dual canvases
- Add resolution selection logic to `generateTile()`

**Phase 2: Viewport calculation** (1 hour)
- Implement `calculateInitialViewportPages()`
- Wire into rendering flow

**Phase 3: Nearest-neighbor fallback** (2 hours)
- Implement `_findNearestCanvas()`
- Add fallback logic to `_drawPageIntersection()`
- Test edge cases

**Phase 4: Progressive UI feedback** (1 hour)
- Update loading status to show phases
- Add progress bars for each phase
- Show minimap as soon as Phase 1 completes

**Total estimated effort: 7-8 hours**

### Success Metrics

- Time to first meaningful paint: < 700ms (from 2500ms)
- Time to interactive viewport: < 800ms (from 2500ms)
- Memory overhead: < 130% (from 100%)
- User perception: "Feels instant" vs "I'm waiting"

### Risks and Mitigations

**Risk**: Memory quota exceeded on mobile devices
**Mitigation**: Add config flag to disable dual-resolution, fallback to interleaved rendering

**Risk**: Bit-reversal order doesn't distribute well for all page counts
**Mitigation**: Test multiple algorithms (bit-reversal, prime stride, quadtree), make configurable

**Risk**: Nearest-neighbor fallback looks bad
**Mitigation**: Only use during initial load, replace quickly with real pages

---

## Alternative Algorithms for Scattered Order

### Bit Reversal (Recommended)
```javascript
// Maximally dispersed, deterministic
// Works well for power-of-2 and near-power-of-2 page counts
calculateScatteredOrder(numPages) {
  const bits = Math.ceil(Math.log2(numPages));
  const order = [];
  for (let i = 0; i < numPages; i++) {
    const reversed = reverseBits(i, bits);
    if (reversed < numPages) order.push(reversed + 1);
  }
  return order;
}
```

### Prime Stride
```javascript
// Simple, good distribution
// Works for any page count
calculateScatteredOrder(numPages) {
  const stride = findPrimeNear(Math.sqrt(numPages));
  const order = [];
  for (let i = 0; i < numPages; i++) {
    order.push((i * stride) % numPages + 1);
  }
  return order;
}
```

### Spatial Quadtree Sampling
```javascript
// Spatially aware, samples grid like progressive image
// Best for rotating grid pattern
calculateSpatialOrder(numPages, pattern) {
  const order = [];
  const gridSize = numPages;

  function sample(rowStart, colStart, size, depth = 0) {
    if (size === 0) return;

    const mid = Math.floor(size / 2);

    // Sample center first, then corners
    const positions = [
      [rowStart + mid, colStart + mid],
      [rowStart, colStart],
      [rowStart, colStart + size - 1],
      [rowStart + size - 1, colStart],
      [rowStart + size - 1, colStart + size - 1]
    ];

    for (const [row, col] of positions) {
      if (row < gridSize && col < gridSize) {
        const pageNum = pattern[row][col];
        if (!order.includes(pageNum)) {
          order.push(pageNum);
        }
      }
    }

    // Recurse into quadrants
    const newSize = Math.floor(size / 2);
    if (newSize > 0) {
      sample(rowStart, colStart, newSize, depth + 1);
      sample(rowStart, colStart + newSize, newSize, depth + 1);
      sample(rowStart + newSize, colStart, newSize, depth + 1);
      sample(rowStart + newSize, colStart + newSize, newSize, depth + 1);
    }
  }

  sample(0, 0, gridSize);

  // Add any remaining
  for (let i = 1; i <= numPages; i++) {
    if (!order.includes(i)) order.push(i);
  }

  return order;
}
```

**Recommendation**: Start with bit-reversal, add others as config options.

---

## Configuration Changes

Add to `CONFIG` object (index.html:62-107):

```javascript
const CONFIG = {
  // ... existing config

  // Rendering Strategy
  ENABLE_DUAL_RESOLUTION: true,        // Use dual-resolution rendering
  LOW_RES_SCALE: 0.5,                  // Scale for low-res minimap canvases
  HIGH_RES_SCALE: 2.0,                 // Scale for high-res deep zoom (current PDF_RENDER_SCALE)
  RESOLUTION_SWITCH_THRESHOLD: 0.25,   // Use high-res when zoom >= 25%

  // Scattered Rendering
  SCATTERED_ORDER_ALGORITHM: 'bit-reversal', // 'bit-reversal', 'prime-stride', 'quadtree'

  // Viewport Priority
  INITIAL_VIEWPORT_PAGES: 9,           // Number of pages to prioritize for initial viewport

  // Fallback
  ENABLE_NEAREST_NEIGHBOR_FALLBACK: true, // Use placeholders during loading
};
```

---

## Testing Strategy

### Unit Tests
- Bit-reversal produces expected distribution
- Viewport calculation identifies correct pages
- Nearest-neighbor finds spatially close pages
- Resolution selection chooses correct canvas set

### Integration Tests
- Dual-resolution rendering produces both canvas sets
- Phase progression (low-res → high-res viewport → high-res all)
- Tile source correctly switches between resolutions
- Cache invalidation works correctly

### Performance Tests
- Measure time to first minimap paint
- Measure time to interactive viewport
- Measure memory consumption
- Test with varying page counts (5, 20, 50, 100 pages)

### Visual Tests
- Minimap shows distributed pages (not clustered)
- Viewport is sharp after Phase 2
- Nearest-neighbor fallback is visually acceptable
- No visual artifacts at resolution boundaries

---

## Future Enhancements

### Adaptive Resolution
Dynamically choose low-res scale based on page count:
- < 20 pages: Skip dual-resolution (fast enough)
- 20-50 pages: 0.5x low-res
- 50-100 pages: 0.25x low-res
- 100+ pages: Consider Solution 3 (lazy on-demand)

### Predictive Prefetching
Based on pan/zoom velocity, predict which pages user will visit next and prioritize their high-res rendering.

### Web Worker Offloading
Move page rendering to Web Worker to avoid blocking main thread:
```javascript
// Main thread
const worker = new Worker('pdf-renderer-worker.js');
worker.postMessage({ action: 'renderPage', pageNum: 5, scale: 2.0 });

// Worker thread
self.onmessage = async (e) => {
  const { pageNum, scale } = e.data;
  const canvas = await renderPageToCanvas(pageNum, scale);
  const imageData = canvas.toDataURL();
  self.postMessage({ pageNum, imageData });
};
```

### Smart Cache Eviction
Track which tiles are accessed frequently and keep them in cache longer (LRU → LFU hybrid).

---

## Appendix: Related TODO Items

From TODO.md, this analysis addresses:

- **Line 19**: "Meet the rendering needs of two views displayed at once - minimap and deepzoom"
- **Line 21-22**: "Render low-res tiles for minimap (0.X scale) in clever order; substitute nearest available"
- **Line 23**: "Render screen-res tiles for deep zoom (X.0 scale) more cleverly. OSD view-aware rendering"
- **Line 25**: "Optimize or add distinct caches for distinct tasks"
- **Line 27**: "Optimize page refresh performance" (faster initial load helps refresh perception)

This solution directly solves the "two competing jobs" problem with a clean architectural approach.

---

## Conclusion

The dual-resolution rendering strategy elegantly solves the competing demands of minimap and deep zoom by:
1. Rendering pages twice at different resolutions
2. Using scattered ordering for distributed minimap coverage
3. Prioritizing viewport pages for sharp main view
4. Providing graceful degradation via nearest-neighbor fallback

The implementation is moderate complexity, with measurable performance gains and clear user experience benefits. The 75% reduction in time-to-interactive makes the viewer feel instant rather than sluggish, especially for larger PDFs.

**Recommended next step**: Implement Phase 1 (core dual-resolution) as a proof-of-concept, measure performance, and iterate based on results.

---

*Document created: 2025-11-09*
*Author: Claude (Sonnet 4.5)*
*For: PDF Grid Viewer rendering optimization*
