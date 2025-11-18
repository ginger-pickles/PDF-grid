# PDF Grid Viewer - Development Notes

## Known Visual Issues

### Antialiasing Halo Issue (Dark Hairlines at Tile Edges)

**Status**: Known issue, documented in TODO.md line 37

**Issue**: Dark hairlines visible at tile boundaries due to canvas antialiasing blending white page edges with dark background.

**Current Mitigation**:
- JPEG tiles + subPixelRoundingForTransparency:2 + 1px overlap
- Significantly improved on desktop, some hairlines remain on iOS Safari

**See**: TODO.md "Further improve sub-pixel hairline gaps between tiles (iOS Safari)" for full analysis and investigation notes.

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

## Performance Features (Current Implementation)

The following performance features are **already implemented** in v1.9.x:

✅ **Parallel Rendering** - Viewport-aware parallel page rendering with CPU core detection
✅ **Predictive Rendering** - Velocity-based motion prediction for ahead-of-viewport rendering
✅ **On-Demand Rendering** - Immediate render trigger on cache miss with fire-and-forget async
✅ **Adaptive Fallback** - Intelligent resolution fallback with scale-aware limits
✅ **LRU Caching** - Separate LRU caches for pages (low-res/high-res) and tiles

See `CHANGELOG.md` v1.9.0-v1.9.6 for implementation details.

## CORS Proxy (Current Implementation)

**Current**: `CONFIG.CORS_PROXY` = `'https://corsproxy.io/?'`
- Automatically applied to external URLs
- Local files and same-origin URLs bypass proxy
- See README.md for configuration details and security considerations

## Browser History & Page Refresh

**Status**: Current implementation uses `history.replaceState()` for URL management.

**Future enhancement ideas** (not currently prioritized):
- Multi-file history support with `pushState()`
- Canvas persistence in IndexedDB for faster refresh
- See TODO.md for feature requests

## Grid Pattern Periodicity

**Observation**: The staggered diagonal grid pattern creates spatial periodicity - the arrangement repeats every N rows/columns (where N = number of pages).

**Potential optimization**: Exploit periodicity for cache deduplication at minimap scales.

**Status**: Not currently implemented. Current LRU cache performs well for typical use cases.

**See**: TODO.md line 56-58 for detailed investigation notes on periodicity exploitation.

## Rectangular Tiles (Future Consideration)

**Current**: Square tiles sized to `max(pageWidth, pageHeight)`

**Potential optimization**: Use rectangular tiles matching page aspect ratio (e.g., 612×792 for US Letter)

**Benefits**: Better tile packing, fewer tiles needed, less wasted canvas space

**Status**: Not currently prioritized. Square tiles work well for current use cases.

## Progressive Loading & Background Rendering

**Status**: ✅ **Fully implemented in v1.9.x**

The application now features sophisticated progressive loading with:
- Priority rendering for viewport pages
- Scattered bit-reversal ordering for minimap
- Background rendering without blocking UI
- Bidirectional resolution fallback
- Automatic tile invalidation when pages finish rendering

See `CHANGELOG.md` v1.8.0-v1.9.6 for complete implementation history.
