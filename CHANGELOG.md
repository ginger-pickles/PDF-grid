# Changelog

All notable changes to PDF Grid Viewer will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.9.1] - 2025-11-15

### Added
- Click-outside functionality to close help panel by tapping on OpenSeadragon viewer
- Interactive debug panel with live statistics (updates every 500ms)
- Toggle buttons for tile borders and labels in debug panel
- Close button (X) for debug panel
- Page counter display in debug panel

### Changed
- Moved DEBUG button from fixed position into help panel (next to DOWNLOAD button)
- Moved debug display from help panel to transparent overlay on OpenSeadragon viewer
- Positioned debug overlay in bottom-left corner with frosted glass effect
- Debug panel now auto-closes help panel when opened
- Restored initial view to centered "page one" instead of full grid (DEBUG_INITIAL_VIEW_WHOLE_GRID = false)

### Technical
- Sync CONFIG.DEBUG_MODE with debug panel toggle states
- Live update mechanism for debug statistics

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
