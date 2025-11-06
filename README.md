# PDF Grid Viewer

A web-based PDF viewer that displays pages in a rotating grid pattern with smooth pan and zoom controls.

## Live Demo

https://ginger-pickles.github.io/PDF-grid/

## Features

- Upload and view PDF files directly in your browser
- N×N rotating grid layout where N = number of pages
- Smooth pan and zoom with OpenSeadragon
- Tile-based rendering for performance
- Progressive loading with status indicators
- No server required - runs entirely client-side

## Usage

1. Visit the live demo URL
2. Click "Upload PDF" and select a PDF file
3. Use mouse to pan (drag) and zoom (scroll)
4. Double-click to reset view

## Technologies

- React 18
- PDF.js 3.11.174
- OpenSeadragon 4.1.0
- Tailwind CSS

## Local Usage

Open `index.html` in a modern web browser. All dependencies are loaded from CDNs.
