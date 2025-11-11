# PDF Grid Viewer - Architecture

## System Overview

The PDF Grid Viewer is a single-page application that renders PDF pages in a staggered diagonal grid pattern, enabling users to explore document structure and patterns through deep zoom navigation.

## Core Architecture Diagram

```
┌────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                                                         CONTINUOUS OPERATION VIEW                                                                                            │
└────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘


  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐                 ┌───────────────────────────────────────────┐                 ┌─────────────────────────────────────────┐
  │ PAGE CANVASES   │      │ GRID PATTERN    │      │  TILE CACHE     │                 │        TILE STREAMER                      │                 │   OPENSEADRAGON VIEWER                  │
  │   [STATIC]      │      │   [STATIC]      │      │  [DYNAMIC]      │  cache          │                                           │  tile requests  │                                         │
  │                 │      │                 │      │                 │  queries        │  • Receives tile requests                 │ ◀────────────── │ • Manages viewport                      │
  │ pageCanvases[]  │      │ pattern[][]     │      │ .get(key)       │ ──────────────▶ │  • Checks cache                           │                 │ • Requests tiles                        │
  │ Pre-rendered    │      │ Page# lookup    │      │   HIT/MISS      │                 │  • Orchestrates rendering on miss         │  tile URLs      │ • Displays tiles                        │
  │ canvases        │      │ Stagger pattern │      │ .set(key, url)  │ ◀────────────── │  • Returns tile URLs                      │ ──────────────▶ │                                         │
  └────────┬────────┘      └─────────┬───────┘      └─────────────────┘  store          └──────────────────┬────────────────────────┘                 └─────────────────────────────────────────┘
           │                         │                                                                      │
           │                         │                                                                      │
           │                         │                                                                      │
           │ pixel data              │ page# lookups                                                        │ uses for rendering
           │                         │                                                                      │
           │                         ▼                                                                      ▼
           │                    ┌─────────────────┐
           │                    │  TILE CANVAS    │◀────────────────────────────────────────────────────────┘
           │                    │  [WORKING]      │
           └───────────────────▶│                 │
                                │ • Clear         │
                                │ • Draw pages    │
                                │ • To JPEG       │
                                └─────────────────┘
```

## Component Details

### 1. Page Canvases [STATIC]
- **Type**: Array of HTML Canvas elements
- **State**: Initialized once, read-only thereafter
- **Purpose**: Stores pre-rendered PDF pages at configured scale (default 1.0x)
- **Creation**: All pages rendered upfront during PDF load via `PDFUtils.renderAllPages()`
- **Access**: Direct array indexing `pageCanvases[pageNum - 1]`
- **Memory**: Persistent for session duration

### 2. Grid Pattern [STATIC]
- **Type**: 2D array (N×N where N = number of pages)
- **State**: Computed once per PDF, read-only
- **Purpose**: Maps grid positions to page numbers in staggered diagonal pattern
- **Pattern**: Pages flow diagonally from top-center, creating repeating visual structure
- **Example** (5 pages):
  ```
  0 0 1 2 3
  0 1 2 3 4
  1 2 3 4 5
  2 3 4 5 0
  3 4 5 0 0
  ```
- **Usage**: `pattern[row][col]` returns page number for that grid cell

### 3. Tile Cache [DYNAMIC]
- **Type**: FIFO cache (Map-based)
- **State**: Grows dynamically as tiles are generated
- **Purpose**: Stores rendered tiles to avoid re-rendering
- **Key Format**: `"${level}_${x}_${y}"`
- **Value**: JPEG data URL (base64-encoded)
- **Max Size**: Configurable (default: 300 tiles)
- **Eviction**: Removes oldest entry when full
- **Performance**: Single Map lookup per get/set operation

### 4. Tile Canvas [WORKING]
- **Type**: Single HTML Canvas element (reusable workspace)
- **State**: Cleared and reused for each tile render
- **Purpose**: Temporary buffer for compositing tile content
- **Size**: Calculated based on page dimensions (default min: 512px)
- **Process**:
  1. Clear with background color
  2. Loop through grid positions
  3. Draw intersecting page portions
  4. Convert to JPEG data URL
  5. Return to caller
- **Optimization**: Reused instead of creating new canvas per tile

### 5. Tile Streamer [ACTIVE]
- **Type**: OpenSeadragon-compatible tile source class
- **State**: Continuously processing tile requests
- **Purpose**: Central coordinator that streams tiles on-demand and bridges PDF data with OpenSeadragon viewer
- **Responsibilities**:
  - Receive tile requests from OpenSeadragon
  - Check TileCache for existing tiles
  - Orchestrate tile rendering on cache miss
  - Query GridPattern for page positions
  - Read PageCanvases for pixel data
  - Return tile URLs (JPEG data URLs)
