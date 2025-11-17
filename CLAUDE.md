# CLAUDE.md - AI Assistant Guide for PDF Grid Viewer

This document provides AI assistants with essential information about the PDF Grid Viewer codebase, including structure, conventions, and best practices for making changes.

## Project Overview

**PDF Grid Viewer** is a client-side web application that displays PDF pages in a staggered N×N grid pattern, enabling users to discover structural patterns and visual relationships in documents through pan/zoom navigation.

- **Type**: Single-file HTML application
- **Current Version**: 1.5.4
- **Architecture**: Monolithic (all code in `index.html`)
- **No Build Process**: Runs directly in browser
- **Live Demo**: https://ginger-pickles.github.io/PDF-grid/

## Critical Architecture Principles

### 1. Single-File Design Philosophy
**ALL CODE LIVES IN `index.html`** - This is intentional for:
- Easy distribution (users can save and run offline)
- No build tools required
- Simple deployment
- Direct browser execution

**NEVER suggest**: Splitting into separate .js/.css files or adding build tools unless explicitly requested.

### 2. Technology Stack

```
React 18 (CDN)          → UI state management
PDF.js 3.11.174 (CDN)   → PDF parsing and rendering
OpenSeadragon 4.1.0     → Deep zoom/pan viewer
Tailwind CSS (CDN)      → Styling
Babel Standalone        → In-browser JSX transpilation
```

All dependencies loaded via CDN - no npm/package.json.

## File Structure

```
/home/user/PDF-grid/
├── index.html              # MAIN APPLICATION (1597 lines)
├── demo.pdf                # Sample PDF (auto-loaded)
├── README.md               # User-facing documentation
├── VERSION_MANAGEMENT.md   # Version sync strategy
├── RENDERING_ANALYSIS.md   # Deep technical analysis
├── TODO.md                 # Feature backlog
├── notes.md                # Development notes
└── .gitignore              # Excludes deploy.sh and *.pdf
```

## Code Organization in index.html

The file is organized into distinct modules (separated by `// ===` dividers):

| Lines | Module | Purpose |
|-------|--------|---------|
| 62-108 | CONFIG | Global configuration constants |
| 114-139 | ErrorCodes | Error categorization enum |
| 152-261 | PDFUtils | PDF loading and rendering |
| 267-326 | GridPattern | Staggered grid generation |
| 335-404 | URLManager | Browser history/deep linking |
| 414-446 | TileCache | FIFO cache for rendered tiles |
| 456-635 | PDFStorage | Hybrid sessionStorage/IndexedDB |
| 641-815 | CustomTileSource | OSD tile generation |
| 821-936 | OSDManager | OpenSeadragon initialization |
| 942-1592 | PDFGridViewer | Main React component |

## Key Conventions

### Naming Conventions
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `CONFIG.PDF_RENDER_SCALE`)
- **Functions**: `camelCase` (e.g., `loadPDFFromURL`)
- **Classes**: `PascalCase` (e.g., `CustomTileSource`)
- **React Components**: `PascalCase` (e.g., `PDFGridViewer`)

### Code Style
- Use `const` for immutable values, `let` for mutable
- Arrow functions for callbacks and inline functions
- Template literals for string concatenation
- Async/await for asynchronous operations
- Comprehensive try-catch blocks with error categorization

### Error Handling Pattern
```javascript
try {
  // operation
} catch (error) {
  console.error('Descriptive context:', error);
  alert(`User-friendly message: ${error.message}`);
  // Return error code from ErrorCodes enum
}
```

## Version Management

**IMPORTANT**: Version must be synchronized in two places:

1. **CONFIG.VERSION** in index.html (line ~64)
2. **Git tag** (e.g., `v1.5.4`)

Current version: **1.5.4**

### When Updating Version:
```bash
# 1. Update CONFIG.VERSION in index.html
# 2. Commit changes
git add index.html
git commit -m "vX.Y.Z: Description of changes"

# 3. Create matching git tag
git tag -a vX.Y.Z -m "Release vX.Y.Z: Description"

# 4. Push both commit and tag
git push origin branch-name
git push origin vX.Y.Z
```

**Known Issue**: v1.5.2 tag exists without matching CONFIG.VERSION - don't create this inconsistency.

## Development Workflow

### Testing Locally
```bash
# Serve the application
python -m http.server 8000

# Open in browser
http://localhost:8000/

# Edit index.html and refresh browser to see changes
```

