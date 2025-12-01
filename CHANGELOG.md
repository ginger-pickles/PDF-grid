# Changelog

Notable changes to PDF Grid Viewer.

---

## [1.11.0] - 2025-11-30

### Changed
- **Async tile loading** - Switched from synchronous `getTileUrl` to async `downloadTileStart` pattern
  - OSD now properly tracks "loading" vs "loaded" tile state
  - Eliminates striped placeholder caching problem
  - `finishPendingJobs()` completes tiles when pages render
  - Each tile gets its own canvas (OSD caches references, not copies)
  - See THIS-BRANCH.md for investigation details

### Fixed
- **Tile scale bug** - Tiles appeared 64× too large (only corners visible)
  - Root cause: `_drawPageIntersection` multiplied by scale instead of dividing
  - Fix: `gridToTileScale = 1 / scale`

### Added
- Feedback-control visual test (`test-pattern-visual.spec.js`)
- THIS-BRANCH.md documenting tile loading lessons learned

### Removed
- 60+ diagnostic test files archived to `tests/archived/`

---

## [1.10.x] - 2025-11-17 to 2025-11-29

### 1.10.4
- Coordinated cache eviction and semaphore throttling
- Dead code cleanup

### 1.10.3
- Async tile refresh
- PageCache JPEG data URL handling fix

### 1.10.2
- Custom hooks and state refactoring
- Extract OSDManager module

### 1.10.0-1.10.1
- Extract TileGenerator and CacheManager classes
- 701 lines saved through delegation

---

## [1.9.6] - 2025-11-17

### Added
- **Bidirectional rendering strategy** for large PDFs
  - Solves cache thrashing (e.g., 126 pages with 120 cache)
  - Viewport-First rendering: immediately renders visible tiles
  - L0-Down background rendering with page-locality batching
  - Background rendering pauses during user interaction
- **Tile quality inspector** diagnostic tool
- **Feedback-driven tile healing system**
- **Viewport persistence** across page refreshes

### Fixed
- UI responsivity regression (async tile rendering with yielding)
- High-res cache thrashing with batched page loading
- Navigator incorrectly showing on mobile/touch devices
- Graceful error handling (no modal dialogs for auto-load failures)
- Stale tiles from OpenSeadragon internal cache

### Changed
- Empty URL input now destroys viewer and shows home screen

---

## [1.9.5] - 2025-11-16

### Added
- Conditional upfront rendering (`UPFRONT_RENDERING_PAGE_THRESHOLD: 100`)
  - PDFs ≤100 pages: all pages rendered before viewer init
  - PDFs >100 pages: skip Phase 3, pages render on-demand

### Fixed
- On-demand rendering blocked by stuck promises 
- Black tiles for rendered pages (missing tile invalidation)
- Entire viewer black after init for large PDFs (race condition)
- Pages 2-3 "source_out_of_bounds" errors (source rectangle clamping)

---

## [1.9.4] - 2025-11-16

### Fixed
- Cache invalidation regex for edge tiles (`0_edger_pX-Y`, `0_edgeb_pX`)
- Reduced on-demand rendering debounce 

### Added
- Draw Failures diagnostic panel (breakdown by failure reason)
- SCALABILITY.md analysis document

---

## [1.9.3] - 2025-11-15

### Added
- Demo PDF organization (`demo/` directory)
- Debug panel URL sync (`?debug` parameter)
- Debug panel accessible without PDF loaded

### Changed
- Debug panel reorganized into logical sections
- Statistics interleaved with controls
- PDF storage only for file:// protocol

---

## [1.9.2] - 2025-11-15

### Added
- Separate debug visualization controls (Verbose Logs, Tile Labels, Tile Borders)
- RESET button in debug panel
- Performance toggle controls (Parallel, On-Demand, Predictive, Upfront, Fallback)
- Resolution mode selector (High, Low, Dual)
- Cache size adjustment controls
- Memory usage statistics
- `?debug` URL parameter
- localStorage persistence for settings

