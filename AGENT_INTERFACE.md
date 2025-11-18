# Agent Interface for tester.html

## Principle
"All applications should be designed for both human and machine interaction."
"Agents must use the tools they develop."

## Design Philosophy

**tester.html is the PRIMARY feedback control interface for both humans and agents.**

- **Humans** interact via browser: click buttons, select options, view metrics
- **Agents** interact the SAME way: use Playwright to operate the same UI, read the same output

**Why this works:**
- Single source of truth - no duplicate systems
- Self-testing - if the agent uses the human UI, bugs in the UI are caught immediately
- "Eating our own dog food" - agents use exactly what they build

## How Agents Use tester.html

### 1. Load and Operate the Interface

```javascript
// Playwright test - agent operates like a human would
const { test } = require('@playwright/test');

test('Agent runs A/B comparison', async ({ page }) => {
  // Navigate to tester
  await page.goto('http://localhost:8000/tester.html');

  // Operate the UI like a human would
  await page.selectOption('#pdfSelect', 'demo.pdf');
  await page.selectOption('#actionSelect', 'load');
  await page.check('#syncActions'); // Sync test across versions
  await page.click('button:has-text("Execute Action")');

  // Wait for action to complete
  await page.waitForTimeout(3000);

  // Collect metrics (same as human would)
  await page.click('button:has-text("Collect Metrics")');
  await page.waitForTimeout(1000);
});
```

### 2. Extract Metrics (Same as Human Sees)

```javascript
// Read the metrics table that humans see
const metrics = await page.evaluate(() => {
  const table = document.querySelector('#metricsTable tbody');
  const rows = Array.from(table.querySelectorAll('tr'));

  const results = {};
  rows.forEach(row => {
    const cells = row.querySelectorAll('td');
    const metric = cells[0].textContent.trim();
    results[metric] = {
      versionA: cells[1].textContent.trim(),
      versionC: cells[2].textContent.trim(),
      status: cells[3].textContent.trim()
    };
  });

  return results;
});

// Check for regressions (same logic tester.html uses)
const hasRegressions = Object.values(metrics).some(m =>
  m.status.includes('worse')
);

if (hasRegressions) {
  console.error('Regressions detected:', metrics);
  // Agent can rollback changes
}
```

### 3. Use Export Functionality

```javascript
// Use the built-in export button
const downloadPromise = page.waitForEvent('download');
await page.click('button:has-text("Export Results (JSON)")');
const download = await downloadPromise;

// Save and parse the JSON
await download.saveAs('./test-results.json');
const results = JSON.parse(fs.readFileSync('./test-results.json', 'utf8'));
```

### 4. Monitor Console Output

```javascript
// Read console logs (same as visible in UI)
const consoleLogs = await page.evaluate(() => {
  const logs = document.querySelectorAll('.console-output .console-entry');
  return Array.from(logs).map(log => ({
    version: log.dataset.version,
    type: log.classList.contains('console-error') ? 'error' : 'log',
    message: log.textContent
  }));
});

const errorCount = consoleLogs.filter(l => l.type === 'error').length;
```

## Agent Workflow

```bash
# 1. Agent modifies index-2.html (rewrite work)
vim index-2.html

# 2. Agent tests via tester.html using Playwright
npx playwright test tests/feedback-control/tester-interface.spec.js

# 3. Agent reads results from test output
# - Metrics comparison (A vs C)
# - Console errors
# - Regression warnings

# 4. Agent decides: continue or rollback
# - If improvements: commit and continue
# - If regressions: git revert and try different approach
# - If equivalent: commit and continue to next refactor
```

## Supplementary Playwright Tests

While tester.html is primary, agents can spin off specialized Playwright tests as needed:

```bash
# Deep-dive performance test
tests/performance/memory-leak-detection.spec.js

# Edge case validation
tests/functional/edge-cases.spec.js

# Regression suite
tests/regression/known-issues.spec.js
```

But **tester.html remains the primary feedback control interface.**

