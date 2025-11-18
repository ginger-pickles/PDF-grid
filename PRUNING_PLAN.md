# Code Bloat Analysis & Pruning Plan
**PDF Grid Viewer v1.9.6**
**Analysis Date:** 2025-11-17
**Current Size:** 6,500 lines
**Target Size:** 4,000 lines (38% reduction)

---

## Executive Summary

PDF Grid Viewer has grown from ~500 LOC (v1.0) to **6,500 LOC (v1.9.6)** - a 13x increase. The primary bloat is concentrated in two areas:

1. **TileStreamer class: 2,047 lines (31.5% of file)** - Complex tile rendering orchestration
2. **React Component: 2,804 lines (43% of file)** - UI + application logic + state management

**Primary bloat causes:**
- Feature accretion without corresponding pruning
- Extensive debug instrumentation (278 console calls, 69 debug-conditional logs)
- Defensive error handling (42 try/catch blocks)
- Complex bi-directional rendering strategy
- State management complexity (57 React hooks)

---

## Section-by-Section Breakdown

| Lines | Section | LOC | % of File | Bloat Risk |
|-------|---------|-----|-----------|------------|
| 64-463 | CONFIG | 399 | 6.1% | LOW - mostly data |
| 463-685 | PageCache | 222 | 3.4% | LOW - core functionality |
| 685-1282 | PageStreamer | 597 | 9.2% | **MEDIUM** - can simplify |
| 1282-1593 | TileCache | 311 | 4.8% | LOW - core functionality |
| **1593-3640** | **TileStreamer** | **2,047** | **31.5%** | **CRITICAL** - main bloat |
| 3640-3694 | ErrorBoundary | 54 | 0.8% | LOW - standard React |
| **3694-6498** | **PDFGridViewer** | **2,804** | **43.2%** | **HIGH** - UI + logic mixed |
| **TOTAL** | | **6,434** | **100%** | |

---

## Bloat Hotspots (High-Value Pruning Targets)

### 🔴 CRITICAL: TileStreamer (Lines 1593-3640, 2047 LOC)

**Why it's bloated:**
- Complex bidirectional rendering (L0→L5 and L5→L0)
- Extensive diagnostic instrumentation
- Multiple rendering strategies (background, on-demand, viewport-aware)
- Detailed progress tracking and stats
- Tile quality inspection and fallback logic
- Cache coordination with PageStreamer

**Estimated prunable:**
- Remove diagnostic methods: ~200 lines
- Simplify rendering strategy: ~300 lines
- Consolidate tile generation logic: ~200 lines
- **Target reduction: 700 lines (34% of class)**

**Specific targets:**
- `inspectTileQuality()` - diagnostic only, gate behind ?debug=1
- `_logRenderingProgress()` - verbose logging, reduce
- `getTileRenderStats()` - mostly for debugging
- Bidirectional rendering - consider simpler L5→L0 only strategy

---

### 🟠 HIGH: PDFGridViewer Component (Lines 3694-6498, 2804 LOC)

**Why it's bloated:**
- UI rendering mixed with application logic
- Extensive state management (57 hooks total in file)
- Debug panel (entire mini-app within component)
- Help panel with detailed instructions
- Multiple event handlers (viewport, keyboard, touch)
- Inline utility functions

**Estimated prunable:**
- Simplify debug panel: ~200 lines
- Reduce help panel verbosity: ~100 lines
- Extract utility functions: ~150 lines (no LOC reduction, but better organization)
- Simplify state management: ~100 lines
- **Target reduction: 400 lines (14% of component)**

**Specific targets:**
- Debug panel - make it ?debug=1 only, lazy-load
- Help text - link to external docs instead of inline
- Duplicate logic between desktop/mobile UIs

---

### 🟡 MEDIUM: PageStreamer (Lines 685-1282, 597 LOC)

**Why it's complex:**
- Manages both low-res and high-res rendering
- Coordinates with TileStreamer via window globals
- Background rendering with batching
- Extensive progress tracking

**Estimated prunable:**
- Simplify progress tracking: ~50 lines
- Reduce logging: ~30 lines
- Consolidate rendering paths: ~70 lines
- **Target reduction: 150 lines (25% of class)**

---

### 🟢 LOW RISK: Other sections

**PageCache (222 LOC):** Core functionality, minimal bloat
**TileCache (311 LOC):** Core functionality, minimal bloat
**CONFIG (399 LOC):** Mostly data declarations, acceptable
**ErrorBoundary (54 LOC):** Standard React pattern, keep as-is

---

## Bloat Patterns (Cross-Cutting)

### 1. Console Logging: 278 calls

**Breakdown:**
- Debug-conditional: 69 calls (`if (CONFIG.DEBUG_MODE) console.log(...)`)
- Unconditional: 209 calls (errors, warnings, info)

**Pruning strategy:**
- Keep error logs (essential for debugging)
- Remove info logs (or gate behind ?verbose=1)
- Remove/simplify debug logs
- **Estimated reduction: 100-150 lines**