### No Build Process
- Edit `index.html` directly
- Refresh browser to test
- No compilation, transpilation, or bundling
- Babel transpiles JSX in-browser automatically

### Testing Checklist
When making changes, manually test:
- [ ] File upload (drag-drop and button)
- [ ] URL loading with `?url=` parameter
- [ ] URL loading with `?pdf=` parameter
- [ ] Pan and zoom controls
- [ ] Mobile responsiveness
- [ ] Browser back/forward buttons
- [ ] PDF persistence across page refresh
- [ ] Help overlay display
- [ ] Stop button during loading
- [ ] Download functionality

## Common Development Tasks

### Adding a New Configuration Option

1. Add to CONFIG object (~line 62):
```javascript
const CONFIG = {
  // ... existing config
  NEW_SETTING: defaultValue,
};
```

2. Use throughout code via `CONFIG.NEW_SETTING`
3. Document in this file under "Key Configuration Options"

### Modifying the Grid Pattern

Edit `GridPattern.generate()` function (~line 280). Current algorithm creates staggered diagonal pattern:

```
Example N=5:
0 0 1 2 3
0 1 2 3 4
1 2 3 4 5
2 3 4 5 0
3 4 5 0 0
```

When changing:
- Maintain return format: `{ pattern: 2D array, cols, rows }`
- Test with various page counts (odd, even, prime numbers)
- Verify spacing calculations in `calculateDimensions()`

### Adjusting Performance

Key performance knobs in CONFIG:

| Setting | Current | Impact |
|---------|---------|--------|
| PDF_RENDER_SCALE | 1.0 | Higher = sharper but slower initial load |
| MAX_CACHE_SIZE | 300 | More tiles cached = more memory used |
| TILE_JPEG_QUALITY | 0.85 | Higher = better quality, larger memory |
| RENDER_BATCH_SIZE | 5 | Pages rendered before yielding to browser |

**Performance Strategy**: FIFO cache (not LRU) because PDF tiles are static.

### Adding UI Elements

All UI is in the `PDFGridViewer` component (~line 942). Uses:
- **React hooks** for state management
- **Tailwind CSS** for styling (utility classes)
- **Responsive design** with `md:` breakpoint (768px)

Example pattern:
```jsx
<button
  onClick={handleAction}
  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded md:px-6"
  title="Tooltip text"
>
  <span className="hidden md:inline">Desktop Text</span>
  <span className="md:hidden">Mobile</span>
</button>
```

## Critical Implementation Details

### 1. Storage Hierarchy

PDF persistence uses **hybrid storage**:

```
1. Try sessionStorage (fast, ~5MB limit, auto-clears on tab close)
   └─ If quota exceeded ↓
2. Fall back to IndexedDB (larger capacity, requires cleanup)
```

**7-day automatic expiry** on stored PDFs. Always check expiry on load.

### 2. Tile Generation

`CustomTileSource.generateTile(level, x, y)` is called by OpenSeadragon:

- Converts OSD tile coordinates to grid positions
- Draws relevant page canvases onto tile canvas
- Encodes as JPEG (0.85 quality)
- Returns data URL
- **Only caches when all pages loaded** (prevents incomplete cache)

### 3. CORS Handling

URLs loaded via CORS proxy:
```javascript
const proxiedUrl = CONFIG.CORS_PROXY + encodeURIComponent(url);
```

Current proxy: `https://corsproxy.io/?`

**Known Issue**: Some institutional PDFs redirect, proxy may not follow - see TODO.md

### 4. Mobile/Touch Detection

Two detection mechanisms:
- `isTouchDevice()`: Detects touch capability
- Width check: `< 600px` hides navigator minimap

iOS Safari requires special viewport height handling (see effect ~line 1056).

## Git Workflow

### Branch Strategy
Development happens on feature branches following pattern:
```
claude/claude-md-{session-id}-{unique-id}
```

**CRITICAL**: Always push to the branch specified in task context, never to main/master directly.

### Commit Message Format
```
vX.Y.Z: Brief description of changes

Optional longer description with:
- Bullet points for features
- Bug fixes noted
- Breaking changes highlighted
```

### Push Requirements
```bash
# Always use -u flag for new branches
git push -u origin branch-name

# Retry up to 4 times with exponential backoff (2s, 4s, 8s, 16s) on network errors
```

## Things to NEVER Do

### ❌ Don't Suggest These (Unless Explicitly Requested)

