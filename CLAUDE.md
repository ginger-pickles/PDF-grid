# CLAUDE.md - AI Assistant Guide for PDF Grid Viewer

KEEP DOCUMENTATION FILES UNDER 500 LINES.

KEEP DOCUMENTATION FORWARD-LOOKING. Code comments capture current state. Documentation captures future development vectors.

WHEN WRITING REPORTS, follow `reporting.md` format guidelines.

---

## Documentation Files

| File                             | Purpose                              |
|----------------------------------|--------------------------------------|
| `CLAUDE.md`                      | AI assistant guide (this file)       |
| `README.md`                      | User-facing documentation            |
| `CHANGELOG.md`                   | Version history                      |
| `THIS-BRANCH.md`                 | Current branch investigation notes   |
| `reporting.md`                   | Report format requirements             |
| `TESTING.md`                     | Test strategy, how to run tests      |
| `claude-development-vectors.md`  | Future optimization ideas            |
| `TODO.md`                        | Feature backlog, known issues        |
| `ideas.md`                       | Raw feature ideas                    |
| `lessons.md`                     | Development insights                 |

---

## Project Overview

**PDF Grid Viewer** is a client-side web application that displays PDF pages in a staggered N×N grid pattern, enabling users to discover structural patterns and visual relationships in documents through broad overviews and pan/zoom inspection.

- **Type**: Single-file HTML application
- **Architecture**: Monolithic (all code in `index.html`)
- **No Build Process**: Runs directly in browser
- **Live Demo**: https://ginger-pickles.github.io/PDF-grid/

## Critical Architecture Principles

### 1. Single-File Design Philosophy
**ALL CODE LIVES IN `index.html`** - This is intentional for:
- Easy distribution (users can save and run offline)
- No build tools required
- Simple deployment

**NEVER suggest**: Splitting into separate files or adding build tools unless explicitly requested.

### 2. Technology Stack

```
React                   → UI state management
PDF.js                  → PDF parsing and rendering
OpenSeadragon           → Deep zoom/pan viewer
Tailwind CSS (CDN)      → Styling
Babel Standalone        → In-browser JSX transpilation
```

### 3. Core Design Requirement: All Pages Visible

**The app MUST present all PDF pages simultaneously** to enable the core use case: discovering structural patterns across entire documents. This is non-negotiable.

---

## File Structure

```
index.html              # Main application (all code)
demo/                   # Sample PDFs for testing
tests/                  # Playwright test suite
  ├── test-pattern-visual.spec.js   # Feedback-control visual test
  ├── core-functionality.spec.js    # Basic functionality
  └── archived/                     # Diagnostic tests (not run regularly)
```

---

## Key Conventions

### Naming
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `CONFIG.PDF_RENDER_SCALE`)
- **Functions**: `camelCase` (e.g., `loadPDFFromURL`)
- **Classes**: `PascalCase` (e.g., `TileStreamer`)

### Code Style
- `const` for immutable, `let` for mutable
- Arrow functions for callbacks
- Async/await for asynchronous operations
- Try-catch with descriptive error messages

---

## Version Management

Version must be synchronized in three places:
1. **CONFIG.VERSION** in index.html
2. **Git tag** (e.g., `v1.11.0`)
3. **CHANGELOG.md** wherin should be captured descriptions of changes in all progress and all commits since the last tagged version.

```bash
# Update version workflow
# 1. Edit CONFIG.VERSION in index.html
# 2. Commit and tag
git commit -m "vX.Y.Z: Description"
git tag -a vX.Y.Z -m "Release vX.Y.Z"
git push origin branch-name && git push origin vX.Y.Z
```

---

## Development Workflow

```bash
# Serve locally
python -m http.server 8000

# Run tests
npx playwright test

# Run specific test
npx playwright test tests/test-pattern-visual.spec.js
```

Edit `index.html` directly, refresh browser to test. No build process.



## Anti-Bloat Discipline

For every feature added, consider removing 1.1x its LOC elsewhere.

Before adding code, ask:
- Could this be a config change instead?
- Does this replace existing functionality? (Remove old code!)
- Is this debugging code that should be `?debug=1` only?






---

## Things to NEVER Do

1. **Split into multiple files** - Breaks single-file philosophy
2. **Add build tools** (webpack, vite) - Increases complexity
3. **Server-side processing** - Client-side only
4. **Force push to main/master** - Git safety

## Be Careful With

1. **OpenSeadragon tile source API** - Use async `downloadTileStart` pattern (see THIS-BRANCH.md)
2. **React hooks dependencies** - useEffect deps must be complete
3. **Canvas memory** - Each tile needs its own canvas (OSD caches references)

---

## Development Vectors (Future Work)

### Progressive Tile Generation
Now that async tile loading works, implement progressive refinement:
- Publish tiles as pages complete (not waiting for all pages)
- Re-publish tiles when higher-res pages become available

### Performance
- Canvas pooling for tile generation
- Web Worker rendering (requires OffscreenCanvas)
- Spatial indexing for page intersection calculations

### Testing
- Expand feedback-control visual tests
- Test more sample points across pages
- Add zoom level coverage tests

---

## Debugging

### Enable Debug Mode
`CONFIG.DEBUG_MODE = true` or add `?debug` to URL

### Debug Panel
Shows cache statistics, tile info, rendering status. Toggle with `?debug` parameter.

### Common Issues

**Tiles not updating:** Check `pendingJobs` completion, verify `finishPendingJobs()` called after page render.

**Wrong tile scale:** Verify `gridToTileScale = 1 / scale` in `_drawPageIntersection`.

**OSD errors:** Ensure `getTileUrl` returns cache key even when using `downloadTileStart`.

---


## Browser Compatibility

**Tested:** Chrome, Firefox, Safari (desktop + iOS)

**Required APIs:** Canvas, FileReader, sessionStorage, IndexedDB, History, Fetch

**Mobile:** Touch gestures via OSD, viewport fix for iOS Safari, minimap hidden on small screens

---

## Security

- **Client-side only** - No server uploads
- **Local storage** - PDFs in sessionStorage/IndexedDB
- **CORS proxy** - Third-party (corsproxy.io) for remote PDFs - caution with sensitive content

---

## Quick Reference

```bash
python -m http.server 8000     # Serve
npx playwright test            # Test
git tag -a vX.Y.Z -m "msg"     # Tag
git push origin branch && git push origin vX.Y.Z  # Push
```

---

## When to Ask User

1. Architecture changes (splitting files, build tools)
2. New dependencies
3. Breaking changes
4. Version bump type (major/minor/patch)
5. Performance vs quality tradeoffs

---

## Summary

PDF Grid Viewer prioritizes simplicity, offline capability, and ease of distribution.

When making changes:
- Respect single-file architecture
- Follow existing patterns
- Test across devices
- Update version synchronously
- Keep documentation forward-looking
- Learn from THIS-BRANCH.md lessons