- **Key Methods**:
  - `getTileUrl(level, x, y)` - Main entry point
  - `_renderTile(level, x, y, scale, key)` - Generates tile
  - `_drawPageIntersection(row, col, ...)` - Composites pages

### 6. OpenSeadragon Viewer [ACTIVE]
- **Type**: Third-party deep zoom library
- **State**: Continuously monitoring user interaction
- **Purpose**: Viewport management and tile display
- **Responsibilities**:
  - Track viewport position and zoom level
  - Calculate which tiles are visible
  - Request tiles from TileStreamer
  - Composite and display tiles
  - Handle user input (pan, zoom, scroll)
- **Configuration**: Set via `OSDManager.initialize()`

## Data Flow Cycles

### Tile Request Cycle
```
User pans/zooms
    ↓
OpenSeadragon calculates visible tiles
    ↓
Requests tiles from TileStreamer
    ↓
TileStreamer checks TileCache
    ↓
├─ Cache HIT: Return cached data URL immediately
│
└─ Cache MISS:
    ├─ Query GridPattern for page positions
    ├─ Read pixel data from PageCanvases
    ├─ Render to TileCanvas
    ├─ Convert to JPEG data URL
    ├─ Store in TileCache
    └─ Return data URL
    ↓
OpenSeadragon displays tile
```

### Tile Rendering Cycle (on cache miss)
```
Calculate tile bounds in grid coordinates
    ↓
For each grid cell (row, col):
    ├─ Get page number from pattern[row][col]
    ├─ Skip if page number is 0 (blank)
    ├─ Get canvas from pageCanvases[pageNum - 1]
    ├─ Calculate page bounds in grid
    ├─ Check if page intersects tile bounds
    └─ If intersects:
        ├─ Calculate intersection rectangle
        ├─ Draw portion of page canvas to tile canvas
        └─ Continue to next cell
    ↓
All intersections drawn
    ↓
Convert tile canvas to JPEG data URL
    ↓
Return tile URL
```

## Component States

### STATIC Components
Components initialized once and not modified during operation:
- **Page Canvases**: Pre-rendered at PDF load time
- **Grid Pattern**: Computed once per PDF

These provide read-only lookup services to other components.

### DYNAMIC Components
Components that grow and change during operation:
- **Tile Cache**: Accumulates tiles as they are generated

### ACTIVE Components
Components that continuously process requests:
- **Tile Streamer**: Routes requests and orchestrates rendering
- **OpenSeadragon Viewer**: Monitors viewport and manages display

### WORKING Components
Temporary workspaces used during processing:
- **Tile Canvas**: Cleared and reused for each tile render

## Performance Characteristics

### Initialization (One-time cost)
1. **PDF Parsing**: PDF.js parses document structure
2. **Page Rendering**: All pages rendered to canvases at configured scale
3. **Grid Calculation**: Pattern and dimensions computed
4. **Viewer Setup**: OpenSeadragon initialized with tile source

### Runtime (Continuous)
1. **Tile Requests**: ~60fps viewport monitoring
2. **Cache Lookups**: O(1) Map lookup per tile
3. **Tile Generation**: Only on cache miss
4. **Memory Usage**: Grows with cache until max size

### Optimization Strategies
- **Upfront Rendering**: All pages rendered once, reused many times
- **Tile Caching**: Prevents redundant rendering
- **FIFO Eviction**: Simple, predictable cache management
- **Canvas Reuse**: Single tile canvas instead of creating new ones
- **JPEG Compression**: Reduces memory footprint of cached tiles

## Key Design Decisions

### Why Pre-render All Pages?
- Simplifies tile generation (no async page rendering)
- Ensures consistent quality across all zoom levels
- Enables instant tile generation from pixel data
- Trade-off: Higher initial load time for faster runtime

### Why Staggered Diagonal Grid?
- Creates visual continuity (adjacent pages in all directions)
- Reveals document patterns and structure
- More interesting than conventional wrapped grid
- Pages flow naturally top-to-bottom and left-to-right

### Why Tile Streamer?
- OpenSeadragon expects standard image pyramid
- PDF grid requires dynamic tile composition
- Multiple pages may appear in single tile
- Tile streamer bridges PDF data and OSD's tile system
- Streams tiles on-demand rather than pre-generating entire pyramid

