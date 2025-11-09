# Progressive Loading Implementation Notes

## Current Status (v1.6.0)

### What Works
- ✅ Viewer appears after 20% of pages rendered (~5 seconds for 53-page PDF)
- ✅ Background rendering continues after viewer initialization
- ✅ Periodic tile invalidation (every 5 pages)
- ✅ Console shows progress: "Invalidated tiles after rendering X/Y pages"
- ✅ Fixed `shouldCache` logic: only cache complete tiles (missingPagesSet.size === 0)

### The Core Problem

**Tiles and pages are orthogonal:**
- One tile (zoomed out) contains portions of 20+ pages
- One page (zoomed in) spans 50+ tiles
- Current invalidation is page-count based, not tile-aware

**Current invalidation strategy is inefficient:**
```javascript
// Every 5 pages:
tiledImage.reset();  // Nuclear option - clears ALL tiles from OSD cache
```

When page 15 finishes:
- ALL tiles invalidated (hundreds)
- OSD re-requests ALL visible tiles
- Complete tiles (pages 1-11) get regenerated unnecessarily
- Incomplete tiles (containing page 15) regenerate correctly
- **Wasted work:** regenerating tiles that didn't need updating

### What We Need (But Don't Have Yet)

**1. Tile-to-Page Mapping**
```javascript
incompleteTiles = {
  "1_0_0": new Set([5, 8, 12, 15]),  // This tile needs these pages
  "1_0_1": new Set([8, 12, 15, 18]),
  // ...
}
```

**2. Page-to-Tile Reverse Mapping**
```javascript
pageToTiles = {
  15: new Set(["1_0_0", "1_0_1", "1_2_3"]),  // Page 15 appears in these tiles
  // ...
}
```

**3. Selective Invalidation (Ideal But Impossible?)**
```javascript
// When page 15 finishes:
const affectedTiles = pageToTiles[15];
for (const tileKey of affectedTiles) {
  invalidateSpecificTile(tileKey);  // ❌ OSD doesn't expose this API
}
```

**OSD's Limitation:**
- Only provides `reset()` - nuclear option that clears ALL tiles
- No API for "invalidate tile at (level, x, y)"

**4. Viewport-Aware Rendering Priority**
- Determine which tiles are currently visible
- Extract which pages those tiles need
- Render visible pages FIRST
- Already have `prefetchVisiblePages()` infrastructure, but not fully utilized

**5. Intelligent Cache Strategy**
- PriorityTileCache already evicts high-zoom tiles first
- Keeps low-zoom tiles (show whole grid) = correct priority
- But we're still regenerating complete tiles after `reset()`

### Architectural Tension

**Two caches fighting each other:**
1. **Our PriorityTileCache** - Caches complete tiles, rejects incomplete ones
2. **OSD's internal cache** - Caches whatever we return

When we call `reset()`:
- OSD cache cleared
- OSD re-requests tiles
- Our cache serves complete tiles (fast)
- Our cache misses incomplete tiles (regenerates with new pages)

**The inefficiency:**
- We clear our cache entries? No, we don't
- We clear OSD's cache entries? Yes, via `reset()`
- Complete tiles served from our cache quickly
- But OSD still has to make the request, decode the data URL, etc.

### Ideas Considered

**Option A: Less frequent invalidation**
- Only reset() when X% of pages complete
- Pro: Less wasted work
- Con: User sees incomplete view for longer

**Option B: Viewport-aware invalidation**
- Track visible tiles
- Only reset() when visible incomplete tiles would improve
- Pro: Only update what user sees
- Con: Complex, and still uses nuclear reset()

**Option C: Manual cache manipulation**
- When page N renders, delete affected tiles from OUR cache
- Don't call reset() at all
- Problem: OSD still has them cached, won't re-request
- Doesn't work

**Option D: Accept inefficiency**
- Current approach works
- Performance acceptable for <100 page PDFs
- Optimize later if needed

**Option E: Two-Tier Rendering (Future)**
- Low-res (0.5x): Render ALL pages quickly → complete grid fast
- High-res (2.0x): Render on-demand when zoomed in
- Orthogonal to invalidation problem

### Key Questions

1. **Can we avoid calling reset() entirely?**
   - No - OSD won't know to re-request tiles otherwise
   - We need some invalidation mechanism

2. **Can we selectively invalidate specific tiles?**
   - Not with OSD's public API
   - `reset()` is the only option

3. **Should we build tile-to-page mapping?**
   - Useful for tracking which tiles are incomplete
   - Useful for determining when reset() would be beneficial
   - But doesn't solve the "selective invalidation" problem

4. **What's the optimal reset() frequency?**
   - Too frequent: wasted work regenerating complete tiles
   - Too infrequent: user sees incomplete view for too long
   - Current: every 5 pages (arbitrary)
   - Better: when visible tiles would significantly improve

### Performance Characteristics

**53-page PDF:**
- Initial render (11 pages): ~5 seconds
- Background render (42 pages): ~20 seconds
- Total resets: ~9 times
- Each reset: regenerates ~50-100 visible tiles
- Tiles from cache: fast (~1ms)
- Tiles regenerated: medium (~10-50ms)

**100-page PDF (projected):**
- Initial render (20 pages): ~10 seconds
- Background render (80 pages): ~40 seconds
- Total resets: ~16 times
- Each reset: regenerates ~100-200 visible tiles
- More wasted work, but still acceptable?

### Code Locations

**Progressive loading flow:**
- index.html:1509-1592 - Main progressive loading logic
- index.html:1562-1570 - Batch invalidation (every 5 pages)
- index.html:1574-1581 - Final invalidation

**Tile generation:**
- index.html:991-1015 - Track needed/missing pages per tile
- index.html:1037 - shouldCache logic (only cache if missingPagesSet.size === 0)

**Caching:**
- index.html:538-641 - PriorityTileCache (evicts high-zoom tiles first)
- index.html:396-527 - PageCache (LRU for rendered pages)

### Next Steps to Consider

**Direction A: Smart invalidation**
- Build tile-to-page mapping during getTileUrl()
- Track incomplete tiles
- Only reset() when visible tiles would improve significantly
- Complexity: high, benefit: moderate

**Direction B: Accept current approach**
- Keep reset() every N pages
- Tune N based on PDF size
- Simple, works, some inefficiency acceptable
- Complexity: low, benefit: done

**Direction C: Rethink architecture**
- Maybe progressive loading isn't the right approach for this app
- App's primary use case: see ALL pages zoomed out
- Two-tier rendering might be better fit
- Complexity: high, benefit: high for large PDFs

**Direction D: Hybrid approach**
- Start with two-tier: low-res all pages (fast)
- Then progressive high-res on zoom
- Best UX, most complexity

## Open Questions

1. Is the current inefficiency (regenerating complete tiles) actually a problem in practice?
2. Can we measure the performance impact of reset()?
3. Should we optimize now or wait for real-world usage feedback?
4. Is two-tier rendering a better architectural fit?
