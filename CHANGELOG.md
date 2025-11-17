# Changelog

All notable changes to PDF Grid Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.5-revised] - 2025-11-16

### Goal
- Optimize Phase 3 upfront rendering for large PDFs
- Improve viewer initialization speed for documents with 100+ pages
- Fix on-demand rendering blocked by stuck promises
- Preserve high-quality 4.0 render scale

### Added
- **Conditional upfront rendering**: New `UPFRONT_RENDERING_PAGE_THRESHOLD: 100` config parameter
  - PDFs with ≤100 pages: All pages rendered before viewer initialization (prevents blank tiles)
  - PDFs with >100 pages: Skip Phase 3 upfront rendering to avoid blocking (pages render on-demand)
  - Saves ~10ms per page in initialization time for large documents

### Fixed
- **Critical:** On-demand rendering blocked by stuck promises in renderingInProgress Map
  - Added try...finally cleanup to ensure renderingInProgress always gets cleaned up (line 675-679)
  - Added 10-second safety timeout to auto-cleanup stuck promises (line 686-694)
  - Prevents permanent blocking of on-demand rendering for affected pages
  - Fixes missing pages issue in large PDFs where upfront rendering is skipped
  - Confirmed fix: natgeo-1969-05.pdf (194 pages) now renders 100% of pages (was 60%)

- **Critical:** Tiles showing black for rendered pages due to missing tile invalidation
  - PageStreamer now automatically invalidates affected tiles when pages finish rendering (line 672-679)
  - Calls `tileStreamer._invalidateTilesUsingPages()` + `scheduleRedraw()` after caching each page
  - Applies to ALL page renders (initial, upfront, on-demand) not just on-demand
  - Ensures tiles regenerate with newly-rendered page content instead of showing black
  - Debounced redraw (30ms) batches multiple page completions for efficiency

- **Critical:** Entire viewer black after initialization for large PDFs (race condition)
  - Pre-initialization tile cache clear prevents black tiles from persisting (line 3100-3112)
  - Post-initialization tile refresh waits for renders to complete, then clears stale tiles (line 3116-3148)
  - Applies only when Phase 3 is skipped (PDFs >100 pages)
  - Eliminates race where tiles generated during init show black pages that later finish rendering

- **Critical:** Pages 2-3 failing to draw with "source_out_of_bounds" errors (70,513 failures)
  - Source rectangle clamping handles dimension mismatches gracefully (line 2295-2316)
  - Clamps srcX, srcY, srcW, srcH to actual canvas bounds instead of rejecting draw
  - Prevents crashes when grid dimensions don't match actual page canvas dimensions
  - Pages now render (potentially clipped) instead of showing as solid black
  - Diagnostic logging when clamping occurs (verbose mode only)

### Changed
- Phase 3 upfront rendering now conditional based on page count (line 3028-3070)
  - Console logging indicates when Phase 3 is skipped and estimated time saved
  - Maintains blank-tile-free experience for small-to-medium PDFs
  - Dramatically improves perceived performance for large PDFs (e.g., 200-page doc saves ~10 seconds)
- PageStreamer.renderPage() improved promise lifecycle management (line 653-703)
  - Promise added to Map before async work begins
  - Timeout cleanup prevents indefinite blocking
  - Error logging for failed renders

### Technical
- Config addition at line 143: `UPFRONT_RENDERING_PAGE_THRESHOLD: 100`
- Conditional check: `pdf.numPages > CONFIG.UPFRONT_RENDERING_PAGE_THRESHOLD`
- When skipped: On-demand rendering fills in minimap tiles as user pans/zooms
- When enabled: Same comprehensive Phase 3 rendering as before

### Testing
- **Automated test suite** validates all fixes:
  - `tests/natgeo-missing-pages-automated.spec.js` - Checks page cache status, visual content %, draw failures
  - `tests/natgeo-broad-zoom-test.spec.js` - Verifies grid visibility at broad zoom levels
  - `tests/natgeo-comprehensive-visual-test.spec.js` - **Smart grid-pattern analysis** across 3 views:
    - Initial view (centered on page 1): 62.4% content coverage
    - Broad zoom (entire grid): 100% of expected on-screen pages visible (0 missing)
    - Minimap/navigator: 67.3% content coverage
  - All tests confirm 194/194 pages cached (100%) with no missing pages in grid
  - Tests use grid pattern logic to identify expected page positions, ignoring natural empty corners in diagonal layout

### Notes
- **Render scale preserved at 4.0** (high quality) - NOT changed to 3.0
- Non-breaking change - existing small PDF behavior unchanged
- Large PDF users get immediate viewer initialization instead of waiting
- Based on v1.9.4 stable foundation, applying selective v1.9.5 optimizations only

