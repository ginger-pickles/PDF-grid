# PDF Grid Viewer

A viewer that displays pages in a continuous rotating grid pattern, allowing patterns in the document to emerge.

**Live Demo**

https://ginger-pickles.github.io/PDF-grid/

## Usage

This is a standalone HTML file `index.html` that can be opened directly in a modern web browser.

**Quick Start:**
1. Visit the live demo URL or save the file locally and open in a web browser
2. Load a PDF using one of four methods:
   - **Upload:** Click "Local PDF" and select a file from your device
   - **Drag-and-Drop:** Drag a PDF file onto the viewer
   - **URL:** Enter a URL in the text field and click "Open URL" (or press Enter)
   - **Query parameter:** Add `?url=https://example.com/file.pdf` to the page URL
3. Use mouse to pan (drag) and zoom (scroll)
4. Local PDFs persist across page refreshes (stored for 7 days)

**Auto-Load for Development:**

For faster testing, place a PDF named `demo.pdf` in the same directory as `index.html`. The viewer will automatically load it on page load.

- Serve the directory with a local web server (e.g., `python -m http.server`)
- Open `http://localhost:8000/` in your browser
- The PDF will load automatically - just refresh to see changes!

To disable auto-load or change the filename, edit `CONFIG.AUTO_LOAD_PDF` in index.html:29

**Loading from URL:**

You can load PDFs from any URL in two ways:

1. **Via UI:** Enter the URL in the input field and click "Load URL" (or press Enter)
2. **Via Query Parameter:** `http://localhost:8000/?url=https://example.com/file.pdf`

Query parameters take precedence over auto-load configuration.

**URL Parameters:**

The viewer supports several URL parameters that can be combined for flexible debugging and testing workflows:

| Parameter | Description | Values | Example |
|-----------|-------------|--------|---------|
| `?url=<URL>` | Load PDF from external URL | Any valid URL | `?url=https://example.com/file.pdf` |
| `?pdf=<filename>` | Load PDF from same directory (requires serving) | Filename in same directory | `?pdf=demo.pdf` |
| `?debug` | Auto-open debug panel on page load | `true`, `1`, or empty (enabled)<br>`false`, `0` (disabled) | `?debug` or `?debug=1` |

**URL Parameter Examples:**

Basic usage:
- Enable debug panel: `http://localhost:8000?debug`
- Enable debug panel (explicit): `http://localhost:8000?debug=1` or `?debug=true`
- Disable debug panel: `http://localhost:8000?debug=0` or `?debug=false`

Combined with PDF loading:
- Load local file with debug: `http://localhost:8000?pdf=demo.pdf&debug`
- Load local file, debug off: `http://localhost:8000?pdf=demo.pdf&debug=0`
- Load from URL with debug: `http://localhost:8000?url=https://example.com/file.pdf&debug`

**Debug Panel Features:**

When enabled via `?debug` parameter or the "Show Debug" button, the debug panel provides:

*Real-time Performance Monitoring:*
- Live cache statistics (page cache: low-res/high-res, tile cache)
- Tile rendering stats (full renders, fallback renders, fallback percentage)
- Cache miss tracking and on-demand rendering metrics
- Parallel rendering progress (pages rendered, rate in pages/second)
- Memory usage statistics with breakdown by cache type

*Interactive Performance Controls:*
- **Parallel Rendering:** Toggle viewport-aware parallel rendering with worker pools
- **On-Demand Rendering:** Toggle immediate page rendering when tiles need missing pages
- **Predictive Rendering:** Toggle velocity-based predictive page loading
- **Debug Tiles:** Toggle visual tile borders and labels showing level and cache keys

*Cache Tuning Controls:*
- **Tile Cache Size:** Adjust max tiles in TileCache (default: 300 desktop, 150 mobile)
- **LowRes Pages:** Adjust low-res page cache for minimap (default: 100 desktop, 200 mobile)
- **HighRes Pages:** Adjust high-res page cache for deep zoom (default: 100 desktop, 50 mobile)
- **Viewport Radius:** Adjust priority zone (pages within N pages of viewport, default: 2)

*Memory Usage Statistics:*
- **Total Memory:** Combined memory usage across all caches (in MB)
- **Cache Breakdown:** Memory per cache type with item counts
- **Average Sizes:** Typical memory per tile, low-res page, and high-res page
- **Live Updates:** Statistics refresh every 500ms during use

*Additional Controls:*
- **Refresh:** Force tile redraw to update display with newly-rendered pages
- **Recreate:** Rebuild TiledImage and clear tile cache (preserves viewport position)
- **Close (×):** Close debug panel

*Persistence:*
- All performance toggle states save to localStorage and persist across page refreshes
- All cache size parameters save to localStorage and persist across page refreshes
- Console logs all changes to performance features and cache parameters for debugging

**Use Cases:**
- **Testing:** Use `?pdf=demo.pdf&debug` to quickly test with debug panel open
- **Sharing:** Share debugging URLs with collaborators: `?url=https://example.com/problem.pdf&debug`
- **Development:** Iterate on cache tuning by adjusting parameters and refreshing
- **Troubleshooting:** Monitor memory usage and cache behavior in real-time
- **Performance Analysis:** Toggle features on/off to isolate performance issues

**CORS Proxy:**

Many PDF servers don't send CORS headers, blocking cross-origin requests. To load these PDFs, a CORS proxy is enabled by default (`CONFIG.CORS_PROXY` in index.html:34).

- **Enabled by default:** Uses `https://corsproxy.io/?`
- **Only applies to external URLs:** Local files and same-origin URLs bypass the proxy
- **To disable:** Set `CONFIG.CORS_PROXY: null` in the config
- **Alternative proxies:** `'https://api.allorigins.win/raw?url='`

Note: CORS proxies are third-party services - use with caution for sensitive documents.

## Discussion

**Features:**

This is a React-based web application that:

-   Uploads and displays PDF files in a rotating grid pattern
-   Drag-and-drop support for easy PDF loading
-   Dynamic page title showing current PDF filename
-   Local PDF persistence across refreshes (hybrid sessionStorage/IndexedDB with 7-day expiry)
-   Download button for saving PDFs locally
-   Auto-loads demo PDF for rapid development workflow
-   Uses PDF.js for PDF rendering
-   Uses OpenSeadragon for smooth pan/zoom viewing
-   Creates an N×N grid where N = number of pages
-   Each row rotates the pages in a pattern
-   Includes a tile-based rendering system with optimized FIFO caching
-   Modular architecture for easy feature additions
-   Responsive UI built with Tailwind CSS

**Key Technologies:**

-   React 18 (via CDN)
-   PDF.js 3.11.174
-   OpenSeadragon 4.1.0
-   Tailwind CSS
-   Babel standalone for JSX compilation


