# Sunday Investigation Archive

**Status:** ✅ Resolved in v1.11.0
**Original:** 887 lines → condensed to conceptual framework and reference material

---

## The Problems (Resolved)

1. **Stale Tiles** - Striped placeholders cached by OSD, never replaced
2. **Low-res at High Zoom** - Wrong resolution tiles at detail levels

---

## Fix Strategy

Two directions to approach fixes:

### A. Preventive: Get in Front of the Issue
- Understand the root cause
- Fix the logic that creates the problem in the first place

### B. Corrective: Feedback Control
- Detect when the issue has occurred
- Apply correction to replace/refresh affected tiles

---

## Deep Analysis

### The Core Problem: Intermediary vs. Actual Display

Previous attempts used internal "tile health checks" and "tile registries" - but these measure what **we think** OSD has, not what **OSD actually displays**. There's a disconnect between:

1. Our tile generation/tracking code
2. OSD's internal tile cache and display logic
3. The actual rendered pixels on screen

Measuring intermediaries (1 or 2) doesn't catch the real problem. True feedback control requires measuring **the output** (3).

### Why Over-Compensation Hurts Us

If our CustomTileSource returns a striped placeholder when content isn't ready, OSD thinks: "I have a valid tile for this position." It caches it. It won't re-request.

We're being too "helpful" - trying to always return something. This prevents OSD's natural fallback/retry behavior from working.

**Current (problematic) flow:**
```
OSD requests tile → We return placeholder → OSD caches it → Page renders → ??? OSD never asks again
```

**Better flow:**
```
OSD requests tile → Content not ready → Signal "not ready" → OSD uses its own fallback → Page renders → OSD re-requests → We return real content
```

### Two-Pronged Approach

#### Prong 1: Feed OSD Better (Preventive)

**Don't over-compensate.** Let OSD handle fallback when content isn't ready:
- Return `null` or signal unavailability when page not yet rendered
- Only return actual tile data when it's genuinely ready
- Trust OSD's built-in fallback (upscale lower-level tiles)
- This keeps OSD in "waiting for better tile" state

#### Prong 2: Measure Actual Display (Corrective)

**Don't measure our tile cache. Measure the screen.**

Options for measuring actual display:
1. **Canvas pixel sampling** - Read pixels from OSD's canvas element, detect stripe patterns or blur
2. **Resolution analysis** - At high zoom, sharp edges expected. Blurry = wrong resolution tile displayed
3. **Pattern detection** - Our placeholder stripes have known pattern, can detect them in output

When bad tiles detected in viewport:
- Trigger targeted refresh
- Or full `tiledImage.reset()` as nuclear option
- Or minimal zoom jiggle to force OSD re-request

---

## The Feedback Control Model

### What We're Actually Building

A **closed-loop control system** for tile quality:

```
                    ┌─────────────────────────────────────┐
                    │                                     │
                    ▼                                     │
┌──────────┐    ┌──────────┐    ┌──────────┐    ┌────────┴───────┐
│  Page    │───▶│  Tile    │───▶│   OSD    │───▶│  Actual Canvas │
│ Renderer │    │ Generator│    │  Cache   │    │    (Output)    │
└──────────┘    └──────────┘    └──────────┘    └────────┬───────┘
                    ▲                                     │
                    │         ┌──────────────┐            │
                    └─────────│   Feedback   │◀───────────┘
                              │   Sensor     │
                              └──────────────┘
```

The **sensor** must measure the actual canvas output - not any intermediate stage.

### Why Stripe Detection is a Good Sensor

Our placeholder stripes are a **known signal** we inject. They're like a "test pattern" in broadcast TV. If we see stripes in output:
- We know exactly what went wrong (placeholder not replaced)
- We can detect them with simple pattern matching
- High confidence: stripes = bug, no stripes = probably fine

### Resolution Mismatch is Harder to Detect

For issue #2 (low-res at high zoom), detection is trickier:
- Need to know "what resolution should this viewport region be?"
- Compare expected sharpness vs actual
- Could use edge detection, frequency analysis, or comparison to known-good render

**Simpler approach:** If we stop over-compensating (Prong 1), OSD's natural behavior should handle this. Focus detection on the striped placeholder problem first.

### The Stripe Detection Algorithm

Our placeholder has alternating diagonal stripes. To detect:

1. Sample a small region (e.g., 32x32 pixels)
2. Check for periodic intensity variation along diagonals
3. Compare period to known stripe frequency
4. If match confidence > threshold → stripes detected

This is robust: real PDF content rarely has perfect diagonal stripes matching our exact pattern.

### When to Run Health Checks

- After initial load completes (all pages rendered)
- After viewport animation ends (zoom/pan settles)
- On a timer during idle (every N seconds?)
- NOT during active zoom/pan (waste of cycles)

### Healing Strategy Options

When stripes detected, what's the minimum intervention?

1. **Full reset** - `tiledImage.reset()` - works but expensive
2. **Force redraw** - may not trigger re-request
3. **Invalidate specific tile** - ideal but need OSD API support
4. **Zoom jiggle** - hack but known to work (zoom out 0.01, zoom back)

---

## Implementation Considerations

1. **Need to track pending tile contexts** - Store context objects to call `finish()` later
2. **Timeout handling** - OSD may abort if we take too long
3. **Memory management** - Don't hold contexts forever for tiles user scrolled away from
4. **Fallback display** - OSD should still show upscaled low-res while waiting (its natural behavior)

---

## Edge Cases Reference

### 1. Timeout Before Tile Ready
- OSD calls `downloadTileAbort()`, may retry later based on `tileRetryMax`
- Remove from pendingJobs in abort handler, let OSD retry naturally

### 2. User Scrolls Away Before Tile Ready
- Clean up pendingJobs on abort
- Could check viewport relevance before finishing (optimization)

### 3. Same Tile Requested Multiple Times
- Check if job already pending
- Either reuse existing job or update with new context

### 4. Page Renders But Tile No Longer Tracked
- Safe to call finish() on aborted job - OSD ignores it (`if (!this.jobId) { return; }`)

### 5. Level 0 (Minimap) vs Higher Levels
- Minimap levels: finish immediately with low-res (usually ready)
- Detail levels: wait for high-res, let OSD use fallback meanwhile

### 6. Memory Pressure
- Set reasonable limit on pendingJobs size
- Oldest jobs could be dropped, or prioritize viewport-visible tiles

### 7. What Goes Into context.finish()?
- `context.finish(ctx)` - CanvasRenderingContext2D (best - avoids encoding overhead)
- `context.finish(dataUrl)` - data URL string
- `context.finish(blob, request, "rasterBlob")` - Blob with type hint

---

## Sources

- [OSD TileSource API](https://openseadragon.github.io/docs/OpenSeadragon.TileSource.html)
- [OSD Advanced Data Model Example](https://openseadragon.github.io/examples/advanced-data-model/)
- [OSD Custom Tile Source](https://openseadragon.github.io/examples/tilesource-custom/)
- [GitHub Issue #1299](https://github.com/openseadragon/openseadragon/issues/1299)

---

## Cleanup TODO

**Code now unused (can be removed):**
- `generateTile()` method - only called by disabled background queue
- `_renderBlankTile()` - striped placeholder generator
- `tileCache` (data URL cache) - async pattern uses OSD's internal cache
- Background queue infrastructure - disabled

**Kept for safety:**
- Stripe detection (`inspectVisual`) - useful for debugging
- Auto-inspector - fallback safety net