1. **Splitting into multiple files** - Breaks single-file philosophy
2. **Adding build tools** (webpack, vite, etc.) - Increases complexity
3. **Adding npm/package.json** - All deps via CDN
4. **Server-side processing** - Client-side only
5. **Automated tests** - Manual testing approach preferred
6. **Creating new .md files** - Already have comprehensive docs
7. **Force push to main/master** - Violates git safety

### ⚠️ Be Careful With

1. **OpenSeadragon API changes** - Tightly coupled with CustomTileSource
2. **React hooks dependencies** - useEffect dependencies must be complete
3. **Canvas memory** - Large PDFs can exhaust memory (monitor MAX_CACHE_SIZE)
4. **Storage quota** - sessionStorage varies by browser (handle gracefully)
5. **CORS proxy reliability** - Third-party service, may have downtime

## Common Pitfalls

### 1. Forgetting to Update Version
When making significant changes, update BOTH:
- CONFIG.VERSION in code
- Git tag

### 2. Breaking Mobile Responsiveness
Always test on:
- Desktop (>768px)
- Tablet (768px)
- Phone (<600px)

Use Tailwind `md:` breakpoint consistently.

### 3. Async State Updates
React state updates are asynchronous. Use functional updates when depending on previous state:

```javascript
// ❌ Wrong
setCount(count + 1);

// ✅ Correct
setCount(prev => prev + 1);
```

### 4. Memory Leaks with Refs
Clean up OpenSeadragon viewer in useEffect cleanup:

```javascript
useEffect(() => {
  // Initialize viewer
  return () => {
    if (osdViewerRef.current) {
      osdViewerRef.current.destroy();
    }
  };
}, []);
```

### 5. URL Parameter Conflicts
Two URL parameters supported:
- `?url=` - Remote PDF URL (requires CORS proxy)
- `?pdf=` - Filename for stored PDF

Don't mix them or create protocol mismatches.

## Debugging Tips

### Enable Debug Mode
Set `CONFIG.DEBUG_MODE = true` (line ~65) for verbose console logging.

### Common Issues

**PDF won't load from URL:**
- Check browser console for CORS errors
- Verify CORS_PROXY is working
- Test URL directly in browser
- Check for redirects (not currently handled)

**Grid looks wrong:**
- Verify GridPattern.generate() returns correct dimensions
- Check GRID_SPACING_RATIO (should be ~0.01)
- Inspect pattern array in console

**Zoom/pan not working:**
- Check CustomTileSource.getTileUrl() returns valid data URLs
- Verify canvases are populated (pagesLoaded === numPages)
- Check OpenSeadragon initialization errors

**Storage not persisting:**
- Check sessionStorage quota (browser-dependent)
- Verify IndexedDB fallback triggered
- Check 7-day expiry hasn't passed
- Look for STORAGE_* error codes

## Key Configuration Options

Located in CONFIG object (~line 62):

| Option | Default | Description |
|--------|---------|-------------|
| VERSION | '1.5.4' | App version (must match git tag) |
| DEBUG_MODE | false | Verbose console logging |
| AUTO_LOAD_PDF | 'demo.pdf' | PDF to load on startup |
| CORS_PROXY | 'https://corsproxy.io/?' | Cross-origin request proxy |
| PDF_RENDER_SCALE | 1.0 | Page render quality multiplier |
| GRID_SPACING_RATIO | 0.01 | Spacing between pages (1% of width) |
| DEFAULT_TILE_SIZE | 512 | Base tile size in pixels |
| TILE_JPEG_QUALITY | 0.85 | JPEG compression (0-1) |
| MAX_CACHE_SIZE | 300 | Maximum tiles to cache |
| STORAGE_EXPIRY_DAYS | 7 | Auto-delete stored PDFs after N days |
| OSD_MAX_ZOOM | 100 | Maximum zoom level |
| RENDER_BATCH_SIZE | 5 | Pages rendered before yielding |

## Documentation Files

Before making changes, review relevant documentation:

- **README.md** - User-facing features and usage instructions
- **TODO.md** - Known issues and planned features (check before implementing)
- **VERSION_MANAGEMENT.md** - Version synchronization strategy
- **RENDERING_ANALYSIS.md** - Deep dive into rendering architecture and future optimizations
- **notes.md** - Development notes and performance considerations

## Feature Requests / TODOs

Check **TODO.md** before implementing features. Current priorities:

