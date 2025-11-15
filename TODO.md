# TODO


## INTERFACE

Merge STOP button with LOAD buttons like modern browser (combined stop/reload button)

Close help pane by clicking outside (on OSD viewer)

On mobile, increase pan inertia (flickMomentum)

When input field is cleared and blank value submitted, clear URL params and go to home screen

Smartly harmonize home screen text with help screen text to include attribution, and do not display "drag & drop" on mobile

When demo PDF fails to load (file not present when served), remove ?pdf URL parameter after elegant failure

Handle situations where ?url and ?pdf parameters interact or error out depending on file:// vs http:// protocol in use

Handle situations where a .pdf url redirects to some other URL (right now "Error laoding PDF from URL: Failed to fetch proxy.")

Change the download command to expressly download the file to local storage, instead of loading a PDF in the browser

Handle URL redirects properly - some PDF URLs redirect to different locations (e.g., academic publications from institutional repositories)

Debug and fix iPadOS Safari download behavior (requires automated testing) - Download PDF button currently saves to browser's Downloads manager instead of filesystem. Need to determine which code path executes (Web Share API vs fallback), verify iPadOS detection, and implement proper filesystem save dialog or share sheet.

**Further improve sub-pixel hairline gaps between tiles (iOS Safari)** - Current solution: JPEG tiles + subPixelRoundingForTransparency:2 + 1px overlap + hasTransparency=false. Eliminates gaps on desktop Firefox, significantly improved on iOS Safari but some hairlines remain. Root cause: OpenSeadragon positions tiles at fractional pixel coordinates (e.g., 100.73px), forcing browser sub-pixel rendering. Solutions implemented: (1) JPEG format instead of PNG - eliminates PNG transparency rendering artifacts (per https://github.com/openseadragon/openseadragon/issues/2515), (2) subPixelRoundingForTransparency: 2 in OSD config, (3) 1-pixel tile overlap (2+ causes misalignment artifacts), (4) hasTransparency = false workaround. Failed approaches: Edge feathering with alpha (created wider gaps), large overlap (misalignment), CSS tricks alone (minimal effect). Further research: iOS Safari-specific rendering optimizations, alternative tile formats, whether remaining artifacts are acceptable.


## PERFORMANCE

**[NEXT] Fix iOS Safari crash on broad zoom-out** - iOS Safari crashes when zooming out to show entire grid with large PDFs (300+ pages). Suspected cause: Unlimited PageStreamer.pageCache exhausts iOS memory limits (~100-200MB for canvas). Current state: PageCache is unbounded Map (line 438), stores both low-res and high-res for all rendered pages forever (potential 600 canvases for 300-page PDF). TileCache has LRU eviction (max 300), but PageCache does not. Solution: (1) Add diagnostics first - log cache size during zoom, add keyboard shortcut to check memory stats, confirm correlation between cache size and crashes on iOS Safari, (2) Implement LRU eviction for PageCache similar to TileCache (suggest max 100-150 pages), prioritize low-res over high-res at low zoom, (3) Consider aggressive eviction on mobile devices and clearing high-res pages when zoomed out. See notes.md "NEXT: Fix iOS Safari Crash" for detailed implementation plan and line numbers.

Re-enable local PDF storage for faster refresh

Meet the rendering needs of two views displayed at once - minimap and deepzoom.

Render low-res tiles for minimap (0.X scale) in clever order; and substitute nearest available rendered page for otherwise blank tiles; replacing when ready. Result: Minimap is population in scattered fashion amongst dispersed pages instead of sequentially; unrendered gaps are temporarily filled with nearest neighbour and replaced as appropriate, progressively resolving to complete picture.

Render screen-res tiles for deep zoom (X.0 scale)) more cleverly. OSD view-aware rendering.

Optimize or add distinct caches for distinct tasks, as improves performance.

**Investigate tile cache generation mechanism effectiveness** - Current implementation invalidates entire tile cache every 5 pages during background loading by incrementing cacheGeneration counter. This forces regeneration of ALL tiles (even unaffected ones) and leaves stale generation tiles in cache until LRU eviction. Investigate: (1) Add diagnostics to measure tiles regenerated per invalidation cycle, (2) Track cache memory usage (stale vs active generation tiles), (3) Compare full cache invalidation vs selective invalidation (only tiles affected by newly loaded pages), (4) Determine optimal invalidation frequency (currently every 5 pages). Goal: Determine if generation counter improves progressive loading or just creates unnecessary churn. See index.html:1024, 1128, 1846-1850 for implementation.

**Evaluate deduplication effectiveness and periodicity exploitation** - Current implementation (v1.8.7) uses content-based fingerprints achieving 69.2% cache savings. However, unclear if this truly exploits spatial periodicity or just happens to work for current grid pattern. Investigate: (1) Compare fingerprint approach vs modulo-based canonical position (x % gridSize, y % gridSize), (2) Measure whether fingerprint overhead (pattern scanning, string generation) outweighs benefits vs simpler modulo approach, (3) Test with different grid sizes and patterns to verify generality, (4) Profile memory usage and key length impact on cache performance, (5) Determine if fingerprint deduplication rate matches theoretical periodicity predictions. Current fingerprint: p{num}@{relX},{relY} captures layout but may be over-engineered. Modulo might be simpler, faster, and equally effective for periodic patterns. Goal: Prove fingerprint approach is optimal or replace with simpler periodic solution. See v1.8.7 commit and analyzePeriodicityPatterns() output.