### Why FIFO Cache?
- Simple implementation (single Map)
- Predictable behavior
- No reorganization overhead (vs LRU)
- Sufficient for static content (PDF pages don't change)

## Integration Points

### External Libraries
- **PDF.js**: PDF parsing and page rendering
- **OpenSeadragon**: Deep zoom viewer and viewport management
- **React**: UI component framework
- **Tailwind CSS**: Styling

### Module Boundaries
- **PDFUtils** → **Page Canvases**: Renders pages
- **GridPattern** → **Pattern Array**: Computes layout
- **TileStreamer** → **All Components**: Orchestrates rendering
- **OSDManager** → **OpenSeadragon**: Configures viewer

## Parallelism and Concurrency

### Current Execution Model

The application is primarily **sequential by design** with limited parallelism:

#### True Parallelism (Different Threads)
1. **PDF.js Web Worker**
   - PDF parsing and page rendering run in separate worker thread
   - Only true parallelism in the application
   - Configured via `PDFUtils.initWorker()`

2. **Browser Rendering Pipeline**
   - Browser compositor/rasterizer runs parallel to JavaScript
   - OpenSeadragon tile display happens in parallel with JS execution

#### Asynchronous Concurrency (Event Loop)
1. **User Input Events**
   - Pan, zoom, scroll handled asynchronously
   - Can interrupt or run alongside other operations
   - User can interact while PDF loads (e.g., click stop button)

2. **State Updates**
   - React state updates batched and processed asynchronously
   - Loading status and progress indicators update independently

3. **Tile Requests**
   - OpenSeadragon may request multiple tiles at once
   - BUT: TileStreamer processes them **sequentially** (one at a time)
   - Each tile generated synchronously before next request handled

#### Sequential Operations (Blocking)
1. **Initial Page Rendering**
   - Pages rendered one at a time: Page 1 → Page 2 → Page 3...
   - Sequential loop in `PDFUtils.renderAllPages()`
   - Yields to browser every N pages (`RENDER_BATCH_SIZE: 5`)

2. **Tile Generation**
   - Single tile canvas reused sequentially
   - One tile fully rendered before next starts
   - Grid loop processes page intersections in order

### Why Limited Parallelism?

1. **JavaScript is single-threaded** - Only one execution context in main thread
2. **Canvas operations are synchronous** - Drawing to canvas blocks execution
3. **Shared state** - TileCanvas reused, cannot render multiple tiles simultaneously
4. **Simplicity** - Sequential code easier to reason about and debug
5. **Sufficient performance** - Current approach meets performance needs for most documents

### Opportunities for Increased Parallelism

#### High Priority: Parallel Page Rendering
**Current:** Pages rendered sequentially (1→2→3...→N)

**Opportunity:**
- Render multiple pages simultaneously in separate canvases
- Use Promise.all() to parallelize chunks of page rendering
- Would significantly speed up initial load time

**Implementation:**
```javascript
// Render pages in batches of 5
const batchSize = 5;
for (let i = 0; i < numPages; i += batchSize) {
  const batch = [];
  for (let j = 0; j < batchSize && i + j < numPages; j++) {
    batch.push(renderPage(i + j));
  }
  const renderedBatch = await Promise.all(batch);
  pageCanvases.push(...renderedBatch);
}
```

**Benefits:**
- 3-5x faster initial rendering on multi-core devices
- Better CPU utilization during load

**Trade-offs:**
- Slightly more memory during rendering (temporary canvases)
- More complex error handling

#### Medium Priority: Web Workers for Tile Generation
**Current:** Tiles generated synchronously on main thread

**Opportunity:**
- Offload tile composition to Web Workers
- Transfer page canvases to workers (or use OffscreenCanvas)
- Generate multiple tiles in parallel

**Implementation approach:**
1. Create worker pool (2-4 workers)
2. Transfer page canvas data to workers
3. Workers generate tiles independently
4. Return data URLs to main thread

**Benefits:**
- Main thread remains responsive during tile generation
- Multiple tiles rendered simultaneously
- Smoother panning/zooming experience

**Trade-offs:**
- Worker communication overhead
- Canvas transfer costs (ImageBitmap or serialization)
- Significantly more complex architecture
- Memory overhead (canvas data duplicated in workers)

#### Low Priority: Multiple Tile Canvas Pool
**Current:** Single reusable tile canvas

**Opportunity:**
- Create pool of 3-5 tile canvases
- Render different tiles to different canvases simultaneously
- Still limited by single-threaded execution but reduces setup overhead

**Benefits:**
- Minor performance improvement
- Simpler than Web Workers

**Trade-offs:**
- More memory (multiple 512x512+ canvases)
- Still sequential due to single thread
- Limited benefit without true parallelism

#### Future: OffscreenCanvas API
**Current:** Regular Canvas API on main thread

**Opportunity:**
- Use OffscreenCanvas for worker-based rendering
- True parallel tile generation without transfer overhead
- Canvases live in worker memory

**Benefits:**
- Best of both worlds: parallel + no transfer cost
- Main thread completely free during tile rendering

**Trade-offs:**
- Browser support (OffscreenCanvas still maturing)
- Requires WebGL for best performance
- Complex debugging (worker context)

### Typical Execution Timeline

```
Time →

[PDF Load]
  ├─ (Parallel) PDF.js Worker parses PDF structure
  └─ (Main Thread) Waits for PDF object

[Page Rendering - Sequential]
  Page 1 → Page 2 → Page 3 → ... → Page N
  (yields every 5 pages to allow UI updates)

[Viewer Ready]

[User Pans] (Async event)
  ├─ OpenSeadragon calculates needed tiles
  ├─ Requests tiles from TileStreamer
  │   └─ (Sequential) Tile 1 → Tile 2 → Tile 3
  │       (each blocks until complete)
  └─ (Parallel) Browser composites tiles

[User Continues Panning] (Async event)
  └─ New tile requests queue up
      └─ Processed sequentially
```

### Recommendation

**Short term:** Keep current sequential model
- Performance is acceptable for most use cases
- Simplicity aids maintenance and debugging
- Stop button provides escape hatch for large documents

**Long term:** If performance becomes critical:
1. **First:** Implement parallel page rendering (high value, low complexity)
2. **Then:** Consider Web Workers for tile generation (if needed)
3. **Future:** Migrate to OffscreenCanvas when browser support matures

The key bottleneck is **initial page rendering**, not tile generation. Parallelizing page rendering would provide the most significant improvement with minimal architectural complexity.

## Tile Cache Optimization Opportunities

### Current Implementation

The TileCache is intentionally simple - a FIFO (First In First Out) cache with fixed size limit:

```javascript
class TileCache {
  constructor(maxSize = 300) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    return this.cache.get(key) || null;  // O(1) lookup
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Remove oldest entry (first in Map)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**Characteristics:**
- **Eviction**: FIFO - removes oldest entry when full
- **Size limit**: Count-based (300 tiles) not memory-based
- **Lookup**: O(1) via Map
- **No prioritization**: All tiles treated equally
- **Stateless**: No awareness of viewport or access patterns

**Why FIFO?**
- Simplest possible implementation
- Minimal overhead (no access tracking)
- Predictable behavior
- Sufficient for static content (PDF pages don't change)

### Opportunities for Improvement

#### High Priority: LRU (Least Recently Used) Eviction

**Current limitation:**
- FIFO evicts oldest entry, even if still frequently accessed
- Revisiting previous zoom level requires re-rendering tiles

**Opportunity:**
- Track access time on each `get()`
- Evict least recently accessed tile instead of oldest

**Implementation:**
```javascript
class LRUCache {
  constructor(maxSize) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(key) {
    const value = this.cache.get(key);
    if (value) {
      // Move to end (most recently used)
      this.cache.delete(key);
      this.cache.set(key, value);
    }
    return value || null;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      // Remove first (least recently used)
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }
}
```

**Benefits:**
- Better hit rate for back-and-forth navigation
- Keeps frequently accessed zoom levels cached
- Minimal performance cost (still O(1) operations)

**Trade-offs:**
- Slightly more operations per access (delete + set on hit)
- Still very simple implementation

**Estimated improvement:** 10-20% better cache hit rate for typical usage

#### Medium Priority: Memory-Based Limits

**Current limitation:**
- Count-based limit (300 tiles) doesn't reflect actual memory usage
- Tile sizes vary significantly (zoom level, content complexity)
- No visibility into actual memory consumption

**Opportunity:**
- Track bytes stored instead of tile count
- Set memory budget (e.g., 50MB) instead of tile count
- Better memory predictability

**Implementation:**
```javascript
class MemoryAwareCache {
  constructor(maxBytes = 50 * 1024 * 1024) { // 50MB default
    this.cache = new Map();
    this.maxBytes = maxBytes;
    this.currentBytes = 0;
  }

  get(key) {
    return this.cache.get(key)?.data || null;
  }

  set(key, dataUrl) {
    // Estimate size (base64 is ~1.33x original)
    const bytes = Math.floor(dataUrl.length * 0.75);

    // Evict until we have space
    while (this.currentBytes + bytes > this.maxBytes && this.cache.size > 0) {
      const firstKey = this.cache.keys().next().value;
      const firstEntry = this.cache.get(firstKey);
      this.currentBytes -= firstEntry.bytes;
      this.cache.delete(firstKey);
    }

    this.cache.set(key, { data: dataUrl, bytes });
    this.currentBytes += bytes;
  }
}
```

**Benefits:**
- Predictable memory usage
- Automatic adjustment based on tile complexity
- Can tune to device capabilities

**Trade-offs:**
- Slightly more complex
- Memory estimation not perfect (base64 overhead)
- Needs tuning for different devices

**Estimated improvement:** Better memory control, fewer OOM issues on low-memory devices

#### Medium Priority: Spatial/Viewport Awareness

**Current limitation:**
- No knowledge of which tiles are near viewport
- Equal priority for distant and nearby tiles
- May evict tiles user is about to pan to

**Opportunity:**
- Track viewport position and zoom
- Prioritize tiles near viewport
- Evict distant tiles first

**Implementation:**
```javascript
class SpatialCache extends LRUCache {
  constructor(maxSize, getCurrentViewport) {
    super(maxSize);
    this.getCurrentViewport = getCurrentViewport; // Function returning {x, y, zoom}
  }

  _tileDistance(key) {
    const [level, x, y] = key.split('_').map(Number);
    const viewport = this.getCurrentViewport();

    // Calculate distance from viewport center
    // Prefer tiles at current zoom level and near viewport
    const levelDiff = Math.abs(level - viewport.zoom);
    const spatialDist = Math.sqrt(
      Math.pow(x - viewport.x, 2) +
      Math.pow(y - viewport.y, 2)
    );

    return levelDiff * 1000 + spatialDist;
  }

  set(key, value) {
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      // Find most distant tile to evict
      let maxDist = -1;
      let evictKey = null;

      for (const k of this.cache.keys()) {
        const dist = this._tileDistance(k);
        if (dist > maxDist) {
          maxDist = dist;
          evictKey = k;
        }
      }

      if (evictKey) {
        this.cache.delete(evictKey);
      }
    }
    this.cache.set(key, value);
  }
}
```

**Benefits:**
- Keeps relevant tiles cached longer
- Smoother panning experience
- Better hit rate for local navigation

**Trade-offs:**
- O(n) eviction cost (scan all tiles to find most distant)
- Needs viewport state integration
- More complex logic

**Estimated improvement:** 20-30% better hit rate during active panning

#### Low Priority: Predictive Prefetching

**Current limitation:**
- Purely reactive - generates tiles only when requested
- Visible lag when panning to new area

**Opportunity:**
- Pre-generate tiles adjacent to viewport
- Use requestIdleCallback for background generation
- Anticipate pan direction based on recent movement

**Implementation approach:**
1. Track recent pan direction and velocity
2. During idle time, pre-generate tiles in likely direction
3. Store in cache before they're needed
4. Smooth panning with no visible tile generation lag

**Benefits:**
- Appears instant when user pans
- Better perceived performance
- Utilizes idle CPU time

**Trade-offs:**
- Might generate tiles never viewed
- More complex state tracking
- Needs careful idle detection

**Estimated improvement:** Subjectively much smoother, especially on slower devices

#### Low Priority: Persistent Cache (IndexedDB)

**Current limitation:**
- Cache cleared on page refresh
- Re-render everything on revisit

**Opportunity:**
- Store tiles in IndexedDB
- Persist across sessions
- Instant load for previously viewed PDFs

**Implementation:**
```javascript
class PersistentCache {
  async init(pdfId) {
    this.pdfId = pdfId;
    this.memoryCache = new Map();
    this.db = await openIndexedDB('TileCache');
  }

