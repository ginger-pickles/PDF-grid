# Scalability Analysis: Large PDF Support

## Executive Summary

**Current State (v1.9.4):**
- ✅ Works well: PDFs up to ~100 pages, ~50MB
- ⚠️ Performance degrades: PDFs with 200-500 pages, 50-200MB
- ❌ Not viable: PDFs with 1000+ pages, 500MB+

**Primary Bottlenecks:**
1. **Initial page rendering** - Sequential rendering of all pages before viewer starts
2. **Memory consumption** - Each page at 4x scale = ~2-3MB canvas → 1000 pages = 2-3GB!
3. **PageCache limits** - Current max 100-150 pages can't hold 1000-page PDFs
4. **Browser memory limits** - Mobile Safari crashes at ~200MB canvas memory

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
- Total: ~500ms for 10 pages

**Phase 2:** Viewport Pages (low-res)
- Pages visible in initial viewport (low-res 0.3x)
- ~10ms per page
- Total: ~100-200ms for typical viewport

**Phase 3:** Upfront All Pages (low-res) - **BOTTLENECK**
- ALL remaining pages at low-res (0.3x)
- ~10ms per page
- Total: **~10 seconds for 1000-page PDF!**
- This prevents viewer from opening until complete

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

**For 1000-page PDF:**
- Phase 3 creates 1000 low-res canvases → ~300MB
- Only 100 fit in cache → 900 immediately evicted
- **Wasteful:** 90% of rendering work is discarded!

---

## Scalability Recommendations

### Short-Term Fixes (Immediate - v1.9.5)

#### 1. Make Phase 3 Rendering Optional

**Problem:** Upfront rendering of ALL pages blocks viewer initialization.

**Solution:** Add CONFIG option to skip Phase 3 for large PDFs.

```javascript
// CONFIG
UPFRONT_RENDERING_PAGE_THRESHOLD: 200, // Skip Phase 3 if PDF > N pages
UPFRONT_RENDERING_ENABLED: true,       // Keep for small PDFs
```

**Implementation:**
```javascript
// In renderPDF()
const skipUpfront = pdfDoc.numPages > CONFIG.UPFRONT_RENDERING_PAGE_THRESHOLD;

if (CONFIG.UPFRONT_RENDERING_ENABLED && !skipUpfront) {
  // Phase 3: Render all remaining pages
  await renderAllPagesLowRes();
}

// Viewer opens immediately after Phase 1 + 2 for large PDFs
```

**Impact:**
- 1000-page PDF: Viewer opens in ~1 second instead of ~10 seconds
- Empty tiles initially, filled by on-demand rendering as user pans
- Acceptable trade-off for large documents

---

#### 2. Adaptive Cache Sizing Based on PDF Size

**Problem:** Fixed cache sizes don't scale to document size.

**Solution:** Calculate cache sizes as percentage of document.

```javascript
function calculateOptimalCacheSizes(numPages, isIOS) {
  // Low-res: Try to hold entire document up to 200 pages (for minimap)
  const lowResSize = Math.min(numPages, isIOS ? 200 : 300);

  // High-res: Viewport + predictive buffer (fixed size)
  const highResSize = isIOS ? 50 : 100;

  return { lowResSize, highResSize };
}
```

**Already Implemented:** ✅ This exists in v1.9.3! (line 570-605)

**Recommendation:** Increase lowResSize cap from 200→500 on desktop for better minimap coverage.

---

#### 3. Progressive Minimap Population

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

**Already Partially Implemented:** ✅ Scattered rendering exists (v1.8.7+)

**Enhancement Needed:** Apply scattered ordering to on-demand low-res renders, not just upfront.

---

### Medium-Term Improvements (v2.0 - Major Refactor)

#### 4. Lazy L0 Minimap Tiles

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

#### 5. Virtual Page Rendering (Viewport-Only)

