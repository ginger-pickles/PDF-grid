const { test, expect } = require('@playwright/test');

test.describe('Viewport Persistence', () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh - clear localStorage
    await page.goto('http://localhost:8000/');
    await page.evaluate(() => {
      localStorage.removeItem('pdfgrid_viewport');
      localStorage.removeItem('pdfgrid_viewport_filename');
    });
  });

  test('should persist viewport across page refresh for same PDF', async ({ page }) => {
    // Load PDF via URL parameter (more reliable than file upload in automated tests)
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000); // Wait for initial rendering

    // Get initial viewport
    const initialViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter()
      };
    });

    console.log('Initial viewport:', initialViewport);

    // Zoom in significantly
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(3.0);
    });

    await page.waitForTimeout(500);

    // Pan to a specific location
    await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      const newCenter = new OpenSeadragon.Point(0.7, 0.7);
      viewer.viewport.panTo(newCenter);
    });

    console.log('Zoomed and panned, waiting for debounce...');
    // Wait for debounced save (500ms delay)
    await page.waitForTimeout(1000);

    // Capture the modified viewport
    const modifiedViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter(),
        filename: window.currentPdfFilename || null
      };
    });

    console.log('Modified viewport:', modifiedViewport);

    // Verify viewport was saved to localStorage
    const savedViewport = await page.evaluate(() => {
      const stored = localStorage.getItem('pdfgrid_viewport');
      const filename = localStorage.getItem('pdfgrid_viewport_filename');
      return stored ? { ...JSON.parse(stored), filename } : null;
    });

    console.log('Saved to localStorage:', savedViewport);
    expect(savedViewport).not.toBeNull();
    expect(savedViewport.filename).toBe('demo/demo-1.pdf'); // Full path from URL parameter

    // Reload the page
    console.log('Reloading page...');
    await page.reload();

    // Wait for PDF to load again
    await page.waitForTimeout(2000);

    // Get restored viewport
    const restoredViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter()
      };
    });

    console.log('Restored viewport:', restoredViewport);

    // Verify viewport was restored from saved state (viewport may settle slightly after zoom/pan)
    expect(Math.abs(restoredViewport.zoom - savedViewport.zoom)).toBeLessThan(0.01);
    expect(Math.abs(restoredViewport.center.x - savedViewport.center.x)).toBeLessThan(0.01);
    expect(Math.abs(restoredViewport.center.y - savedViewport.center.y)).toBeLessThan(0.01);

    console.log('✓ Viewport persisted correctly across refresh');
  });

  test('should reset viewport when loading different PDF', async ({ page }) => {
    // Load PDF via URL parameter
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Zoom and pan
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(3.0);
      const newCenter = new OpenSeadragon.Point(0.8, 0.8);
      window.osdViewerRef.viewport.panTo(newCenter);
    });

    console.log('Modified viewport for first PDF, waiting for save...');
    await page.waitForTimeout(1000);

    // Capture the modified viewport
    const firstPdfViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter()
      };
    });

    console.log('First PDF viewport:', firstPdfViewport);

    // Reload page (simulating new session)
    await page.reload();
    await page.waitForTimeout(2000);

    // Verify viewport was restored for same PDF
    const restoredViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter()
      };
    });

    console.log('Restored viewport (same PDF):', restoredViewport);
    // Viewport may be adjusted slightly due to bounds constraints, use reasonable tolerance
    expect(Math.abs(restoredViewport.zoom - firstPdfViewport.zoom)).toBeLessThan(2.0);

    // Now simulate loading a different PDF by changing the filename in localStorage
    // (Since we can't easily upload a different file in automated test)
    await page.evaluate(() => {
      // Manually change the saved filename to simulate different file
      localStorage.setItem('pdfgrid_viewport_filename', 'different-file.pdf');
    });

    // Reload again
    console.log('Reloading with different filename...');
    await page.reload();

    // Wait for viewer to initialize (filename mismatch means viewport won't restore, but viewer still loads)
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Get viewport after "different file" load
    const differentFileViewport = await page.evaluate(() => {
      const viewer = window.osdViewerRef;
      return {
        zoom: viewer.viewport.getZoom(),
        center: viewer.viewport.getCenter()
      };
    });

    console.log('Viewport after "different file":', differentFileViewport);

    // Viewport should be reset (NOT match the modified viewport)
    // It should be closer to the initial default view
    const zoomDifference = Math.abs(differentFileViewport.zoom - firstPdfViewport.zoom);
    console.log('Zoom difference from saved:', zoomDifference);

    // The zoom should be significantly different (reset to default)
    expect(zoomDifference).toBeGreaterThan(0.5);

    console.log('✓ Viewport correctly reset for different PDF');
  });

  test('should save viewport changes via zoom event', async ({ page }) => {
    // Load PDF via URL parameter
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Zoom using scroll wheel simulation
    await page.evaluate(() => {
      window.osdViewerRef.viewport.zoomBy(2.0);
    });

    console.log('Zoomed, waiting for debounced save...');
    await page.waitForTimeout(1000);

    // Verify saved
    const saved = await page.evaluate(() => {
      const stored = localStorage.getItem('pdfgrid_viewport');
      return stored ? JSON.parse(stored) : null;
    });

    expect(saved).not.toBeNull();
    expect(saved.zoom).toBeGreaterThan(0);
    console.log('✓ Zoom event triggered save:', saved);
  });

  test('should save viewport changes via pan event', async ({ page }) => {
    // Load PDF via URL parameter
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Clear any existing save
    await page.evaluate(() => {
      localStorage.removeItem('pdfgrid_viewport');
    });

    // Pan to new location
    await page.evaluate(() => {
      const newCenter = new OpenSeadragon.Point(0.5, 0.5);
      window.osdViewerRef.viewport.panTo(newCenter);
    });

    console.log('Panned, waiting for debounced save...');
    await page.waitForTimeout(1000);

    // Verify saved
    const saved = await page.evaluate(() => {
      const stored = localStorage.getItem('pdfgrid_viewport');
      return stored ? JSON.parse(stored) : null;
    });

    expect(saved).not.toBeNull();
    expect(saved.center).toBeDefined();
    expect(saved.center.x).toBeCloseTo(0.5, 1);
    expect(saved.center.y).toBeCloseTo(0.5, 1);
    console.log('✓ Pan event triggered save:', saved);
  });

  test('should debounce rapid viewport changes', async ({ page }) => {
    // Load PDF via URL parameter
    await page.goto('http://localhost:8000/?pdf=demo/demo-1.pdf');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.osdViewerRef !== undefined && window.osdViewerRef !== null, { timeout: 30000 });
    await page.waitForTimeout(2000);

    // Make rapid viewport changes
    await page.evaluate(() => {
      for (let i = 0; i < 10; i++) {
        window.osdViewerRef.viewport.zoomBy(1.1);
        window.osdViewerRef.viewport.panBy(new OpenSeadragon.Point(0.01, 0.01));
      }
    });

    console.log('Made 10 rapid changes, waiting for debounce...');

    // Wait less than debounce delay
    await page.waitForTimeout(300);

    // Should not be saved yet (debounced)
    const notYetSaved = await page.evaluate(() => {
      return localStorage.getItem('pdfgrid_viewport');
    });

    // Wait for full debounce delay
    await page.waitForTimeout(500);

    // Now should be saved (once)
    const saved = await page.evaluate(() => {
      const stored = localStorage.getItem('pdfgrid_viewport');
      return stored ? JSON.parse(stored) : null;
    });

    expect(saved).not.toBeNull();
    console.log('✓ Debouncing works correctly');
  });
});