**Investigate exploiting spatial periodicity in TileStreamer and TileCache** - The staggered diagonal grid pattern repeats spatially (period = N pages), especially visible at minimap scales. At certain zoom levels, tiles contain identical page arrangements due to pattern repetition. Investigate: (1) Measure current tile utilization and cache hit rates to establish baseline, (2) Profile which tiles are rendered most often and identify periodic patterns, (3) Prototype canonical position mapping (x % period, y % period) for cache keys at minimap scales, (4) Measure improvement vs complexity trade-off, (5) If beneficial, consider content-based tile signatures or period-aware eviction. Start with simple modulo-based approach (2-3 hours), only add complexity if profiling shows clear gains. See notes.md "Exploiting Grid Pattern Periodicity" for detailed analysis and implementation approaches.

**Investigate tile-to-tile construction instead of on-demand page rendering** - Instead of rendering PDF pages on-demand when cache misses occur, explore constructing missing tiles by resampling existing tiles at different zoom levels, exploiting grid periodicity. For example: (1) Downsample L4 tile to create L3 tile (2x reduction), (2) Upsample L2 tile to create L3 tile (2x expansion with interpolation), (3) Use spatial periodicity to find equivalent tiles (x % period, y % period) and scale them. Benefits: Instant tile availability (no async PDF.js rendering), reduced CPU load, potentially smoother panning at intermediate zoom levels. Challenges: (1) Quality degradation from multiple resampling stages, (2) Need source tiles at appropriate levels, (3) Determine when resampling is acceptable vs waiting for proper page render, (4) Handle edge cases where no suitable source tile exists. Compare performance and visual quality against current on-demand rendering approach. May work best as fallback when both high-res and low-res page caches miss.

**Investigate rectangular tiles instead of square tiles** - Current implementation uses square tiles sized to max(pageWidth, pageHeight). OpenSeadragon supports rectangular tiles via getTileWidth()/getTileHeight(). Investigate: (1) Measure current tile utilization (% of tile canvas with content vs blank space), (2) Calculate typical page aspect ratios in target PDFs (US Letter ~1:1.3, A4 ~1:1.4), (3) Prototype rectangular tiles matching page proportions, (4) Measure tile count and memory usage vs square tiles, (5) Determine if rectangular tiles align better with grid periodicity. Only implement if gains are significant (>20% improvement). Could potentially compound benefits with periodic caching at overview scales. Analysis phase: 1-2 hours, Prototype: 3-4 hours. See notes.md "Rectangular Tiles" for detailed trade-offs and implementation approach.

Optimize page refresh performance; consider storing cache or canvas. (Currently re-renders all pages on every refresh; see notes.md for canvas storage vs progressive rendering options.)

Investigate Canvas API interpolation methods (imageSmoothingEnabled, imageSmoothingQuality) and potential artifacts from two-stage scaling (PDF.js render → Canvas drawImage composite). Consider quality vs performance trade-offs, especially when scaling low-res canvases for high-zoom tiles.

**Implement zoom-aware page rendering (Phase 1)** - Replace fixed-scale pre-rendering with dynamic scale-aware architecture where pages render at scales appropriate for zoom level. Make PageStreamer accept scale as parameter, implement scale quantization (0.3, 1.0, 2.0, 4.0, 8.0, 12.0), cache pages by (pageNum, scale), and add aggressive LRU eviction. This solves blur at deep zoom by ensuring crisp pixels at all zoom levels. See architecture.md "Scale-Aware Rendering Architecture" section for complete design.

**Consider viewport-aware region rendering (Phase 2 - Future)** - For extreme zoom (>10x), render only page regions needed for tiles instead of full pages. Reduces memory footprint at deep zoom and enables arbitrarily deep inspection of high-DPI content. Defer until Phase 1 complete and users report needing deeper zoom. See architecture.md "Phase 2: Viewport-Aware Region Rendering" for conceptual design.

Incorporate external libraries somehow rather than pulling from whereever they come from now



## FUNCTIONALITY

**Improve grid layout for even-numbered page counts** - Current staggered diagonal pattern creates aesthetically unbalanced layouts for even-page PDFs, especially with small page counts. Example: 4-page PDF has heavy blank space in upper-left and ends with partial row containing trailing blank. Consider: (1) Add extra row at bottom to balance the layout, (2) Shift entire pattern one row up to reduce top blanks, (3) Use different pattern formula for even N vs odd N, (4) Special cases for common sizes (2-page already handled in v1.8.8, consider 4-page, 6-page, 8-page). Goal: More visually balanced grid that doesn't feel "incomplete" or top-heavy. Not critical but affects polish and user experience with shorter documents.

Support annotating PDFs (long horizon)

Add support to switch between different page layouts: Staggered rotating grid (default), conventional wrapped grid,  vertical and horizontal scroll, Two-up, Infinite(?), etc. Fractal layout? Space-filling curve?

Elegantly handle odd-sized pages; including odd first pages. On PDF load, sample pages to determine the modal page dimensions. Big pages should be reduced. As a stretch goal, resolution should not be sacrificed. Generalizing, that means some regions of the map have greater resolution than others.

Add the ability to export the transformed tile canvas as an image; with approriate resolution options.

Add the ability to switch, with buttons, between PDFs residing in the local directory from which index.html is served

Add browser history support for back/forward navigation between local PDFs (see notes.md for implementation details)


## DOCUMENTATION

Review and purge obsolete content from documentation - Go through TODO.md, notes.md, and code comments to remove outdated items, completed tasks not marked done, and superseded implementation details. Update version references, remove dead links, consolidate duplicate information.