**Problem:** Pre-rendering all pages wastes memory for out-of-viewport pages.

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

**Already Partially Implemented:** ✅ Predictive rendering exists (v1.9.0+)

**Enhancement Needed:**
- Make eviction **more aggressive** for distant pages
- Track viewport history to identify "hot zones" (frequently visited pages)
- Keep hot zones cached even when out of viewport

---

#### 6. Tile-to-Tile Resampling

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

### Long-Term Vision (v3.0 - Next-Gen Architecture)

#### 7. Web Worker Page Rendering

**Problem:** Page rendering blocks main thread → janky UI.

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

#### 8. IndexedDB Page Cache Persistence

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

#### 9. Differential Tile Updates

**Problem:** Entire tile regenerated when one page updates.

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

## Performance Targets

### Current Performance (v1.9.3)

| PDF Size | Page Count | Load Time | Memory Usage | User Experience |
|----------|------------|-----------|--------------|-----------------|
| 915KB    | ~5 pages   | ~0.5s     | ~20MB        | ✅ Excellent     |
| 13MB     | ~50 pages  | ~3s       | ~150MB       | ✅ Good          |
| 50MB     | ~200 pages | ~15s      | ~600MB       | ⚠️ Sluggish     |
| 200MB    | ~1000 pages| ~60s      | **CRASH**    | ❌ Not viable    |

### Target Performance (v2.0 with Short-Term Fixes)

| PDF Size | Page Count | Load Time | Memory Usage | User Experience |
|----------|------------|-----------|--------------|-----------------|
| 915KB    | ~5 pages   | ~0.5s     | ~20MB        | ✅ Excellent     |
| 13MB     | ~50 pages  | ~2s       | ~150MB       | ✅ Excellent     |
| 50MB     | ~200 pages | ~4s       | ~400MB       | ✅ Good          |
| 200MB    | ~1000 pages| ~8s       | ~600MB       | ✅ Acceptable    |

**Key Improvement:** 200MB/1000-page PDF becomes viable (8s load, stable memory)

---

## Implementation Roadmap

### Phase 1: Critical Fixes (v1.9.5 - This Week)
- [x] Fix cache invalidation for edge tiles
- [x] Reduce on-demand debounce delay (100ms → 30ms)
- [x] Add draw failure diagnostics to debug panel
- [ ] Make Phase 3 upfront rendering conditional (skip for 200+ page PDFs)
- [ ] Increase low-res cache cap (200 → 500 pages on desktop)

**Impact:** 3x faster loading for large PDFs, no empty tiles on edges

---

### Phase 2: Performance Optimizations (v1.10.0 - Next Sprint)
- [ ] Progressive minimap population with scattered rendering
- [ ] Viewport-aware aggressive eviction for distant pages
- [ ] Hot zone tracking (keep frequently visited pages cached)
- [ ] Memory pressure detection (reduce cache sizes automatically)

**Impact:** 2x better memory efficiency, smoother panning for large PDFs

---

### Phase 3: Advanced Features (v2.0.0 - Next Quarter)
- [ ] Lazy L0 minimap with thumbnail extraction
- [ ] Virtual page rendering (viewport-only)
- [ ] Tile-to-tile resampling for instant zoom
- [ ] IndexedDB canvas persistence

**Impact:** Support for 1000+ page PDFs, instant page refresh

---

### Phase 4: Next-Gen Architecture (v3.0.0 - Future)
- [ ] Web Worker page rendering (parallel + non-blocking)
- [ ] Differential tile updates (selective redraw)
- [ ] Adaptive quality (reduce render scale under memory pressure)
- [ ] Streaming PDF support (render before full download)

**Impact:** Production-ready for enterprise use cases (legal, academic, publishing)

---

## Testing Strategy for Large PDFs

### Test Cases

1. **Small PDF (5-10 pages, <1MB)**
   - Baseline performance
   - Ensure no regressions

