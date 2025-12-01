# THIS-BRANCH: Tile Loading Investigation

**Branch:** Sunday
**Status:** ✅ Resolved in v1.11.0


THE NEXT THING:
Now that we have asychronous tile request & generation, we can implement progressive tile generation. We should re-publish tiles as pages are completed.







---

## The Problems

2. **Low-res at high zoom** - Wrong resolution tiles displayed at detail levels

---

## Root Cause: Impedance Mismatch
---

## The Fix: Async Tile Pattern

OSD has `downloadTileStart` for true async loading:

```javascript
downloadTileStart(context) {
  if (contentReady) {
    context.finish(ctx);  // Complete immediately
  } else {
    pendingJobs.set(key, { context, ... });  // OSD knows tile is "loading"
    // Later, when content ready: context.finish(ctx)
  }
}
```

**Why this works:**
- OSD tracks "loading" vs "loaded" state
- OSD uses natural fallback (upscaled low-res) while waiting
- When we call `finish()`, OSD displays immediately
- No placeholders, no stale cache entries

---

## OSD Integration Gotchas

**1. `getTileUrl` still required**
Even with `downloadTileStart`, OSD needs `getTileUrl` for cache keys:
```javascript
getTileUrl: (level, x, y) => `tile://${level}/${x}/${y}`
```

**2. Coordinates via `postData`, not `tile`**
```javascript
getTilePostData: (level, x, y) => ({ level, x, y }),
downloadTileStart: (context) => {
  const { level, x, y } = context.postData;  // NOT context.tile
}
```

**3. Canvas per tile**
OSD caches references, not copies. Each tile needs its own canvas.

**4. Cache handlers for context2D**
```javascript
createTileCache: (cache, data) => { cache._data = data; },
getTileCacheDataAsContext2D: (cache) => cache._data
```

---

## Lessons Learned

### 1. Question the Foundation

When building elaborate workarounds, that's a signal to revisit assumptions:
- We built tile registries, health checks, auto-inspectors
- All to work around a synchronous API choice
- The fix was switching to the right API

### 2. Understand the Contract

The first working approach (`getTileUrl` + placeholders) became entrenched. We optimized within its constraints instead of asking: "What does OSD actually expect?"

### 3. Let Systems Do Their Job

OSD has sophisticated fallback/retry behavior. Our "helpful" placeholders disabled it. Sometimes the best code is code you don't write.

### 4. Preventive > Corrective

We planned two approaches:
- **Preventive:** Fix the root cause
- **Corrective:** Detect and heal bad tiles

Preventive won. A clean architectural fix beat complex runtime healing.

### 5. Feedback Control for Testing

The corrective approach (measure actual canvas output) proved valuable as a **testing methodology** rather than runtime healing. Rather than building truthin into the test code, the visual test compares PDF truth signal against OSD canvas output.

---

## Additional Bug Found

**Tile scale bug in `_drawPageIntersection`:**
- Destination coordinates multiplied by `scale` instead of divided
- Tiles appeared 64× too large at L0
- Fix: `gridToTileScale = 1 / scale`

This was discovered through feedback-control testing, not the tile loading investigation.

---

## Sources

- [OSD Advanced Data Model](https://openseadragon.github.io/examples/advanced-data-model/) - Mandelbrot example showing `downloadTileStart`
- [OSD TileSource API](https://openseadragon.github.io/docs/OpenSeadragon.TileSource.html)
- [GitHub Issue #1299](https://github.com/openseadragon/openseadragon/issues/1299) - Custom tile source discussion
