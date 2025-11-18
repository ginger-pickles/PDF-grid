# PDF Grid Viewer - Development Notes

## Known Visual Issues

**Antialiasing Halo** - Dark hairlines at tile boundaries due to canvas antialiasing. Current mitigation: JPEG tiles + subPixelRoundingForTransparency:2 + 1px overlap. See TODO.md line 37.

## Performance Optimization Ideas

### Lazy-LRU Cache (Future Reference)

For cache analytics or advanced eviction strategies:

```javascript
class LazyLRUCache {
  constructor(maxSize) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.accessCounter = 0;
    this.accessTimes = new Map();
  }

  get(key) {
    const value = this.cache.get(key);
    if (value !== undefined) {
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

**Benefits**: O(1) get/set, O(n) eviction only when full, extensible for analytics/metrics.

### Other Optimization Ideas

**Grid Periodicity** - Staggered pattern repeats every N rows/cols. Could exploit for cache deduplication at minimap scales. See TODO.md.

**Rectangular Tiles** - Match page aspect ratio (e.g., 612×792) instead of square tiles. Better packing, fewer tiles, less waste.

## Current Implementation (v1.9.x)

✅ Parallel rendering (viewport-aware, CPU core detection)
✅ Predictive rendering (velocity-based motion prediction)
✅ On-demand rendering (cache miss triggers)
✅ Adaptive fallback (intelligent resolution fallback)
✅ LRU caching (separate low-res/high-res page caches + tile cache)
✅ Progressive loading (priority viewport, scattered minimap, background rendering)

See CHANGELOG.md v1.8.0-v1.9.6 for details.
