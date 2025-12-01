# Branch: development - Flicker Detection Testing

## Current State

Successfully detecting visual flickers using page screenshot comparison. Canvas-based detection (`getImageData`) was not capturing the flickering, but full page screenshots do.

## Test Results (Phase 1 Load)

```
⚠ FLICKER P1-load frame 2-7: 100.0% changed (during load - expected)
✓ Content appeared
⚠ FLICKER P1-settled frame 0: 33.2% (after load - problematic)
```

**Key Finding**: 33.2% change detected AFTER content appeared, confirming post-load flickering.

## Detection Methods Tried

| Method | Result |
|--------|--------|
| Canvas `getImageData` | Did not detect flickering |
| Page screenshots + buffer comparison | Successfully detects flickering |

## Working Sampling Technique

**Use `page.screenshot()` not canvas `getImageData()`**

```javascript
// This works - captures what user actually sees
const screenshot = await page.screenshot({ type: 'png' });

// This does NOT work - misses visual flickers
const canvas = document.querySelector('.openseadragon-canvas canvas');
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
```

Compare consecutive screenshots with simple buffer diff:

```javascript
function compareBuffers(buf1, buf2) {
  if (!buf1 || !buf2) return 100;
  if (buf1.length !== buf2.length) return 100;
  let diffBytes = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) diffBytes++;
  }
  return (diffBytes / buf1.length) * 100;
}
```

Sample at 50ms intervals, flag any change > 0.1% as potential flicker.

## Why Canvas Detection Failed

The OSD canvas (`querySelector('.openseadragon-canvas canvas')`) wasn't reflecting the visual changes. Possible reasons:
- Multiple canvas layers
- CSS transforms/opacity changes
- Tile compositing happens outside the captured canvas
- Timing mismatch between canvas state and visual render

## Current Test Configuration

```javascript
CONTENT_TIMEOUT = 10000   // 10s max to see content
FLICKER_DURATION = 1000   // 1s flicker check
FLICKER_INTERVAL = 50     // 50ms sampling
FLICKER_THRESHOLD = 0.1   // 0.1% pixel change
```

## Forward-Looking Vectors

### 1. Refine Flicker Classification

Distinguish between:
- **Progressive loading** (expected): Content appearing incrementally
- **True flicker** (bug): Content appearing then disappearing, tiles popping in/out

Approach: Track pixel "monotonicity" - content should only increase, never decrease during load.

### 2. Phase-Specific Thresholds

| Phase | Expected Behavior | Flicker Threshold |
|-------|-------------------|-------------------|
| Load | High change rate | Ignore or track direction |
| Settled | No change | Any change > 0.1% is flicker |
| Pan/Zoom | Moderate change | Track settling time |

### 3. Investigate Root Cause

The 33.2% post-load flicker suggests:
- Tile re-rendering after initial display
- Cache invalidation causing redraws
- OSD viewport recalculation
- React re-render triggering tile refresh

### 4. Video Recording for Analysis

Playwright already records video (`video: 'on'` in config). Review test videos in `test-results/` to visually confirm what's happening.

### 5. Performance Metrics

Add timing instrumentation:
- Time from navigation to first content
- Time from first content to stability
- Number of redraws after stability

### 6. Compare Browsers

Current tests run on Chromium. Firefox behavior may differ:
- User noted "app resizes beautifully in Firefox"
- Run same tests on Firefox project to compare flicker rates

## Files Modified

- `tests/long-form-test.spec.js` - Added screenshot-based flicker detection
- `tests/test-helpers.js` - Visual content detection utilities
- `playwright.config.js` - Chromium viewport fixes

## Next Steps

1. Run full LFT to completion, capture all phase flicker counts
2. Review video recordings for visual analysis
3. Add monotonicity check (content should only increase during load)
4. Profile the app to find source of post-load redraws
5. Test on Firefox for comparison

## Commands

```bash
# Run LFT headed (observe visually)
npx playwright test tests/long-form-test.spec.js --project=chromium --headed

# Run LFT headless (faster)
npx playwright test tests/long-form-test.spec.js --project=chromium

# View test videos
ls test-results/
```