  async get(key) {
    // Check memory first
    let value = this.memoryCache.get(key);
    if (value) return value;

    // Check IndexedDB
    value = await this.db.get(this.pdfId + '_' + key);
    if (value) {
      this.memoryCache.set(key, value); // Promote to memory
    }
    return value;
  }

  async set(key, value) {
    this.memoryCache.set(key, value);
    await this.db.set(this.pdfId + '_' + key, value);
  }
}
```

**Benefits:**
- Instant re-load of previously viewed PDFs
- Great for repeated use of same documents
- Reduces server load for remote PDFs

**Trade-offs:**
- IndexedDB complexity (async, quota management)
- Need PDF identity/version tracking
- Storage quota limits
- Stale cache invalidation

**Estimated improvement:** Near-instant reload for repeated visits

#### Future: Adaptive Cache Sizing

**Opportunity:**
- Dynamically adjust cache size based on device
- Detect available memory (navigator.deviceMemory)
- Scale cache limit accordingly

**Example:**
```javascript
const deviceMemory = navigator.deviceMemory || 4; // GB
const cacheSize = Math.floor(deviceMemory * 75); // ~75 tiles per GB
```

**Benefits:**
- Optimal cache usage per device
- Better experience on high-memory devices
- Fewer OOM crashes on low-memory devices

### Recommendation

**Immediate (v1.6):**
1. **Implement LRU eviction** - Simple change, clear benefit
   - Replace FIFO with LRU
   - ~2 hours work
   - 10-20% better hit rate

**Short term (v1.7):**
2. **Add memory-based limits** - Better control
   - Track actual bytes
   - ~4 hours work
   - Prevents memory issues

**Long term (v2.0):**
3. **Spatial awareness** - If cache hit rate still problematic
   - Viewport-aware eviction
   - ~6 hours work
   - 20-30% better hit rate

**Future considerations:**
- Predictive prefetching (complexity vs benefit unclear)
- Persistent cache (valuable for repeated use cases)
- Adaptive sizing (nice to have)

**Current cache is adequate** - FIFO works well for linear exploration. Only optimize if profiling shows cache misses as bottleneck.

### OpenSeadragon's Internal Cache

**Important discovery:** OpenSeadragon has its own TileCache that we're not configuring!

#### Two-Tier Caching System

The application currently has **two layers of caching**:

```
Layer 1: Our TileCache (TileStreamer)
  - Stores JPEG data URLs (base64 strings)
  - Size: 300 tiles (configurable)
  - Prevents tile regeneration