---

### 2. Error Handling: 42 try/catch blocks

**Analysis:**
- Some catch blocks have extensive error categorization
- Multiple levels of defensive error handling
- Redundant try/catches in similar code paths

**Pruning strategy:**
- Consolidate similar error handlers
- Simplify error messages (link to docs instead of inline explanations)
- Remove defensive try/catches that can't actually fail
- **Estimated reduction: 50-100 lines**

---

### 3. Comment Density: 777 lines (12%)

**Analysis:**
- 12% comment ratio is reasonable for complex code
- Some sections have redundant comments explaining obvious code
- Block comments could be condensed

**Pruning strategy:**
- Remove obvious comments (`// Increment counter` → just `counter++`)
- Consolidate multi-line explanations
- **Estimated reduction: 100-150 lines**

---

## Pruning Plan: 4-Phase Approach

### Phase 1: Low-Hanging Fruit (Week 1)
**Target: 400-500 lines (6-8% reduction)**
**Difficulty: EASY**
**Risk: LOW**

#### Actions:
1. **Remove debug logging** (Lines: various)
   - Gate all debug logs behind `?debug=1` URL parameter
   - Remove verbose progress logging
   - Estimated: 150 lines

2. **Simplify error messages** (Lines: various)
   - Replace inline error explanations with error codes + doc links
   - Consolidate similar catch blocks
   - Estimated: 100 lines

3. **Remove obvious comments** (Lines: various)
   - `// Set loading to true` → delete
   - `// Loop through pages` → delete
   - Estimated: 100 lines

4. **Config cleanup** (Lines: 64-463)
   - Remove unused config options (check references first)
   - Consolidate related configs into objects
   - Estimated: 50 lines

**Total Phase 1: ~400 lines**

---

### Phase 2: TileStreamer Refactoring (Week 2)
**Target: 600-700 lines (9-11% reduction)**
**Difficulty: MEDIUM**
**Risk: MEDIUM** (extensive testing required)

#### Actions:
1. **Remove/gate diagnostic methods** (Lines: 1593-3640)
   - `inspectTileQuality()` → only load if `?debug=1`
   - `getTileRenderStats()` → simplify
   - `_logRenderingProgress()` → remove or gate
   - Estimated: 200 lines

2. **Simplify rendering strategy** (Lines: 1593-3640)
   - Current: Bidirectional L0→L5 and L5→L0
   - Proposed: Single-direction L5→L0 (simpler, still progressive)
   - Remove experimental strategies that didn't pan out
   - Estimated: 300 lines

3. **Consolidate tile generation** (Lines: 1593-3640)
   - Merge similar tile generation paths
   - Remove redundant checks and validation
   - Estimated: 150 lines

**Total Phase 2: ~650 lines**

---

### Phase 3: Component Simplification (Week 3)
**Target: 400-500 lines (6-8% reduction)**
**Difficulty: MEDIUM**
**Risk: LOW** (mostly UI changes)

#### Actions:
1. **Lazy-load debug panel** (Lines: 3694-6498)
   - Only render if `?debug=1` parameter present
   - Move to separate component definition (still inline, but conditional)
   - Estimated: 200 lines saved in default render path

2. **Simplify help panel** (Lines: 3694-6498)
   - Replace inline help text with "See Documentation →" link
   - Keep only critical shortcuts (Ctrl+0, +/-)
   - Estimated: 100 lines

3. **Consolidate state management** (Lines: 3694-6498)
   - Merge related useState calls into useReducer
   - Remove redundant state variables
   - Estimated: 100 lines

4. **Extract utility functions** (Lines: 3694-6498)
   - Move inline utils to top-level functions
   - No line reduction, but improves navigability
   - Estimated: 0 lines (organizational only)

**Total Phase 3: ~400 lines**

---

### Phase 4: PageStreamer Optimization (Week 4)
**Target: 150-200 lines (2-3% reduction)**
**Difficulty: EASY**
**Risk: LOW**

#### Actions:
1. **Simplify progress tracking** (Lines: 685-1282)
   - Remove redundant progress calculations
   - Consolidate progress event handlers
   - Estimated: 50 lines

2. **Reduce logging** (Lines: 685-1282)
   - Remove verbose rendering logs
   - Estimated: 30 lines

3. **Consolidate rendering paths** (Lines: 685-1282)
   - Merge low-res and high-res rendering logic
   - Remove experimental code branches
   - Estimated: 70 lines

**Total Phase 4: ~150 lines**

---

## Cumulative Targets

| Phase | Target Lines | Cumulative | % Reduction | New Total |
|-------|--------------|------------|-------------|-----------|
| Baseline | - | - | - | 6,500 |
| Phase 1 | 400 | 400 | 6% | 6,100 |
| Phase 2 | 650 | 1,050 | 16% | 5,450 |
| Phase 3 | 400 | 1,450 | 22% | 5,050 |
| Phase 4 | 150 | 1,600 | 25% | 4,900 |
| **Stretch Goal** | 900 | **2,500** | **38%** | **4,000** |