## What Makes tester.html Agent-Friendly

✅ **Predictable UI**: Stable selectors, clear button text
✅ **Machine-readable output**: Structured metrics table, JSON export
✅ **Visual feedback**: Agent can screenshot and analyze visually
✅ **Console interception**: All console output captured per version
✅ **Regression detection**: Automatic warnings visible in UI
✅ **Synchronous testing**: All versions tested simultaneously

## Recursive Architecture: supervisor.html

**The complete feedback control hierarchy:**

```
Human/Agent ←→ supervisor.html ←→ Playwright test ←→ tester.html ←→ index-2.html
              (reviews testing)    (operates tester) (tests app)    (the app)
```

### supervisor.html: Reviewing Agent Test Sessions

**Purpose**: Human interface to review agent's operation of tester.html

**Displays**:
- Video recording of agent operating tester.html
- Metrics extracted by agent (A/B/C comparison)
- Regression alerts and pass/fail status
- Screenshots at key moments
- Test duration and session metadata

**Dual output for agent accessibility**:
1. **Visual dashboard** (human-readable in browser)
2. **supervisor-summary.json** (machine-readable, auto-generated)

### Agent Access to supervisor.html (Without Playwright)

```bash
# Agent checks supervisor report (lightweight)
curl http://localhost:8000/tests/feedback-control/latest-session/supervisor-summary.json

# Parse JSON
{
  "session": {
    "timestamp": "2025-11-18T10:30:00Z",
    "status": "passed",
    "duration_ms": 5423
  },
  "metrics": {
    "regressions_detected": false,
    "improvements": ["load_time", "cache_efficiency"]
  },
  "agent_decision": "continue"
}
```

**When agent would use Playwright on supervisor.html**: Only for interactive exploration (drill into traces, compare multiple sessions). For basic pass/fail checking, just read the JSON.

### File Structure

```
/
├── index.html              # Baseline (version C)
├── index-2.html            # Rewrite (version A)
├── tester.html             # A/B/C comparison interface
├── supervisor.html         # Review agent test sessions
└── tests/feedback-control/
    ├── tester-interface.spec.js    # Agent operates tester.html
    └── latest-session/
        ├── video.webm              # Recording of agent
        ├── trace.json              # Playwright trace data
        ├── screenshots/            # Key moments
        ├── metrics.json           # Data agent extracted
        ├── session-metadata.json  # Test results
        └── supervisor-summary.json # Machine-readable summary
```

## Complete Workflow

### Human Workflow
1. Open `supervisor.html` in browser
2. Watch video of agent operating tester.html
3. Review metrics, regressions, decisions
4. Approve or investigate further

### Agent Workflow (Automated Refactoring)
```bash
# 1. Agent modifies index-2.html
vim index-2.html

# 2. Agent runs test (operates tester.html via Playwright)
npx playwright test tests/feedback-control/tester-interface.spec.js

# 3. Playwright outputs:
#    - video.webm (recording)
#    - metrics.json (extracted data)
#    - trace.json (full trace)
#    - session-metadata.json (pass/fail)

# 4. supervisor.html loads latest session
#    - Generates supervisor-summary.json automatically

# 5. Agent (or meta-agent) checks results
curl http://localhost:8000/tests/feedback-control/latest-session/supervisor-summary.json

# 6. Agent decides based on results
if [ "$(jq -r .metrics.regressions_detected)" = "false" ]; then
  git commit -m "Refactor: no regressions detected"
else
  git revert HEAD
fi
```

## Next Steps

1. **Create supervisor.html**: Visual dashboard + auto-generates JSON
2. **Create Playwright wrapper**: `tests/feedback-control/tester-interface.spec.js`
3. **Configure Playwright**: Output video/trace/screenshots to `latest-session/`
4. **Test complete loop**: Agent → tester.html → supervisor.html → decision

The agent operates tester.html exactly as a human would - and humans review agent sessions via supervisor.html exactly as they would review their own testing.