Layer 2: OpenSeadragon's TileCache
  - Stores decoded Image objects
  - Size: Default (unconfigured by us)
  - Prevents data URL → Image conversion
```

**Data flow:**
```
OSD requests tile
    ↓
OSD TileCache check
    ├─ HIT: Return Image (instant)
    └─ MISS: Request from TileStreamer
         ↓
    Our TileCache check
         ├─ HIT: Return data URL → Create Image
         └─ MISS: Generate tile → data URL → Create Image
```

#### Memory Implications

**Current (unoptimized):**
- Our cache: ~50-100MB (300 data URL strings)
- OSD cache: ~50-100MB+ (Image pixel data)
- **Total: 100-200MB for redundant caching**

**Why redundancy:**
- Same tile stored twice in different forms
- Data URL string + decoded Image pixels
- OSD cache serves speed, our cache prevents regeneration

#### Configuration Options

**Option 1: Disable our cache (rely on OSD)**
```javascript
// In TileStreamer constructor
this.cache = null; // No caching

// In generateTile()
// Always generate fresh, let OSD cache
return this._renderTile(level, x, y, scale, key);
```

**Pros:**
- Simpler architecture
- Single cache to manage
- Less total memory usage

**Cons:**
- Re-generates tiles whenever OSD evicts
- Tile generation more frequent
- CPU cost of regeneration

**Option 2: Disable OSD cache (use only ours)**
```javascript
// In OSDManager.initialize()
const viewerConfig = {
  // ... other config
  maxImageCacheCount: 10, // Minimal OSD cache
}
```

**Pros:**
- Full control over eviction policy
- Data URLs cheaper than decoded Images
- Can implement smarter eviction (LRU, spatial)

**Cons:**
- Data URL → Image conversion on every display
- Slightly slower (conversion overhead)
- More requests to our cache

**Option 3: Coordinate both caches (current)**
```javascript
// Keep both, but optimize sizes
CONFIG.MAX_CACHE_SIZE = 300;  // Our cache (data URLs)
maxImageCacheCount: 100       // OSD cache (smaller)
```

**Pros:**
- Fastest performance (two-tier benefit)
- Our cache: long-term, prevents regeneration
- OSD cache: short-term, prevents conversion

**Cons:**
- Most memory usage
- Redundant storage
- Complex to reason about

**Option 4: Large our cache, minimal OSD cache**
```javascript
CONFIG.MAX_CACHE_SIZE = 500;  // Large data URL cache
maxImageCacheCount: 20        // Tiny Image cache
```

**Pros:**
- Data URLs are cheaper than Images
- Prevents most regeneration
- Reasonable memory trade-off

**Cons:**
- Frequent data URL → Image conversions
- Need to tune both limits

#### Recommendation

**Immediate action:**
1. **Configure OSD's cache explicitly** - Currently using unknown default
   ```javascript
   // In viewerConfig
   maxImageCacheCount: 100  // Or experiment with values
   ```

2. **Measure actual memory usage** - Use browser DevTools to see both caches
   - Heap snapshot before/after loading
   - Monitor during panning/zooming

3. **Profile cache hit rates** - Add logging to understand behavior
   ```javascript
   // In our TileCache
   this.hits = 0;
   this.misses = 0;

   get(key) {
     const value = this.cache.get(key);
     if (value) this.hits++;
     else this.misses++;
     return value || null;
   }
   ```

**Long term optimization (v1.7+):**
- **Option 4 recommended**: Large our cache, small OSD cache
- Rationale:
  - Data URLs are ~50% cheaper than decoded Images
  - Our cache can be smarter (LRU, spatial)
  - OSD cache just for immediate viewport
  - Better memory efficiency

**Test configuration:**
```javascript
// Our cache (data URLs) - generous
CONFIG.MAX_CACHE_SIZE = 400