---

## Testing Strategy

After each phase:

1. **Automated tests** - Run full test suite:
   ```bash
   npm test
   ```

2. **Manual testing checklist**:
   - [ ] Load demo.pdf (small)
   - [ ] Load large PDF (100+ pages)
   - [ ] Zoom in/out (all levels)
   - [ ] Pan around viewport
   - [ ] Switch PDFs
   - [ ] Refresh page (persistence)
   - [ ] Mobile viewport (resize window)

3. **Performance validation**:
   - [ ] Load time ≤ baseline
   - [ ] Memory usage ≤ baseline
   - [ ] FPS during pan/zoom ≥ baseline

4. **Git commits**:
   - Commit after each major change
   - Tag phases: `v1.9.6-phase1`, `v1.9.6-phase2`, etc.
   - Can revert to last known-good state

---

## Risk Mitigation

### High-Risk Changes (Phase 2: TileStreamer)

**Mitigation:**
- Create feature branch `pruning/tilestreamer`
- Test with multiple PDF sizes (small, medium, large)
- A/B test with `?version=legacy` parameter
- Keep old TileStreamer code commented out for 1 release cycle

### Version Strategy

**Option A: Progressive releases**
- v1.9.7: Phase 1 + 2 (low-hanging + TileStreamer)
- v1.9.8: Phase 3 + 4 (component + PageStreamer)

**Option B: Single release**
- v2.0.0: All phases at once, major version bump
- Signals "major refactor" to users

**Recommended: Option A** (lower risk, faster feedback)

---

## Monitoring & Rollback

### Success Metrics

Track before/after for each phase:

```bash
# File size
wc -l index.html

# Function count
grep -c "function\|class" index.html

# Hook count
grep -c "useState\|useEffect" index.html

# Console calls
grep -c "console\." index.html

# Bundle size (if serving gzipped)
gzip -c index.html | wc -c
```

### Rollback Triggers

Revert if:
- Test failures increase >10%
- Load time increases >20%
- User reports of bugs increase >50%
- Memory usage increases >10%

---

## Stretch Goals (Beyond 4,000 LOC)

If phases 1-4 go smoothly, consider:

### 5. Dual-Resolution Removal
**Potential:** 500-800 lines

Replace low-res + high-res with single adaptive resolution.

**Risk:** HIGH (fundamental architecture change)

### 6. Simplify OpenSeadragon Integration
**Potential:** 200-300 lines

Replace OSD with simpler pan/zoom library (e.g., Panzoom.js)

**Risk:** VERY HIGH (large refactor)

### 7. Config-Driven Features
**Potential:** 300-500 lines

Move feature flags to URL parameters instead of code branches.

**Risk:** MEDIUM (affects all features)

---

## Anti-Bloat Discipline (Prevent Future Growth)

**New Rule:** For every feature added, remove 2x its LOC elsewhere.

### Code Review Checklist

Before merging new code, ask:

- [ ] Could this be a config change instead of code?
- [ ] Does this replace existing functionality? (Remove old code!)
- [ ] Can this reuse existing utilities?
- [ ] Is this debugging code that should be `?debug=1` only?
- [ ] Is this documentation that could link externally?
- [ ] Does this consolidate similar code elsewhere?

### LOC Budget

Set quarterly targets:

- **Q1 2025:** Maintain ≤4,000 LOC (pruning complete)
- **Q2 2025:** Reduce to 3,500 LOC (stretch goals)
- **Q3 2025:** Maintain 3,500 LOC (no new bloat)
- **Q4 2025:** Reduce to 3,000 LOC (if feature-complete)

---

## Version History & References

**This plan applies to:**
- index.html v1.9.6 (development branch)
- Commit: `080aec9` (as of 2025-11-17)
- 6,500 total lines

**Line number references valid for:** v1.9.6 only
**Update this plan when:** Major refactors change line numbers significantly

**Related docs:**
- SCALABILITY.md (optimization recommendations)
- lessons.md (development principles)
- CHANGELOG.md (feature history)

---

## Conclusion

The 6,500 LOC codebase is maintainable but has crossed the threshold where single-file architecture creates friction. **The primary bloat is TileStreamer (2,047 lines) and React Component (2,804 lines).**

A 38% reduction (→4,000 LOC) is achievable through:
1. Removing debug instrumentation (400 lines)
2. Simplifying TileStreamer (650 lines)
3. Streamlining UI component (400 lines)
4. Optimizing PageStreamer (150 lines)

**Critical success factors:**
- Extensive testing after each phase
- Maintain feature parity (no visible regressions)
- Follow anti-bloat discipline going forward

**Timeline:** 4 weeks for core pruning, 2 weeks for testing/polish

**Next step:** Begin Phase 1 (low-hanging fruit)
