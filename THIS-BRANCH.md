# THIS-BRANCH: Peppers

Status: In progress (test implementation)

## Problem Behavior

1. **Slow tile build-in**: Tiles visibly populate as view is zoomed and panned
2. **Flickering**: Display briefly blanks during load and while idle

## Requirements

1. Tile display speed shall be improved
2. Flickering issues shall be reduced

## Test Files

Files that exhibit issues (large bitmap images):
- `ginger-pickles.pdf`
- `marie-neurath.pdf`

These files flicker during load AND while idle.

---



## Test Suite

### SFT: Short-Form Test

Quick validation with both interoceptive and exteroceptive checks.

- Duration: <30 seconds
- PDF: `demo/test-pattern.pdf`
- States: Initial view, Overview

### LFT: Long-Form Test

Comprehensive flicker detection using page screenshots.

- Duration: Minutes
- PDF: `demo/ginger-pickles.pdf`
- Phases: Load, Pan, Grid, Detail

---



## Development Vectors

### Vector 1: Exteroceptive over Interoceptive

Tests should verify what the user **sees**, not what the code **reports**.

| Approach      | Risk                                                   |
|---------------|--------------------------------------------------------|
| Interoceptive | False positives - internal state correct, screen blank |
| Exteroceptive | Catches real failures the user would experience        |

**Direction**: Every pass/fail criterion should have an exteroceptive component.

### Vector 2: Screenshot Comparison, Not Canvas Sampling

Canvas `getImageData()` misses visual flickers. Page screenshots capture what user sees.

```javascript
// Do this
const screenshot = await page.screenshot({ type: 'png' });

// Not this
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
```

**Direction**: All visual assertions should use page screenshots.

### Vector 3: Distinguish Loading from Flickering

During load, screen changes are expected. After settling, they are not.

| Phase     | Change Expected  | Failure Criterion      |
|-----------|------------------|------------------------|
| Loading   | Yes              | Content never appears  |
| Settled   | No               | Any significant change |
| Pan/Zoom  | Yes, then settle | Fails to settle        |

**Direction**: Implement "monotonicity" check - during load, content should only increase (pixels filling in), never decrease (content disappearing).

### Vector 4: Immediate Logging

Test results must not be lost on abort. Log findings immediately, not at end.

```javascript
// Log immediately when detected
console.log(`⚠ FLICKER frame ${i}: ${pct}%`);
```

**Direction**: Every significant observation logged in real-time.

### Vector 5: Phase-Specific Thresholds

Different phases have different stability expectations.

| Phase     | Sampling | Threshold       | Notes                               |
|-----------|----------|-----------------|-------------------------------------|
| Load      | 50ms     | Track direction | Expect change, watch for regression |
| Settled   | 50ms     | 0.1%            | Any change is suspect               |
| Animation | 50ms     | Track settling  | Measure time-to-stable              |

**Direction**: Parameterize detection per phase.

### Vector 6: Browser Comparison

Behavior differs across browsers. Firefox may not exhibit Chromium's issues.

**Direction**: Run identical tests on multiple browser projects, compare results.

---

## Commands

```bash
# SFT - quick validation
npx playwright test tests/short-form-test.spec.js --project=chromium

# LFT - comprehensive flicker detection (optionally headed for observation)
npx playwright test tests/long-form-test.spec.js --project=chromium --headed
```

---

## Code Analysis (2024-12-01)

### Dead Code Identified

The async `downloadTileStart` pattern (v1.11.0) does not generate stripe placeholders. The following code is now dead:

| Component                    | Purpose                        | Status                              |
|------------------------------|--------------------------------|-------------------------------------|
| `_renderBlankTile()`         | Red stripe placeholder         | Dead - never called                 |
| `inspectVisual()`            | Stripe pattern detector        | Dead - no stripes to detect         |
| Auto-Inspector               | Periodic stripe check + heal   | Dead - triggers on non-existent     |
| `FALLBACK_RENDERING_ENABLED` | Config toggle                  | Dead - fallback logic unused        |

### Potential Flicker Sources

| Component              | Behavior                              | Concern                    |
|------------------------|---------------------------------------|----------------------------|
| `recreateTiledImage()` | Removes TiledImage, waits 50ms, re-adds | Creates visible blank gap |
| Called at line 4675    | After initial batch complete          | One-time during load       |
| Called at line 5101    | After all low-res pages complete      | One-time during load       |
| Called by Auto-Inspector | When stripes detected               | Periodic (but stripes don't exist) |

Note: Do not remove code yet. iOS may have cache limitations requiring stripe reintroduction.

### Hypotheses and Proposed Corrections

| Hypothesis                          | Evidence                                      | Proposed Correction                          | Status   |
|-------------------------------------|-----------------------------------------------|----------------------------------------------|----------|
| `recreateTiledImage()` 50ms gap     | Function explicitly waits 50ms during swap    | Reduce delay or use crossfade transition     | Untested |
| Auto-Inspector false triggers       | Checks for stripes that no longer exist       | Disable Auto-Inspector or remove dead code   | Untested |
| React state change triggers redraw  | Debug panel updates cause visible refresh     | Memoize OSD interaction, isolate from state  | Untested |
| OSD tile cache invalidation         | Tiles re-request after initial display        | Increase cache size or prevent invalidation  | Untested |
| Multiple `forceRedraw()` calls      | Called from multiple code paths               | Debounce or consolidate redraw triggers      | Untested |

### Investigation Order

1. **Disable Auto-Inspector** - Quick test, may eliminate periodic flickers
2. **Profile `recreateTiledImage()` calls** - Add logging to confirm when/if called
3. **Isolate React from OSD** - Check if debug panel state affects display
4. **Review `forceRedraw()` call sites** - Map all triggers, look for redundancy

---

## Background

See Sunday-original.md for notes from the last branch. See also Changelog.