// OSD cache (Images) - minimal, just active viewport
maxImageCacheCount: 50
```

This gives us smart eviction control while keeping memory usage reasonable.

## Future Considerations

### On-Demand Progressive Rendering with Dual Viewports

**Critical insight:** The application has **two simultaneous OpenSeadragon viewports** with fundamentally different needs:

#### Viewport Characteristics

**Navigator (Minimap):**
- Shows entire grid at once
- Never changes after initial population
- Needs low-resolution complete coverage
- Rendered once, used forever
- Quality: Low is acceptable (structure/patterns visible)
- Priority: Complete coverage over detail

**Main Viewer (Deep Zoom):**
- Shows small portion at high zoom
- Changes constantly (pan/zoom)
- Needs high-resolution for viewport area
- Progressive updates as user navigates
- Quality: High detail required
- Priority: Viewport area over complete coverage

#### Dual-Resolution Strategy

This maps directly to the analysis in `RENDERING_ANALYSIS.md`. We need **two resolution tiers**:

```
Page Rendering:
├─ Low-res tier (0.2-0.5x scale)
│  └─ For navigator/minimap
│     - Render all pages eventually
│     - Scattered order (bit-reversal for even coverage)
│     - Lower priority background task
│
└─ High-res tier (1.0x+ scale)
   └─ For main viewer
      - Render viewport area first
      - On-demand as user navigates
      - Higher priority foreground task
