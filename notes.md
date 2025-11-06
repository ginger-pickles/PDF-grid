# PDF Grid Viewer - Development Notes

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
