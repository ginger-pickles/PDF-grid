# Scalability Analysis: Large PDF Support

## Executive Summary

**Scalability Challenges:**
- ⚠️ Performance degrades: PDFs with 200-500 pages, 50-200MB
- ❌ Not viable: PDFs with 1000+ pages, 500MB+

**Primary Bottlenecks:**
1. **Memory consumption** - Each page at 4x scale = ~2-3MB canvas → 1000 pages = 2-3GB
2. **PageCache limits** - LRU eviction limits max cached pages
3. **Browser memory limits** - Mobile Safari crashes at ~200MB canvas memory

---

## Current Architecture Overview

### Rendering Pipeline

```
PDF Load → Initial Rendering → Viewer Initialization → On-Demand Rendering
          (Phase 1-3)            (OpenSeadragon)        (Viewport-aware)
```

**Phase 1:** Priority Pages (high-res)
- First ~10 pages at high resolution (4x)
- ~30-50ms per page

**Phase 2:** Viewport Pages (low-res)
- Pages visible in initial viewport (low-res 0.3x)
- ~10ms per page

**Phase 3:** Upfront All Pages (low-res) - **CONDITIONAL**
- Remaining pages at low-res (0.3x) for PDFs ≤100 pages
- Skipped for PDFs >100 pages (on-demand rendering fills in tiles)
- ~10ms per page when enabled

### Memory Architecture

```
┌─────────────────────────────────────┐
│   PageCache (LRU eviction)          │
│   ├─ Low-res:  100 pages max        │  ← ~30MB
│   └─ High-res: 100 pages max        │  ← ~250MB
├─────────────────────────────────────┤
│   TileCache (LRU + level-aware)     │
│   └─ 300 tiles (150 on iOS)         │  ← ~120MB
└─────────────────────────────────────┘
                                        Total: ~400MB
```

---

## Scalability Recommendations

### Short-Term Fixes

#### 1. Adaptive Cache Sizing Based on PDF Size

**Problem:** Fixed cache sizes don't scale to document size.

**Solution:** Calculate cache sizes as percentage of document.

```javascript
function calculateOptimalCacheSizes(numPages, isIOS) {
  // Low-res: Try to hold entire document up to limit (for minimap)
  const lowResSize = Math.min(numPages, isIOS ? 200 : 300);

  // High-res: Viewport + predictive buffer (fixed size)
  const highResSize = isIOS ? 50 : 100;

  return { lowResSize, highResSize };
}
```

**Recommendation:** Increase lowResSize cap from 200→500 on desktop for better minimap coverage.

---

#### 2. Progressive Minimap Population

**Problem:** Minimap (navigator) is empty until low-res pages render.

**Solution:** Render low-res pages in scattered order for progressive appearance.

```javascript
// Bit-reversal ordering for scattered appearance
function scatteredPageOrder(totalPages) {
  const pages = [];
  const bits = Math.ceil(Math.log2(totalPages));

  for (let i = 1; i <= totalPages; i++) {
    const reversed = reverseBits(i, bits);
    pages.push(reversed);
  }

  return pages.sort((a, b) => a - b).filter(p => p <= totalPages);
}
```

**Enhancement:** Apply scattered ordering to on-demand low-res renders, not just upfront.

---

### Medium-Term Improvements

#### 3. Lazy L0 Minimap Tiles

**Problem:** Navigator tries to show entire grid but pages aren't rendered yet.

**Solution:** Generate L0 tiles on-demand using thumbnail extraction from PDF.js.

```javascript
// Extract PDF page thumbnails (fast, already rendered by PDF.js)
async function extractThumbnail(page) {
  const viewport = page.getViewport({ scale: 0.1 }); // Tiny thumbnail
  const canvas = document.createElement('canvas');
  canvas.width = viewport.width;
  canvas.height = viewport.height;

  await page.render({
    canvasContext: canvas.getContext('2d'),
    viewport
  }).promise;

  return canvas;
}
```

**Benefit:**
- Thumbnails are ~10KB each vs ~30KB low-res canvas
- 1000 pages = ~10MB vs ~30MB
- **Faster extraction** - PDF.js caches page metadata
- Minimap appears instantly, progressively replaces with higher quality

---

#### 4. Virtual Page Rendering (Viewport-Only)

**Status:** Viewport-aware rendering and predictive loading are implemented. Further enhancements possible.

**Solution:** Only render pages near viewport, aggressively evict distant pages.

**Architecture:**

```
┌────────────────────────────────────────┐
│  Viewport Position Tracker             │
│  ├─ Current viewport center            │
│  ├─ Velocity vector (for prediction)   │
│  └─ Direction of motion                │
└────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────┐
│  Page Priority Calculator               │
│  ├─ Distance from viewport              │
│  ├─ Predicted path intersection         │
│  └─ Priority score (0-100)              │
└────────────────────────────────────────┘
            │
            ▼
┌────────────────────────────────────────┐
│  Render Queue (Priority Heap)          │
│  ├─ High priority: viewport pages      │
│  ├─ Medium: predicted path             │
│  └─ Low: distant pages (deferred)      │
└────────────────────────────────────────┘
```

**Enhancements:**
- Make eviction **more aggressive** for distant pages
- Track viewport history to identify "hot zones" (frequently visited pages)
- Keep hot zones cached even when out of viewport

---

#### 5. Tile-to-Tile Resampling

**Problem:** On-demand page rendering is slow (30-50ms per page).

**Solution:** Generate missing tiles by resampling existing tiles at different zoom levels.

**Example:**
```
L3 tile needed but page not cached
  ↓
Check if L2 tile exists (2x smaller)
  ↓
Upsample L2 → L3 with bilinear interpolation (~1ms)
  ↓
Return upsampled tile immediately
  ↓
Trigger async page render in background
  ↓
Replace with crisp tile when ready
```