```

#### Page Rendering Strategy

**Phase 1: Initial viewport (high-res)**
```javascript
// Identify pages in initial viewport
const viewportPages = calculateViewportPages(initialViewport);

// Render high-res for visible area FIRST
for (const pageNum of viewportPages) {
  highResCanvases[pageNum] = await renderPage(pageNum, 1.0);
}
```

**Phase 2: Minimap coverage (low-res, scattered)**
```javascript
// Bit-reversal order for even coverage
const scatteredOrder = bitReversalOrder(numPages);

// Render low-res for all pages (background)
for (const pageNum of scatteredOrder) {
  lowResCanvases[pageNum] = await renderPage(pageNum, 0.3);
  // Show progress in minimap as it populates
}
```

**Phase 3: On-demand (high-res, viewport-driven)**
```javascript
// As user pans/zooms
onViewportChange((newViewport) => {
  const neededPages = calculateViewportPages(newViewport);

  for (const pageNum of neededPages) {
    if (!highResCanvases[pageNum]) {
      // Render high-res on-demand
      highResCanvases[pageNum] = await renderPage(pageNum, 1.0);
    }
  }
});
```

#### Tile Streaming Strategy

TileStreamer must select appropriate resolution based on **zoom level**:

```javascript
class TileStreamer {
  constructor(gridDims, pattern, lowResCanvases, highResCanvases, numPages) {
    this.lowResCanvases = lowResCanvases;
    this.highResCanvases = highResCanvases;
    // ...
  }

  _selectCanvas(pageNum, zoomLevel) {
    // Low zoom levels (minimap range): use low-res
    if (zoomLevel < this.minimapMaxLevel) {
      return this.lowResCanvases[pageNum - 1];
    }

    // High zoom levels (main viewer): use high-res if available
    const highRes = this.highResCanvases[pageNum - 1];
    if (highRes) {
      return highRes;
    }

    // Fallback: use low-res and queue high-res render
    this.queueHighResRender(pageNum);
    return this.lowResCanvases[pageNum - 1];
  }

  _renderTile(level, x, y, scale, key) {
    // Determine which pages intersect this tile
    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const pageNum = this.pattern[row][col];

        // Select appropriate resolution
        const canvas = this._selectCanvas(pageNum, level);

        // Draw to tile
        this._drawPageIntersection(canvas, ...);
      }
    }
  }
}
```

#### Cache Strategy (Two-Tier per Resolution)

Different caching policies for different zoom levels:

```
Navigator tiles (low zoom):
├─ Rendered once
├─ Never evict (or very low priority)
├─ Protected in cache
└─ Complete coverage goal

Main viewer tiles (high zoom):
├─ Rendered on-demand
├─ Active eviction (LRU/spatial)
├─ Viewport-aware
└─ Quality over coverage
```

**Implementation:**
```javascript
class ZoomAwareCache {
  constructor(navigatorMaxLevel) {
    this.navigatorMaxLevel = navigatorMaxLevel;
    this.navigatorCache = new Map(); // Never evict
    this.viewerCache = new LRUCache(300); // Active eviction
  }

  get(key) {
    const [level] = key.split('_').map(Number);

    // Navigator tiles: permanent cache
    if (level <= this.navigatorMaxLevel) {
      return this.navigatorCache.get(key);
    }

    // Viewer tiles: LRU cache
    return this.viewerCache.get(key);
  }