**High Priority:**
- Merge stop/load buttons (browser-style reload/stop)
- Fix URL redirect handling
- Improve scroll wheel zoom sensitivity

**Future Enhancements:**
- Dual-resolution rendering (low-res minimap + high-res zoom)
- Multiple layout modes (wrapped grid, two-up, etc.)
- Directory-based PDF switching
- Export tiles as images

**Analyzed but Not Implemented:**
- See RENDERING_ANALYSIS.md for detailed dual-resolution architecture
- Scattered rendering order for progressive loading
- Viewport-aware tile prioritization

## Testing Strategy

### Manual Testing Approach
No automated tests - rely on comprehensive manual testing:

1. **Load Testing**: Upload, URL, drag-drop, auto-load, bookmarked URLs
2. **Interaction**: Pan, zoom (pinch/wheel/controls), navigate
3. **Persistence**: Refresh page, close/reopen tab, 7-day expiry
4. **Responsive**: Desktop, tablet, phone, landscape/portrait
5. **Error Handling**: Invalid PDFs, network errors, storage quota

### Test Files
Use various PDFs:
- Small (few pages, <1MB) - fast testing
- Large (100+ pages, >10MB) - performance/memory testing
- Various aspect ratios - layout testing
- demo.pdf - baseline reference

## Performance Characteristics

**Current Performance Profile:**
- Initial load: O(N) where N = number of pages
- Tile generation: O(K) where K = pages visible in tile
- Cache lookup: O(1) constant time
- Memory usage: ~2-3MB per page + cached tiles

**Memory Management:**
- TileCache uses FIFO eviction (simple, predictable)
- Canvas objects reused (single tileCanvas for all tiles)
- Page canvases kept in memory (required for tile generation)
- JPEG encoding reduces data URL size vs PNG

**Optimization Opportunities** (see RENDERING_ANALYSIS.md):
- Dual-resolution approach (low-res for overview, high-res for zoom)
- Progressive loading (scattered render order)
- Viewport-aware prioritization
- Worker thread tile generation

## Browser Compatibility

**Tested and Working:**
- Chrome/Edge (Chromium)
- Firefox
- Safari (desktop and iOS with viewport fixes)

**Required APIs:**
- Canvas API (rendering)
- FileReader API (file upload)
- sessionStorage (persistence)
- IndexedDB (fallback storage)
- History API (URL management)
- Fetch API (remote PDFs)

**Mobile Considerations:**
- Touch gestures handled by OpenSeadragon
- Viewport height fix for iOS Safari
- Navigator minimap hidden on small screens (<600px)
- Reduced button text on mobile

## Security Considerations

### Client-Side Only
- No server uploads (privacy-friendly)
- All processing in browser
- PDFs stored locally (sessionStorage/IndexedDB)

### CORS Proxy
- Third-party service (corsproxy.io)
- Passes URLs in query parameter
- Be cautious with sensitive PDFs via URL

### Input Validation
- File type checked before processing
- PDF.js validates PDF structure
- Error handling for malformed PDFs

## Quick Reference Commands

```bash
# Local development
python -m http.server 8000

# Version update
git tag -a vX.Y.Z -m "Message"
git push origin branch-name
git push origin vX.Y.Z

# Check git status
git status

# View recent commits
git log --oneline -5

# Serve index.html only
python -c "import http.server; http.server.test(HandlerClass=http.server.SimpleHTTPRequestHandler)" 8000
```

## When to Ask for Clarification

Before implementing significant changes, ask the user about:

1. **Architecture changes** - Splitting files, adding build tools
2. **New dependencies** - Additional CDN libraries
3. **Breaking changes** - API changes, storage format changes
4. **Version bumps** - Major vs minor vs patch
5. **Layout algorithm changes** - Non-staggered patterns
6. **Performance tradeoffs** - Memory vs quality vs speed

## Summary

PDF Grid Viewer is a carefully designed single-file application that prioritizes simplicity, offline capability, and ease of distribution. When making changes:

- Respect the single-file architecture
- Follow existing patterns and conventions
- Test thoroughly across devices
- Update version synchronously
- Document significant changes
- Consider performance implications
- Maintain client-side-only processing

The codebase is well-organized despite being monolithic. Each module has clear responsibilities. The key to working effectively with this codebase is understanding the data flow from PDF loading → rendering → grid generation → tile generation → OpenSeadragon display.

---

**Last Updated**: 2025-11-15 (for v1.5.4)