## [1.9.4] - 2025-11-16

### Goal
- Fix persistent empty/incomplete tiles bugs
- Improve performance and responsiveness
- Add comprehensive diagnostics

### Fixed
- **Critical:** Cache invalidation regex now properly handles edge tiles (keys like `0_edger_pX-Y`, `0_edgeb_pX`)
  - Previously, edge tiles were never invalidated when their pages finished rendering
  - Led to persistent blank/incomplete edges that never updated
  - Added warning log for unparseable tile keys to detect future issues
- Reduced on-demand rendering debounce delay from 100ms to 30ms for faster visual feedback
  - Tiles now update 3x faster when pages finish rendering
  - Better perceived performance during progressive loading

### Added
- **Draw Failures diagnostic panel** in debug overlay
  - Shows total failures vs successes
  - Breakdown by failure reason (no_canvas, invalid_dimensions, source_out_of_bounds, draw_exception)
  - Last 5 failures with level, page number, and resolution
  - "Clear Failures" button for testing
  - Only appears when failures are detected (red warning indicator)
- **SCALABILITY.md** - Comprehensive analysis for large PDF support (1000+ pages)
  - Current bottlenecks identified
  - Short-term, medium-term, and long-term recommendations
  - Performance targets and implementation roadmap
  - Configuration guidance for different deployment sizes

### Technical
- Cache invalidation uses same regex but now with fallback logging (line 1856-1890)
- Debounce timeout reduced from 100ms to 30ms (line 1366-1388)
- Debug panel draw failures section (line 4643-4685)
- Comprehensive empty tile diagnostics via `window.__drawPageDebug`

### Notes
- All changes are non-breaking - existing functionality preserved
- Focus on bug fixes and diagnostics, not new features
- Prepares groundwork for v1.9.5 scalability improvements

## [1.9.3] - 2025-11-15

### Goal
- Improve debug panel organization and usability

### Added
- Demo PDF organization: Created `demo/` directory for example PDFs
- Debug panel URL sync: `?debug` parameter syncs with panel open/close state
- Debug panel accessibility: Can now be opened even when no PDF is loaded
- Interleaved statistics: Cache statistics now displayed directly below corresponding controls

### Changed
- **Debug panel reorganization**: Complete restructuring into logical sections
  - **Pages section**: Page count, PDF File Size, Storage info grouped together
  - **Debug Visualization**: Verbose Logs, Tile Labels, Tile Borders (row 1)
  - **Manual Controls**: Refresh, Recreate buttons (row 2)
  - **Page Rendering & Cache**: Total memory, rendering strategy buttons (Upfront, Parallel, On-Demand, Predictive), page cache controls with statistics, viewport radius
  - **Tile Streaming & Cache**: Resolution controls (High, Low, Dual, Fallback), tile cache controls with statistics
  - **Settings**: RESET button at bottom
