# PDF Grid Viewer with Deep Zoom

A dynamic streaming viewer that displays PDF pages in a continuous rotating grid pattern with infinite zoom capabilities, allowing you to explore document structure and details.

**Live Demo**

https://ginger-pickles.github.io/PDF-grid/

🔍 **Features:**
- 📄 Upload any PDF via drag & drop or file picker
- 🔄 Rotating grid layout - pages advance horizontally and vertically
- ♾️ Infinite deep zoom - examine fine details at any magnification
- 💾 Dynamic tile streaming - constant low memory usage
- 🚀 Smooth 60 FPS panning and zooming
- 📱 Mobile support with touch gestures

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

**CORS Proxy:**

Many PDF servers don't send CORS headers, blocking cross-origin requests. To load these PDFs, a CORS proxy is enabled by default (`CONFIG.CORS_PROXY` in index.html:34).

- **Enabled by default:** Uses `https://corsproxy.io/?`
- **Only applies to external URLs:** Local files and same-origin URLs bypass the proxy
- **To disable:** Set `CONFIG.CORS_PROXY: null` in the config
- **Alternative proxies:** `'https://api.allorigins.win/raw?url='`

Note: CORS proxies are third-party services - use with caution for sensitive documents.

## How It Works - Dynamic Streaming Architecture

This viewer combines PDF rendering with deep zoom technology for arbitrarily large documents:

**PDF Processing Pipeline:**
```
PDF Upload → PDF.js Rendering → Canvas → Dynamic Tile Generation → OpenSeadragon Viewer
```

1. **PDF Upload**: User uploads any PDF file (drag & drop, file picker, or URL)

2. **Grid Layout**: Pages arranged in rotating N×N grid where:
   - Horizontal movement advances through pages (like reading)
   - Vertical movement also advances through pages (orthogonal)
   - Creates a 2D continuous space from 1D page sequence

3. **Dynamic Rendering**: PDF.js renders each page to canvas at full resolution

4. **Tile Streaming**: Custom tile source generates 256×256 tiles on-demand:
   - Tiles created from canvas as needed for current viewport
   - FIFO cache stores recently accessed tiles
   - Multi-level pyramid supports infinite zoom

5. **Memory Efficiency**: Constant ~100-200MB usage regardless of PDF size
   - Only visible tiles kept in memory
   - Can handle 100+ page documents smoothly
   - 60 FPS panning and zooming

**Key Features:**

-   **Deep Zoom**: Infinite magnification limited only by PDF resolution
-   **Dynamic Streaming**: Tiles generated client-side, no server required
-   **Rotating Grid**: Unique visualization showing document structure
-   **Local Persistence**: PDFs cached for 7 days (sessionStorage/IndexedDB)
-   **Auto-load**: Place `demo.pdf` in same directory for rapid testing
-   **URL Loading**: Load PDFs from any URL with CORS proxy support
-   **Download**: Save loaded PDFs locally
-   **Responsive UI**: Mobile-friendly with touch gestures

**Technologies:**

-   React 18 (via CDN) - UI framework
-   PDF.js 3.11.174 - PDF rendering and parsing
-   OpenSeadragon 4.1.0 - Deep zoom viewer with tiling
-   Tailwind CSS - Responsive design
-   Babel standalone - JSX compilation

## Additional Demos

See also:
- `deepzoom-static.html` - Static pre-generated image tiles demo
- `deepzoom.html` - Dynamic image streaming with IIPImage server
- `DEEPZOOM_README.md` - Complete documentation on deep zoom technology
- `DEEPZOOM_GUIDE.md` - Implementation guide for creating your own


