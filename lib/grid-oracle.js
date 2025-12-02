/**
 * Grid Oracle - Pure geometry calculations for PDF grid viewer
 *
 * No dependencies on OSD, canvas, or pdf.js.
 * Works in both Node.js (tests) and browser (app).
 *
 * Usage:
 *   Browser: <script src="lib/grid-oracle.js"></script> then window.GridOracle
 *   Node.js: const GridOracle = require('./lib/grid-oracle.js');
 */

(function(exports) {
  'use strict';

  const GridOracle = {
    /**
     * Generate triangular stagger pattern for N pages
     * @param {number} numPages - Total number of pages
     * @returns {number[][]} 2D array where pattern[row][col] = pageNum (0 for empty)
     */
    generatePattern(numPages) {
      if (numPages === 0) return [[0]];
      if (numPages === 1) return [[1]];
      if (numPages === 2) return [[1, 0, 0], [0, 2, 0]];

      // Calculate grid size for triangular number
      let gridSize = 1;
      while ((gridSize * (gridSize + 1)) / 2 < numPages) {
        gridSize++;
      }

      const pattern = [];
      let pageNum = 1;

      for (let row = 0; row < gridSize; row++) {
        const rowData = [];
        const pagesInRow = row + 1;
        const leadingBlanks = gridSize - pagesInRow;

        for (let col = 0; col < gridSize; col++) {
          if (col < leadingBlanks || col >= leadingBlanks + pagesInRow) {
            rowData.push(0);
          } else if (pageNum <= numPages) {
            rowData.push(pageNum++);
          } else {
            rowData.push(0);
          }
        }
        pattern.push(rowData);
      }

      return pattern;
    },

    /**
     * Calculate grid dimensions from page dimensions and pattern
     * @param {number} numPages - Total pages
     * @param {number} pageWidth - Single page width in pixels
     * @param {number} pageHeight - Single page height in pixels
     * @param {number[][]} pattern - Grid pattern (optional, generated if not provided)
     * @param {number} spacingRatio - Spacing as ratio of page width (default 0.05)
     * @returns {Object} gridDims
     */
    calculateDimensions(numPages, pageWidth, pageHeight, pattern = null, spacingRatio = 0.05) {
      if (!pattern) {
        pattern = this.generatePattern(numPages);
      }

      const spacing = Math.floor(pageWidth * spacingRatio);
      const gridRows = pattern.length;
      const gridCols = pattern[0].length;
      const cellWidth = pageWidth + spacing;
      const cellHeight = pageHeight + spacing;
      const totalWidth = gridCols * cellWidth;
      const totalHeight = gridRows * cellHeight;

      return {
        gridRows,
        gridCols,
        spacing,
        totalWidth,
        totalHeight,
        pageWidth,
        pageHeight,
        cellWidth,
        cellHeight
      };
    },

    /**
     * Get page position in grid coordinates
     * @param {number} row - Row index
     * @param {number} col - Column index
     * @param {Object} gridDims - Grid dimensions
     * @returns {Object} {left, top, right, bottom} in grid coordinates
     */
    getPageBounds(row, col, gridDims) {
      const { pageWidth, pageHeight, spacing } = gridDims;
      const halfSpacing = spacing / 2;
      const left = col * (pageWidth + spacing) + halfSpacing;
      const top = row * (pageHeight + spacing) + halfSpacing;
      return {
        left,
        top,
        right: left + pageWidth,
        bottom: top + pageHeight
      };
    },

    /**
     * Find all pages that intersect with a viewport bounds
     * @param {Object} viewBounds - {left, top, right, bottom} in grid coordinates
     * @param {Object} gridDims - Grid dimensions
     * @param {number[][]} pattern - Grid pattern
     * @returns {number[]} Array of page numbers that intersect viewport
     */
    getPagesInBounds(viewBounds, gridDims, pattern) {
      const { left: viewLeft, top: viewTop, right: viewRight, bottom: viewBottom } = viewBounds;
      const pages = [];

      for (let row = 0; row < gridDims.gridRows; row++) {
        for (let col = 0; col < gridDims.gridCols; col++) {
          const pageNum = pattern[row][col];
          if (pageNum === 0) continue;

          const pageBounds = this.getPageBounds(row, col, gridDims);

          // Check intersection
          if (pageBounds.right > viewLeft && pageBounds.left < viewRight &&
              pageBounds.bottom > viewTop && pageBounds.top < viewBottom) {
            if (!pages.includes(pageNum)) {
              pages.push(pageNum);
            }
          }
        }
      }

      return pages.sort((a, b) => a - b);
    },

    /**
     * Convert OSD viewport bounds to grid coordinates
     * OSD uses normalized coordinates where width=1
     * @param {Object} osdBounds - {x, y, width, height} from viewport.getBounds()
     * @param {Object} gridDims - Grid dimensions
     * @returns {Object} {left, top, right, bottom} in grid coordinates
     */
    osdBoundsToGrid(osdBounds, gridDims) {
      const scale = gridDims.totalWidth; // OSD normalizes to width=1
      return {
        left: osdBounds.x * scale,
        top: osdBounds.y * scale,
        right: (osdBounds.x + osdBounds.width) * scale,
        bottom: (osdBounds.y + osdBounds.height) * scale
      };
    },

    /**
     * Calculate initial viewport bounds (centered on page 1)
     * @param {Object} gridDims - Grid dimensions
     * @param {number[][]} pattern - Grid pattern
     * @param {number} viewportWidth - Browser viewport width
     * @param {number} viewportHeight - Browser viewport height
     * @returns {Object} {left, top, right, bottom} in grid coordinates
     */
    getInitialViewBounds(gridDims, pattern, viewportWidth, viewportHeight) {
      // Find page 1 position
      let page1Row = 0, page1Col = 0;
      for (let row = 0; row < gridDims.gridRows; row++) {
        for (let col = 0; col < gridDims.gridCols; col++) {
          if (pattern[row][col] === 1) {
            page1Row = row;
            page1Col = col;
            break;
          }
        }
      }

      const page1Bounds = this.getPageBounds(page1Row, page1Col, gridDims);
      const page1CenterX = (page1Bounds.left + page1Bounds.right) / 2;
      const page1CenterY = (page1Bounds.top + page1Bounds.bottom) / 2;

      // OSD fits page to viewport - calculate effective view dimensions
      // Initial zoom shows ~1 page width, aspect ratio matches viewport
      const aspectRatio = viewportHeight / viewportWidth;
      const viewWidth = gridDims.pageWidth * 1.2; // Slight margin around page
      const viewHeight = viewWidth * aspectRatio;

      return {
        left: page1CenterX - viewWidth / 2,
        top: page1CenterY - viewHeight / 2,
        right: page1CenterX + viewWidth / 2,
        bottom: page1CenterY + viewHeight / 2
      };
    },

    /**
     * Get expected visible pages for initial view
     * @param {number} numPages - Total pages
     * @param {number} pageWidth - Page width
     * @param {number} pageHeight - Page height
     * @param {number} viewportWidth - Browser viewport width
     * @param {number} viewportHeight - Browser viewport height
     * @returns {Object} {pages: number[], viewBounds: Object, gridDims: Object, pattern: number[][]}
     */
    getExpectedInitialPages(numPages, pageWidth, pageHeight, viewportWidth, viewportHeight) {
      const pattern = this.generatePattern(numPages);
      const gridDims = this.calculateDimensions(numPages, pageWidth, pageHeight, pattern);
      const viewBounds = this.getInitialViewBounds(gridDims, pattern, viewportWidth, viewportHeight);
      const pages = this.getPagesInBounds(viewBounds, gridDims, pattern);

      return {
        pages,
        viewBounds,
        gridDims,
        pattern
      };
    },

    /**
     * Generate a simple reference image showing expected page positions
     * Returns SVG string that can be rendered or compared
     * @param {Object} gridDims - Grid dimensions
     * @param {number[][]} pattern - Grid pattern
     * @param {Object} viewBounds - View bounds (optional, shows all if omitted)
     * @param {number[]} highlightPages - Pages to highlight (optional)
     * @returns {string} SVG markup
     */
    generateReferenceSVG(gridDims, pattern, viewBounds = null, highlightPages = null) {
      const { totalWidth, totalHeight, pageWidth, pageHeight, spacing, gridRows, gridCols } = gridDims;

      // If viewBounds provided, use it; otherwise show full grid
      const vb = viewBounds || { left: 0, top: 0, right: totalWidth, bottom: totalHeight };
      const width = vb.right - vb.left;
      const height = vb.bottom - vb.top;

      let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.left} ${vb.top} ${width} ${height}" width="100%" height="100%">`;
      svg += `<rect x="${vb.left}" y="${vb.top}" width="${width}" height="${height}" fill="#1a1a2e"/>`;

      // Draw pages
      for (let row = 0; row < gridRows; row++) {
        for (let col = 0; col < gridCols; col++) {
          const pageNum = pattern[row][col];
          if (pageNum === 0) continue;

          const bounds = this.getPageBounds(row, col, gridDims);
          const isHighlighted = highlightPages && highlightPages.includes(pageNum);
          const fill = isHighlighted ? '#4a90d9' : '#3a3a5a';
          const stroke = isHighlighted ? '#6ab0ff' : '#5a5a7a';

          svg += `<rect x="${bounds.left}" y="${bounds.top}" width="${pageWidth}" height="${pageHeight}" `;
          svg += `fill="${fill}" stroke="${stroke}" stroke-width="${spacing/4}"/>`;

          // Page number label
          const fontSize = Math.min(pageWidth, pageHeight) * 0.3;
          const cx = (bounds.left + bounds.right) / 2;
          const cy = (bounds.top + bounds.bottom) / 2;
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="middle" `;
          svg += `font-size="${fontSize}" fill="white" font-family="sans-serif">${pageNum}</text>`;
        }
      }

      // Draw viewport outline if provided
      if (viewBounds) {
        svg += `<rect x="${viewBounds.left}" y="${viewBounds.top}" `;
        svg += `width="${viewBounds.right - viewBounds.left}" height="${viewBounds.bottom - viewBounds.top}" `;
        svg += `fill="none" stroke="#ff6b6b" stroke-width="${spacing/2}" stroke-dasharray="${spacing}"/>`;
      }

      svg += '</svg>';
      return svg;
    }
  };

  // Export for both Node.js and browser
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = GridOracle;
  } else {
    exports.GridOracle = GridOracle;
  }

})(typeof window !== 'undefined' ? window : this);