- Statistics now interleaved with controls for immediate feedback (count, memory usage, average sizes)
- Resolution controls (High/Low/Dual/Fallback) moved to Tile Streaming & Cache section for better logical grouping
- PDF storage behavior: Only saves to sessionStorage/IndexedDB when using file:// protocol
- PDF auto-restore: Only restores cached PDF when opened locally (file:// protocol)
- All test files updated to use `demo/` directory structure

### Technical
- Debug panel state synchronized with URL via `window.history.replaceState`
- Conditional storage based on `window.location.protocol === 'file:'`
- Test paths updated via regex replacement: `pdf=demo-*.pdf` → `pdf=demo/demo-*.pdf`
- Statistics display shows: cache size, memory usage (MB), average item size
- Each cache control section displays its statistics inline for better UX

## [1.9.2] - 2025-11-15

### Goal
- Eliminate empty/blank tile issues once and for all

### Fixed
- Variable scope issues in backend integration (initialLowResCount and priorityPages undefined errors)
- Console spam when using `?debug` parameter (separated verbose logging from visual debugging)

### Added
- Separate debug visualization controls (Verbose Logs, Tile Labels, Tile Borders toggles)
- RESET button in debug panel to restore all settings to defaults
- Performance toggle controls in debug panel (Parallel, On-Demand, Predictive, Upfront, Fallback rendering)
- Resolution mode selector (High, Low, or Dual resolution rendering)
- Cache size adjustment controls (Tile Cache, LowRes Pages, HighRes Pages, Viewport Radius)
- Memory usage statistics in debug panel (total memory, cache weights, average tile/page sizes)
- PDF file size display in debug panel memory statistics
- Storage usage display showing size of cached PDF in sessionStorage/IndexedDB
- `?debug` URL parameter to automatically open debug panel on page load
- localStorage persistence for all performance toggles and cache parameters (persists across page refresh)
- Console logging for performance feature and cache parameter changes
- Scrollable debug panel for better handling of expanded statistics

### Changed
- Performance features can now be toggled on-the-fly for testing
- Cache sizes can now be adjusted on-the-fly for testing
- All settings sync with CONFIG in real-time
- Re-enabled local PDF storage for faster page refresh (sessionStorage/IndexedDB hybrid)
- Improved error messages to distinguish between storage failures and server fetch failures
- Debug button now accessible even when no PDF is loaded

### Technical
- Five performance toggles: PARALLEL_RENDERING_ENABLED, ON_DEMAND_RENDERING_ENABLED, PREDICTIVE_RENDERING_ENABLED, UPFRONT_RENDERING_ENABLED, FALLBACK_RENDERING_ENABLED
- Resolution mode selector: RESOLUTION_MODE ('high', 'low', or 'dual')
- Four cache size parameters: MAX_CACHE_SIZE, PAGE_CACHE_MAX_SIZE_LOW, PAGE_CACHE_MAX_SIZE_HIGH, VIEWPORT_PRIORITY_RADIUS
- All settings save to localStorage and load on mount
- useEffect hooks sync React state with CONFIG object
- Number inputs with validation and step increments for cache parameters
- getMemoryStats() calculates actual memory usage based on canvas dimensions (width × height × 4 bytes per pixel)
- Memory statistics include total MB, per-cache MB, item counts, and average sizes
- Backend integration: Resolution mode controls Phase 1 (high-res), Phase 2 (low-res), and Phase 3 (upfront) rendering
- Backend integration: Upfront toggle controls Phase 3 rendering (all remaining pages before viewer starts)
- Backend integration: Fallback toggle controls whether tiles can use alternate resolution when requested resolution unavailable
- Resolution mode 'high': Skips low-res rendering, renders only high-resolution pages
- Resolution mode 'low': Skips high-res rendering, renders only low-resolution pages
- Resolution mode 'dual': Renders both high-res and low-res (default behavior)
- Fallback rendering enabled: Tiles use low-res when high-res unavailable, and vice versa (with quality constraints)
- Fallback rendering disabled: Tiles show blank when requested resolution unavailable (on-demand rendering fills them in)

## [1.9.1] - 2025-11-15

### Added
- Click-outside functionality to close help panel by tapping on OpenSeadragon viewer
- Interactive debug panel with live statistics (updates every 500ms)
- Debug Tiles toggle button in debug panel (consolidated borders and labels)
- Refresh button to manually trigger tile redraw
- Recreate button to rebuild TiledImage with cache clearing
- Close button (X) for debug panel
- Page counter display in debug panel
- Example PDF links on home screen (magazine, book, academic publication)
- National Geographic 1969-05 PDF as local demo file
- Automated test suite for debug panel controls (tests/debug-panel-recreate.spec.js)

### Changed
- Moved DEBUG button from fixed position into help panel (next to DOWNLOAD button)
- Moved debug display from help panel to transparent overlay on OpenSeadragon viewer
- Positioned debug overlay in bottom-left corner with frosted glass effect
- Debug panel now auto-closes help panel when opened
- Made debug panel mobile-responsive (max-width 48vw on small screens, compact padding and fonts)
- Help panel buttons (Download, Debug) now always visible but disabled when no PDF loaded
- Updated magazine example link from Popular Mechanics to National Geographic (local)
- Updated book example link to "The Tale of Ginger and Pickles"
- Restored initial view to centered "page one" instead of full grid (DEBUG_INITIAL_VIEW_WHOLE_GRID = false)
- Harmonized home screen text with help panel content
- Home screen shows conditional messaging based on device type (mobile vs desktop)
- Changed home screen heading to "Specify a PDF to get started"
- Improved home screen text layout with max-width constraint for readability

### Technical
- Sync CONFIG.DEBUG_MODE with debug panel toggle states
- Live update mechanism for debug statistics
- Fixed Recreate button bug (changed cache.clear() to tileCache.clear())

## [1.9.0] - 2025-11-15

### Fixed
- Fixed L0 navigator tile cache completeness to ensure 100% of pages are cached before viewer initialization
- Resolved blank tile issues in navigator minimap

### Added
- Hybrid rendering system: continuous viewport monitoring + on-demand rendering
- Velocity-based predictive rendering for viewport-aware page prioritization
- Parallel viewport-aware rendering infrastructure
- Comprehensive fallback tracking for tile rendering diagnostics
- PageCache LRU eviction with automated test suite
- Memory monitoring tests for zoom operations

### Changed
- Slowed down test panning to realistic speeds, revealing rendering performance improvements

### Performance
- Significantly improved tile rendering during panning with predictive loading
- Optimized page cache management to prevent unbounded memory growth

## [1.8.14] - 2025-11-13

### Fixed
- Fixed hairline gaps between tiles by implementing scale-aware tile overlap
- Significantly reduced tile gaps using JPEG format + OpenSeadragon config + 1px overlap

### Changed
- Switched to JPEG tile format to eliminate PNG transparency rendering artifacts
- Configured OpenSeadragon `subPixelRoundingForTransparency: 2` to reduce sub-pixel gaps
- Removed CSS image-rendering overrides to fix moiré artifacts

### Documentation
- Documented antialiasing halo issue causing dark hairlines between tiles
- Added iOS Safari crash investigation notes to TODO

## [1.8.13] - 2025-11-13

### Fixed
- Fixed edge tile collision by specifying which edge (right/bottom/both) in cache keys
- Proper edge disambiguation for tile deduplication

### Changed
- Replaced tile count heuristic with explicit edge marker for deduplication

## [1.8.12] - 2025-11-13

### Changed
- Clear tile cache before TiledImage recreation to prevent stale tile issues

## [1.8.11] - 2025-11-13

### Removed
- Removed cache generation system (simplified cache invalidation approach)

## [1.8.10] - 2025-11-13

### Changed
- Implemented hybrid cache key strategy: page-range keys for whole pages, position-based keys for partial pages
- Improved tile cache deduplication for deep zoom levels

## [1.8.9] - 2025-11-13

### Documentation
- Added TODO to evaluate fingerprint vs modulo deduplication approach
- Noted aesthetic issues with even-numbered page layouts

## [1.8.8] - 2025-11-13

### Added
- Special case handling for 2-page PDFs to improve grid layout
- Enhanced tile key display in debug mode

## [1.8.7] - 2025-11-13

### Added
- Content-based fingerprint deduplication for tile caching
- Achieved 69.2% cache savings through pattern recognition

### Fixed
- Fixed tile cache collision bug by including position in cache keys

## [1.8.6] - 2025-11-13

*(No documented changes - intermediate version)*

## [1.8.5] - 2025-11-13

### Added
- Tile cache deduplication with page range keys
- Significant memory savings for repeated page patterns in staggered grid

## [1.8.4] - 2025-11-13

### Performance
- Optimized tile fallback behavior for smoother progressive loading
- Removed unnecessary cache invalidation to improve performance

## [1.8.3] - 2025-11-13

*(No documented changes - intermediate version)*

## [1.8.2] - 2025-11-13

### Changed
- Switched to power-of-2 render scale (4x) for optimal performance
- Optimized tile sizing for better memory utilization

## [1.8.1] - 2025-11-13

### Changed
- Decoupled URL parameters from auto-load configuration
- Improved cross-platform PDF download behavior

## [1.8.0] - 2025-11-12

### Added
- Progressive loading with TiledImage recreation
- Fast initial load with no blank tiles in viewport
- Scattered bit-reversal ordering for better perceived minimap progress

### Changed
- Render all pages synchronously before viewer initialization to prevent blank tiles

## [1.7.3] - 2025-11-12

### Fixed
- Fixed blank tile caching issues (working but requires optimization)

## [1.7.2] - 2025-11-12

### Added
- Tile cache diagnostics logging for investigating blank tile issues
- Progressive loading with background rendering - dramatic performance improvement

## [1.7.1] - 2025-11-10

### Added
- LRU cache implementation for PageStreamer
- Scale-aware rendering architecture documentation
- Upgraded TileCache to LRU eviction

### Changed
- Implemented PageStreamer/TileStreamer architecture for on-demand rendering

### Documentation
- Comprehensive architecture documentation for future scale-aware rendering phases

## [1.6.12] - 2025-11-09

### Documentation
- Documented selective tile invalidation attempts
- Kept improved TiledImage recreation approach

## [1.6.11] - 2025-11-09

### Added
- Example book link in help pane

## [1.6.10] - 2025-11-09

### Added
- Example magazine link in help pane

## [1.6.9] - 2025-11-09

### Added
- Storage caching for URL-loaded PDFs

## [1.6.8] - 2025-11-09

### Added
- Timing debug messages to URL loading path

## [1.6.7] - 2025-11-09

### Added
- Detailed loading debug messages with timing

## [1.6.6] - 2025-11-09

### Changed
- Disabled rendering progress debug messages

## [1.6.5] - 2025-11-09

### Changed
- Eliminated special case for first page rendering

## [1.6.4] - 2025-11-09

### Added
- N×N staggered grid pattern as default layout

## [1.6.3] - 2025-11-09

### Added
- Eviction control to PageCache for arbitrary page counts
- Dynamic global scale calculation based on page count

### Changed
- Re-enabled navigator minimap with progressive loading

### Fixed
- Fixed typo: prerenderedPagesRef vs prererenderedPagesRef
- Changed initial view to show whole grid instead of first page

## [1.6.2] - 2025-11-09

### Changed
- Returned to v1.2.8 progressive loading approach

## [1.6.1] - 2025-11-08

### Changed
- Disabled progressive loading for global grid view

## [1.6.0] - 2025-11-08

### Added
- Progressive loading architecture (pre-render approach)
- Touch detection using CSS pixels instead of physical pixels

### Changed
- Hide navigator minimap on touch devices
- Fixed interface issues: removed version from title, handle missing demo.pdf

## [1.5.4] - 2025-11-09

### Added
- Stop button to cancel PDF loading (appears with spinner overlay)
- Unlimited deep zoom on all devices and document sizes
- Gesture settings for consistent touch/desktop zoom behavior

### Changed
- Reduced PDF render scale from 2x to 1x for faster loading and reduced memory usage
- Removed maxZoomLevel and maxZoomPixelRatio constraints (set to null/Infinity)
- Fixed minZoomImageRatio to constant 0.9 for all documents
- Reduced visibilityRatio from 0.9 to 0.01 for deep zoom in large documents
- Updated demo book link to "The Unwritten Laws of Engineering"
- URL input field now updates immediately when loading from URL parameter
- Local filenames now properly update ?pdf parameter in address bar

### Technical
- Added loadingCancelledRef to track cancellation state
- Implemented cancel checking in renderAllPages loop
- Improved cleanup when loading is cancelled
- Better error handling for cancelled vs failed loads

### Note
**Web deployment version** - This version was deployed to the web and served as the public release from 2025-11-09 to present. Git tag was created retroactively on 2025-11-15.

## [1.5.3] - 2025-11-08

*(No documented changes - intermediate version)*

## [1.5.2] - 2025-11-08

*(No documented changes - intermediate version)*

## [1.5.1] - 2025-11-07

### Added
- DEBUG_MODE, ErrorCodes, and URLManager (Phase 1 refactoring)

## [1.5.0] - 2025-11-07

### Added
- `?pdf=` parameter to fetch from server when served

### Changed
- Improved empty state message about offline vs served usage

### Fixed
- Fixed URL parameter persistence bug
- Fixed auto-load for file:// protocol

### Documentation
- Documented page refresh performance trade-offs
- Documented browser history support for future implementation

## [1.4.4] - 2025-11-07

### Added
- Local PDF persistence for faster refresh

## [1.4.3] - 2025-11-06

### Added
- Help overlay with usage instructions
- Improved URL field UX

### Changed
- Improved help text and tightened grid spacing

## [1.4.2] - 2025-11-06

### Fixed
- Fixed zoom constraints for large PDFs

## [1.4.1] - 2025-11-06

### Added
- UI/UX improvements
- Mobile optimization

### Changed
- Added demo.pdf for auto-load feature

## [1.4.0] - 2025-11-06

### Added
- Refactored architecture
- URL loading features

### Changed
- Fixed UI text: Changed 'Double-click to reset view' to 'Click to center'

## [1.3.0] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.8.2] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.8.1] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.8] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.7] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.6] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.5] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.4] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.3] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.2] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.1] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.2.0] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.8] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.7] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.6] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.5] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.4] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.3] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.2] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.1] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.1.0] - 2025-11-09

### Note
Historical version - detailed change information not available

## [1.0] - 2025-11-09

### Added
- Initial release of PDF Grid Viewer
- OpenSeadragon-based deep zoom viewer for PDFs
- Staggered diagonal grid layout
- Basic file loading and URL support

### Note
Historical version - this and versions 1.1.0-1.3.0 were backfilled into version control on 2025-11-09

---

## Version Naming Convention

- **Major.Minor.Patch** (e.g., 1.9.1)
  - **Major**: Breaking changes or major feature additions
  - **Minor**: New features, significant improvements
  - **Patch**: Bug fixes, minor improvements

## Links

- [Repository](https://github.com/ginger-pickles/PDF-grid)
- [Issues](https://github.com/ginger-pickles/PDF-grid/issues)