### Fixed
- Variable scope issues (initialLowResCount, priorityPages undefined)
- Console spam with `?debug` parameter

---

## [1.9.1] - 2025-11-15

### Added
- Click-outside to close help panel
- Interactive debug panel with live statistics
- Refresh and Recreate buttons
- Example PDF links on home screen

### Changed
- DEBUG button moved into help panel
- Debug overlay with frosted glass effect
- Restored initial view to centered "page one"

---

## [1.9.0] - 2025-11-15

### Fixed
- L0 navigator tile cache completeness (100% pages cached before init)

### Added
- Hybrid rendering: continuous viewport monitoring + on-demand
- Velocity-based predictive rendering
- PageCache LRU eviction with test suite

---

## [1.8.14] - 2025-11-13

### Fixed
- Hairline gaps between tiles (scale-aware tile overlap)
- Switched to JPEG tiles (eliminated PNG transparency artifacts)
- Configured OSD `subPixelRoundingForTransparency`

---

## [1.8.13] - 2025-11-13

### Fixed
- Edge tile collision (edge marker in cache keys: right/bottom/both)

---

## [1.8.10-1.8.12] - 2025-11-13

- Hybrid cache key strategy (page-range for whole pages, position-based for partial)
- Clear tile cache before TiledImage recreation
- Removed cache generation system

---

## [1.8.5-1.8.9] - 2025-11-13

- Content-based fingerprint deduplication 
- Tile cache deduplication with page range keys
- Special case for 2-page PDFs

---

## [1.8.0-1.8.4] - 2025-11-12 to 2025-11-13

### Added
- Progressive loading with TiledImage recreation
- Scattered bit-reversal ordering for minimap progress

### Changed
- Power-of-2 render scale (4x)
- Render all pages synchronously before viewer init

---

## [1.7.1-1.7.3] - 2025-11-10 to 2025-11-12

### Added
- LRU cache for PageStreamer and TileCache
- PageStreamer/TileStreamer architecture
- Progressive loading with background rendering
- Tile cache diagnostics

---

## [1.6.x] - 2025-11-08 to 2025-11-09

### Added
- Progressive loading architecture
- Navigator minimap with progressive loading
- Dynamic global scale calculation
- Touch detection using CSS pixels

### Changed
- Hide navigator on touch devices

---

## [1.5.4] - 2025-11-09

### Added
- Stop button to cancel PDF loading
- Unlimited deep zoom on all devices

### Changed
- Reduced PDF render scale (2x → 1x)
- URL input updates immediately from URL parameter

### Note
Web deployment version (2025-11-09 to present). Git tag created retroactively.

---

## [1.5.0-1.5.3] - 2025-11-07 to 2025-11-08

### Added
- `?pdf=` parameter to fetch from server
- DEBUG_MODE, ErrorCodes, URLManager (Phase 1 refactoring)

### Fixed
- URL parameter persistence bug
- Auto-load for file:// protocol

---

## [1.4.x] - 2025-11-06 to 2025-11-07

### Added
- Local PDF persistence for faster refresh
- Help overlay with usage instructions
- URL loading features
- Mobile optimization

### Fixed
- Zoom constraints for large PDFs

---

## [1.0-1.3] - Historical

Initial development versions. OpenSeadragon-based deep zoom viewer with staggered diagonal grid layout.

### Placeholder Versions (backfilled 2025-11-09)
- 1.3.0, 1.2.8.2, 1.2.8.1, 1.2.8, 1.2.7, 1.2.6, 1.2.5, 1.2.4, 1.2.3, 1.2.2, 1.2.1, 1.2.0
- 1.1.8, 1.1.7, 1.1.6, 1.1.5, 1.1.4, 1.1.3, 1.1.2, 1.1.1, 1.1.0
- 1.0

---

## Version Convention

**Major.Minor.Patch**
- Major: Breaking changes
- Minor: New features
- Patch: Bug fixes

## Links

- [Repository](https://github.com/ginger-pickles/PDF-grid)
- [Issues](https://github.com/ginger-pickles/PDF-grid/issues)