  set(key, value) {
    const [level] = key.split('_').map(Number);

    if (level <= this.navigatorMaxLevel) {
      this.navigatorCache.set(key, value); // Keep forever
    } else {
      this.viewerCache.set(key, value); // Subject to eviction
    }
  }
}
```

#### OpenSeadragon Cache Coordination

With dual viewports, OSD's cache serves both:

```javascript
// Recommended configuration
const viewerConfig = {
  // ... other config

  // OSD cache: sized for main viewport + navigator
  // Navigator tiles: ~50-100 (whole grid at low res)
  // Active viewport: ~50 (high res current view)
  maxImageCacheCount: 150,

  // Navigator gets cached permanently
  // Main viewer gets LRU behavior
}
```

#### Rendering Priority Queue

Pages have different priorities based on viewport needs:

```javascript
const renderQueue = {
  high: [],    // In current viewport (main viewer)
  medium: [],  // Adjacent to viewport (predictive)
  low: []      // Minimap coverage (background)
};

async function processRenderQueue() {
  while (true) {
    if (renderQueue.high.length > 0) {
      const pageNum = renderQueue.high.shift();
      await renderHighRes(pageNum);
    } else if (renderQueue.medium.length > 0) {
      const pageNum = renderQueue.medium.shift();
      await renderHighRes(pageNum);
    } else if (renderQueue.low.length > 0) {
      const pageNum = renderQueue.low.shift();
      await renderLowRes(pageNum);
    } else {
      await waitForWork();
    }
  }
}
```

#### Memory Budget Distribution

With dual viewports and dual resolutions:

```
Total memory budget: ~200MB
├─ Low-res canvases: ~20MB (all pages at 0.3x)
├─ High-res canvases: ~60MB (viewport pages at 1.0x, ~30% of doc)
├─ Our tile cache: ~60MB (mixed low/high zoom tiles)
└─ OSD tile cache: ~60MB (Image objects for both viewports)
```

#### Benefits of This Approach

1. **Fast initial display**
   - Navigator populates progressively (scattered rendering)
   - Main viewer shows viewport immediately (priority rendering)
   - User sees something useful within seconds

2. **Efficient memory use**
   - Low-res tier is cheap (~20MB for entire document)
   - High-res only for explored areas
   - Navigator doesn't require high-res at all

3. **Smooth experience**
   - Navigator always responsive (low-res cached)
   - Main viewer gets quality on-demand
   - No re-rendering of minimap

4. **Scalable to large documents**
   - 1000-page PDF: 20MB low-res + selective high-res
   - vs 200MB+ for full high-res upfront

#### Implementation Phases

**Phase 1: Dual resolution rendering** ✅ IMPLEMENTED
- ✅ Implemented `renderDualResolution()` in PDFUtils
- ✅ Low-res scattered order (bit-reversal)
- ✅ High-res viewport priority
- ✅ Three-phase rendering: priority pages → minimap → remaining pages

**Phase 2: Resolution-aware TileStreamer** ✅ IMPLEMENTED
- ✅ Accept both canvas arrays (constructor updated)
- ✅ Select resolution based on zoom level (`_selectCanvas()` method)
- ✅ Fallback to low-res if high-res not available
- ✅ Minimap max level calculation (30% of max level)

**Phase 3: Split cache strategy** ⏳ TODO
- ⏸️ Separate navigator vs viewer caching (optional optimization)
- ⏸️ Protect navigator tiles from eviction (optional optimization)
- ⏸️ LRU for viewer tiles (current simple cache works adequately)
- Note: Current unified cache performs well; this is a future optimization

**Phase 4: Adaptive rendering** ⏳ TODO (Future Enhancement)
- ⏸️ Monitor viewport changes for on-demand rendering
- ⏸️ Queue high-res renders for new areas as user navigates
- ⏸️ True progressive rendering (currently pre-renders all pages)
- Note: Current implementation pre-renders all pages in smart order

#### Key Design Decisions

**Why low-res for navigator?**
- Navigator shows entire grid (thousands of tiles at low zoom)
- Structure/patterns visible even at low resolution
- Dramatically reduces memory and rendering time
- User never zooms into navigator (read-only overview)

**Why on-demand for main viewer?**
- User only explores small fraction of document
- High-res needed only for viewed areas
- Reduces initial load time
- Memory scales with exploration, not document size

**Why scattered rendering for minimap?**
- Even coverage appears faster
- User sees complete picture earlier (at lower fidelity)
- Better perceived performance than sequential
- Bit-reversal order is optimal for progressive display

This architecture transforms the app from **"render everything upfront"** to **"render what's needed, when it's needed, at the resolution it's needed"** - while respecting the distinct requirements of two simultaneous viewports.

### Adaptive Quality
- Render tiles at higher quality for static viewport
- Lower quality for active panning/zooming
- Balance between responsiveness and visual quality

### Smart Caching
- Spatial locality (cache neighboring tiles)
- Viewport prediction (pre-generate likely tiles)
- Priority eviction (keep central viewport tiles)

---

**Version**: 1.5.4
**Last Updated**: 2025-11-10
