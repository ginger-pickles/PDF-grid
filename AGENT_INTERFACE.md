# Agent Interface for tester.html

## Principle
"All applications should be designed for both human and machine interaction."
"Agents must use the tools they develop."

## Three Approaches to Agent-Accessible Testing

### 1. File-Based Output (localStorage → JSON)
**Status**: To implement
**How**: tester.html auto-writes results to localStorage, agent reads via Playwright

```javascript
// In tester.html
localStorage.setItem('test_results', JSON.stringify(metrics));

// Agent reads:
const results = await page.evaluate(() => localStorage.getItem('test_results'));
```

### 2. Playwright Wrapper
**Status**: To implement
**File**: `tests/feedback-control/automated-comparison.spec.js`

```bash
npx playwright test tests/feedback-control/automated-comparison.spec.js
# Outputs: comparison-results.json
```

###3. Framework-Agnostic REST API
**Status**: To implement
**File**: `run-tester.js` (Node.js script)

**What is "headless"**: Running browser without visible window - automated, machine-only

```bash
node run-tester.js --pdf demo-1.pdf --output results.json
# Returns: JSON to stdout AND file
```

## Implementation Order

1. Add localStorage output to tester.html ✓ (simple, works immediately)
2. Create Playwright wrapper (full automation)
3. Create Node.js runner (framework-agnostic fallback)

## Agent Workflow

```bash
# 1. Agent modifies index-2.html
# 2. Agent runs test:
npx playwright test tests/feedback-control/automated-comparison.spec.js

# 3. Agent reads results:
cat comparison-results.json

# 4. Agent decides: continue or rollback based on metrics
```

## Next Steps

Implement #1 first (5 minutes), then #2 (10 minutes), then #3 (15 minutes).
