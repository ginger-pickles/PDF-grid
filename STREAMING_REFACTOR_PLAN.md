# Streaming Refactor Plan - COMPLETED

**Status**: All phases complete. Smoke tests passing.

## Goal
Simplify the TiledImage recreation system to two clear trigger points, embracing the streaming model.

## Architecture: Streaming (Not Buffering)

```
OSD viewer appears immediately
        ↓
    [stripes as placeholders]
        ↓
Pages stream in as rendered
        ↓
TiledImage recreation → pushes content to viewer
        ↓
    [stripes replaced by content]
```

## Key Principles

1. **Viewer shows immediately** - No waiting for "ready" state
2. **Stripes = "not yet rendered"** - Visual feedback, not error
3. **Streaming = responsive** - User sees progress in real-time
4. **Recreation = "new content available"** - Tells OSD to re-request tiles
5. **No buffering/pre-rendering** - Pages stream as they render

## Two TiledImage Recreation Points

| Trigger | Purpose |
|---------|---------|
| Visible pages rendered | Stripes in viewport → content |
| All low-res done | Navigator stripes → content |

## Rendering Sequence

1. OSD viewer appears (stripes visible)
2. Render pages visible in initial view (viewport-aware)
3. **★ RECREATE TILEDIMAGE** - viewport content appears
4. Background: render remaining low-res pages
5. **★ RECREATE TILEDIMAGE** - navigator complete
6. On-demand: high-res as user zooms

## What Gets Removed/Simplified

### Remove
- Auto-Heal mechanisms (redundant with correct streaming)
- `healIncompleteTiles()` automatic triggers
- Complex batch decode promise chains
- 3-second cooldowns and re-entrant guards
- `_healingInProgress` flags
- Auto-Inspector (already disabled)

### Simplify
- Single `recreateTiledImage()` function
- Called at exactly two points
- No healing logic - stripes are expected intermediate state

## Implementation Steps

### Phase 1: Identify Current Recreation Calls
- Find all places that trigger TiledImage recreation
- Document what each is trying to accomplish
- Map to new two-point model

### Phase 2: Consolidate Recreation Logic
- Single clean `recreateTiledImage()` method
- Remove healing/inspection logic from it
- Async-safe (preserves viewport position)

### Phase 3: Implement Two Trigger Points
- Trigger 1: After visible pages rendered
- Trigger 2: After all low-res complete
- Remove all other recreation calls

### Phase 4: Remove Obsolete Code
- Auto-Heal mechanisms
- Complex promise chains
- Cooldown/guard logic
- Redundant inspection code

### Phase 5: Test
- Verify stripes appear initially
- Verify stripes disappear after visible pages
- Verify navigator populates after all low-res
- Verify on-demand high-res works

## Success Criteria

- Stripes visible on load (expected)
- Viewport content appears quickly
- Navigator fully populated
- No persistent stripes after all low-res complete
- Simpler, more maintainable code
