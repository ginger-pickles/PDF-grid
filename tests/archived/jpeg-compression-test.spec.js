/**
 * JPEG Compression Diagnostic Test
 * Tests if JPEG compression is working and tiles are rendering
 */

const { test, expect } = require('@playwright/test');

test.describe('JPEG Compression Test', () => {
  test('JPEG compression works and tiles render', async ({ page }) => {
    // Enable console logging
    page.on('console', msg => {
      if (msg.type() === 'error' || msg.text().includes('JPEG') || msg.text().includes('RENDERED')) {
        console.log(`[${msg.type()}]`, msg.text());
      }
    });

    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));

    // Load test-pattern.pdf
    await page.goto('http://localhost:8000?pdf=demo/test-pattern.pdf');

    // Wait for PDF to load
    await page.waitForFunction(() =>
      window.pdfDoc && window.pdfDoc.numPages > 0,
      { timeout: 15000 }
    );

    console.log('PDF loaded');

    // Wait for viewer to initialize
    await page.waitForFunction(() => window.viewerReady === true, { timeout: 15000 });
    console.log('Viewer ready');

    // Wait a bit for initial rendering
    await page.waitForTimeout(3000);

    // Check rendering stats
    const stats = await page.evaluate(() => {
      const ts = window.tileSource;
      if (!ts) return null;

      return {
        numPages: window.pdfDoc?.numPages || 0,
        lowResCached: ts.pageStreamer?.lowResPageCache?.size || 0,
        highResCached: ts.pageStreamer?.highResPageCache?.size || 0,
        tilesCached: ts.cacheManager?.tileCache?.cache?.size || 0,
        decodedImages: ts.pageStreamer?.decodedImageCache?.size || 0,
      };
    });

    console.log('Stats:', JSON.stringify(stats, null, 2));

    // Verify pages are cached
    expect(stats.lowResCached).toBeGreaterThan(0);
    console.log(`✓ Low-res pages cached: ${stats.lowResCached}`);

    // Verify decoded images exist
    expect(stats.decodedImages).toBeGreaterThan(0);
    console.log(`✓ Decoded images cached: ${stats.decodedImages}`);

    // Verify tiles are cached
    expect(stats.tilesCached).toBeGreaterThan(0);
    console.log(`✓ Tiles cached: ${stats.tilesCached}`);

    // Check if JPEG compression happened
    const jpegCheck = await page.evaluate(() => {
      const ts = window.tileSource;
      if (!ts?.pageStreamer) return { error: 'No pageStreamer' };

      // Get a cached page
      const cache = ts.pageStreamer.lowResPageCache;
      const keys = Array.from(cache.cache?.keys() || []);
      if (keys.length === 0) return { error: 'No cached pages' };

      const firstKey = keys[0];
      const dataUrl = cache.get(firstKey);

      return {
        hasDataUrl: !!dataUrl,
        isJpeg: dataUrl?.startsWith('data:image/jpeg'),
        sizeKB: dataUrl ? Math.round(dataUrl.length / 1024) : 0,
      };
    });

    console.log('JPEG check:', JSON.stringify(jpegCheck, null, 2));

    expect(jpegCheck.isJpeg).toBe(true);
    console.log(`✓ Pages stored as JPEG (${jpegCheck.sizeKB}KB)`);

    console.log('\n✅ All JPEG compression tests passed!');
  });
});
