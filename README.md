# PDF Grid Viewer

A viewer that displays pages in a continuous rotating grid pattern, allowing patterns in the document to emerge.

**Live Demo**

https://ginger-pickles.github.io/PDF-grid/

## Usage

This is a standalone HTML file `index.html` that can be opened directly in a modern web browser.

1. Visit the live demo URL or save the file locally and open in a web browser
2. Click "Upload PDF" and select a PDF file
3. Use mouse to pan (drag) and zoom (scroll)

## Discussion

**Features:**

This is a React-based web application that:

-   Uploads and displays PDF files in a rotating grid pattern
-   Uses PDF.js for PDF rendering
-   Uses OpenSeadragon for smooth pan/zoom viewing
-   Creates an N×N grid where N = number of pages
-   Each row rotates the pages in a pattern
-   Includes a tile-based rendering system with caching
-   Responsive UI built with Tailwind CSS

**Key Technologies:**

-   React 18 (via CDN)
-   PDF.js 3.11.174
-   OpenSeadragon 4.1.0
-   Tailwind CSS
-   Babel standalone for JSX compilation


