# PDF Grid Viewer

A viewer that displays pages in a continuous rotating grid pattern, allowing patterns in the document to emerge.

**Live Demo**

https://ginger-pickles.github.io/PDF-grid/

## Usage

This is a standalone HTML file `index.html` that can be opened directly in a modern web browser.

**Quick Start:**
1. Visit the live demo URL or save the file locally and open in a web browser
2. Load a PDF using one of three methods:
   - **Upload:** Click "Upload PDF" and select a file
   - **URL:** Enter a URL in the text field and click "Load URL"
   - **Query parameter:** Add `?url=https://example.com/file.pdf` to the page URL
3. Use mouse to pan (drag) and zoom (scroll)

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

## Discussion

**Features:**

This is a React-based web application that:

-   Uploads and displays PDF files in a rotating grid pattern
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


