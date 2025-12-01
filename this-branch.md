# Development Vectors: Visual Testing

Directions for evolving the test infrastructure.

---

## Vector 1: Exteroceptive over Interoceptive

Tests should verify what the user **sees**, not what the code **reports**.

| Approach      | Risk                                                 |
|---------------|------------------------------------------------------|
| Interoceptive | False positives - internal state correct, screen blank |
| Exteroceptive | Catches real failures the user would experience      |

**Direction**: Every pass/fail criterion should have an exteroceptive component. Use `page.screenshot()` to capture actual rendered output.

---

## Vector 2: Screenshot Comparison, Not Canvas Sampling

Canvas `getImageData()` misses visual flickers. Page screenshots capture what user sees.

```javascript
// Do this
const screenshot = await page.screenshot({ type: 'png' });

// Not this
const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
```

**Direction**: All visual assertions should use page screenshots.

---

## Vector 3: Distinguish Loading from Flickering

During load, screen changes are expected. After settling, they are not.

| Phase     | Change Expected  | Failure Criterion      |
|-----------|------------------|------------------------|
| Loading   | Yes              | Content never appears  |
| Settled   | No               | Any significant change |
| Pan/Zoom  | Yes, then settle | Fails to settle        |

**Direction**: Implement "monotonicity" check - during load, content should only increase (pixels filling in), never decrease (content disappearing).

---

## Vector 4: Immediate Logging

Test results must not be lost on abort. Log findings immediately, not at end.

```javascript
// Log immediately when detected
console.log(`⚠ FLICKER frame ${i}: ${pct}%`);

// Don't batch results for end-of-test summary only
```

**Direction**: Every significant observation logged in real-time.

---

## Vector 5: Phase-Specific Thresholds

Different phases have different stability expectations.

| Phase     | Sampling | Threshold       | Notes                              |
|-----------|----------|-----------------|-------------------------------------|
| Load      | 50ms     | Track direction | Expect change, watch for regression |
| Settled   | 50ms     | 0.1%            | Any change is suspect               |
| Animation | 50ms     | Track settling  | Measure time-to-stable              |

**Direction**: Parameterize detection per phase.

---

## Vector 6: Browser Comparison

Behavior differs across browsers. Firefox may not exhibit Chromium's issues.

**Direction**: Run identical tests on multiple browser projects, compare results.

---

## Working Configuration

```javascript
FLICKER_INTERVAL = 50     // 50ms between samples
FLICKER_THRESHOLD = 0.1   // 0.1% change triggers flag

function compareBuffers(buf1, buf2) {
  if (buf1.length !== buf2.length) return 100;
  let diff = 0;
  for (let i = 0; i < buf1.length; i++) {
    if (buf1[i] !== buf2[i]) diff++;
  }
  return (diff / buf1.length) * 100;
}
```

---

## Commands

```bash
# SFT - quick validation with exteroceptive checks
npx playwright test tests/short-form-test.spec.js --project=chromium

# LFT - comprehensive flicker detection
npx playwright test tests/long-form-test.spec.js --project=chromium --headed
```