2. **Medium PDF (50-100 pages, 10-50MB)**
   - Current sweet spot
   - Validate all features work

3. **Large PDF (200-500 pages, 50-200MB)**
   - Stress test Phase 3 conditional logic
   - Monitor memory usage
   - Test cache eviction

4. **Huge PDF (1000+ pages, 500MB+)**
   - Validate graceful degradation
   - Test memory limits
   - Ensure no crashes

### Recommended Test PDFs

- **Small:** demo-1.pdf (915KB, ~5 pages) ✅ Already have
- **Medium:** natgeo-1969-05.pdf (13MB, ~50 pages) ✅ Already have
- **Large:** Academic textbook (200 pages) - Need to acquire
- **Huge:** Legal document (1000+ pages) - Need to acquire

**Sources for Test PDFs:**
- Project Gutenberg (public domain books)
- arXiv.org (academic papers, 100-200 page compilations)
- Court documents (1000+ page legal filings)
- Magazine archives (1-year compilations)

---

## Configuration Recommendations

### For Small Deployments (<100 pages typical)

```javascript
UPFRONT_RENDERING_ENABLED: true,
PAGE_CACHE_MAX_SIZE_LOW: 100,
PAGE_CACHE_MAX_SIZE_HIGH: 100,
MAX_CACHE_SIZE: 300,
```

**Rationale:** Full upfront rendering ensures no blank tiles, complete minimap coverage.

---

### For Large Deployments (200-1000 pages typical)

```javascript
UPFRONT_RENDERING_ENABLED: true,
UPFRONT_RENDERING_PAGE_THRESHOLD: 200,  // Skip Phase 3 for 200+ pages
PAGE_CACHE_MAX_SIZE_LOW: 500,           // Larger cache for minimap
PAGE_CACHE_MAX_SIZE_HIGH: 100,          // Viewport-focused
MAX_CACHE_SIZE: 400,
```

**Rationale:** Conditional upfront rendering, larger low-res cache for better minimap.

---

### For Mobile Devices

```javascript
// Auto-detected iOS applies these limits
MOBILE_PAGE_CACHE_MAX_SIZE_LOW: 200,    // Complete minimap
MOBILE_PAGE_CACHE_MAX_SIZE_HIGH: 50,    // Viewport only
MOBILE_MAX_CACHE_SIZE: 150,             // Tight memory budget
MOBILE_PDF_RENDER_SCALE: 2.0,           // 4x less memory than desktop
```

**Rationale:** Aggressive memory limits to prevent Safari crashes.

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

### Debug Panel Enhancements (v1.9.4+)

✅ **Added:**
- Draw failure diagnostics (show which pages fail to render)
- Breakdown by failure reason (no_canvas, invalid_dimensions, etc.)
- Clear failures button for testing

🔄 **Recommended Additions:**
- Phase timing breakdown (Phase 1: 500ms, Phase 2: 200ms, Phase 3: 8s)
- Memory pressure indicator (Green: <200MB, Yellow: 200-500MB, Red: >500MB)
- Cache thrash detector (high eviction rate = cache too small)
- Load time history graph (track performance over sessions)

---

## Conclusion

PDF Grid Viewer can scale to **1000+ page, 500MB+ PDFs** with targeted optimizations:

1. **Immediate (v1.9.5):** Conditional Phase 3 rendering → 3-5x faster load
2. **Near-term (v1.10.0):** Aggressive eviction + hot zones → 2x better memory
3. **Future (v2.0.0):** Virtual rendering + persistence → production-ready

**The architecture is sound** - all necessary infrastructure exists (viewport tracking, LRU caching, on-demand rendering, predictive loading). The fixes are mostly **configuration tuning** and **conditional logic**, not major refactors.

**Priority:** Implement Phase 1 fixes immediately (conditional Phase 3) for maximum impact with minimal risk.

---

**Last Updated:** 2025-11-16 (for v1.9.4)