**Benefits:**
- **Instant** tile availability (no blank tiles)
- Smooth zooming experience
- Quality progressively improves

**Challenges:**
- Quality degradation from multiple resampling stages
- Need to track tile dependency graph
- Determine acceptable quality thresholds

**Complexity:** HIGH - Major architectural change

---

### Long-Term Vision

#### 6. Web Worker Page Rendering

**Status:** Async tile rendering with yielding (setTimeout) prevents UI blocking. Web Workers would enable parallel rendering.

**Solution:** Offload PDF rendering to dedicated Web Workers.

```javascript
// Main thread
const worker = new Worker('pdf-renderer-worker.js');
worker.postMessage({ type: 'render', pageNum: 5, scale: 4.0 });

// Worker thread
self.addEventListener('message', async (e) => {
  const { pageNum, scale } = e.data;
  const canvas = await renderPageToCanvas(pageNum, scale);

  // Transfer canvas via OffscreenCanvas (zero-copy)
  const bitmap = canvas.transferToImageBitmap();
  self.postMessage({ pageNum, bitmap }, [bitmap]);
});
```

**Benefits:**
- Main thread stays responsive during rendering
- Parallel rendering on multi-core CPUs
- Better mobile performance

**Challenges:**
- PDF.js worker compatibility
- Canvas transfer between threads
- Complexity: VERY HIGH

---

#### 7. IndexedDB Page Cache Persistence

**Problem:** Page refresh requires re-rendering all pages.

**Solution:** Persist rendered canvases to IndexedDB.

**Architecture:**
```javascript
const cache = {
  key: 'pdf_<hash>_page_<num>_<res>',
  value: {
    imageData: ImageData,          // Raw pixel data
    width: number,
    height: number,
    timestamp: number,
    renderScale: number
  }
};
```

**Benefits:**
- Instant page refresh (load from disk instead of re-render)
- Persistent cache across sessions
- Huge time saving for large PDFs

**Challenges:**
- IndexedDB quota limits (~50MB on mobile, ~500MB desktop)
- Need aggressive eviction strategy
- Image data serialization overhead
- Complexity: MEDIUM

**Rough Calculations:**
- 1000 pages × 30KB (low-res) = ~30MB ✅ Fits in mobile quota
- 100 pages × 250KB (high-res) = ~25MB ✅ Fits comfortably

---

#### 8. Differential Tile Updates

**Status:** Tile invalidation when pages finish rendering is implemented. Selective region updates could further optimize.

**Solution:** Track which pages changed, only redraw affected tile regions.

**Example:**
```javascript
// Tile contains pages [1, 2, 3]
// Page 2 finishes rendering
  ↓
Identify tile region affected by page 2
  ↓
Redraw only that region (partial tile update)
  ↓
Composite onto existing tile
```

**Benefits:**
- Faster progressive loading
- Less canvas memory thrashing

**Challenges:**
- Complex coordinate math
- Tile composition logic
- Complexity: HIGH

---

## Monitoring & Diagnostics

### Key Metrics to Track

1. **Load Time**
   - Phase 1 duration (priority pages)
   - Phase 2 duration (viewport pages)
   - Phase 3 duration (upfront all pages) ← **Primary bottleneck**
   - Total time to viewer open

2. **Memory Usage**
   - Peak canvas memory (MB)
   - Cache memory breakdown (low-res, high-res, tiles)
   - Total memory vs browser limits

3. **Cache Effectiveness**
   - Hit rate (%)
   - Eviction count
   - Fallback tile count (tiles using wrong resolution)

4. **User Experience**
   - Blank tile duration (time until tile fills in)
   - Panning frame rate (FPS)
   - Zoom responsiveness

### Recommended Debug Panel Features

- Phase timing breakdown (Phase 1: 500ms, Phase 2: 200ms, Phase 3: 8s)
- Memory pressure indicator (Green: <200MB, Yellow: 200-500MB, Red: >500MB)
- Cache thrash detector (high eviction rate = cache too small)
- Load time history graph (track performance over sessions)

---

## Implementation Roadmap

### Short-Term Optimizations

- Increase low-res cache cap (200 → 500 pages on desktop)

**Impact:** Better minimap coverage for large PDFs

---

### Medium-Term Improvements

- Progressive minimap population with scattered rendering
- Hot zone tracking (keep frequently visited pages cached)
- Memory pressure detection (reduce cache sizes automatically)

**Impact:** Better memory efficiency, smoother panning for large PDFs

---

### Advanced Features

- Lazy L0 minimap with thumbnail extraction
- Virtual page rendering (viewport-only)
- Tile-to-tile resampling for instant zoom
- IndexedDB canvas persistence

**Impact:** Support for 1000+ page PDFs, instant page refresh

---

### Next-Generation Architecture

- Web Worker page rendering (parallel + non-blocking)
- Differential tile updates (selective redraw)
- Adaptive quality (reduce render scale under memory pressure)
- Streaming PDF support (render before full download)

**Impact:** Production-ready for enterprise use cases

---

## Conclusion

PDF Grid Viewer has improved scalability through targeted optimizations:

**Implemented:**
- Conditional Phase 3 rendering (skip for PDFs >100 pages)
- LRU caching (PageCache and TileCache)
- Viewport-aware rendering with predictive loading
- On-demand rendering for large documents
- Async tile rendering to prevent UI blocking

**Architecture is sound** - all necessary infrastructure exists (viewport tracking, LRU caching, on-demand rendering, predictive loading). Further optimizations are mostly **configuration tuning** and **enhancements**, not major refactors.

**Remaining opportunities:** Lazy minimap tiles, hot zone tracking, memory pressure detection, IndexedDB persistence.
