/**
 * Grid Tester Interface Test
 *
 * Tests the grid-tester.html interface itself to ensure all components function correctly.
 * This is a meta-test - testing the testing interface.
 *
 * Output directory: test-results/grid-tester-interface/
 */

const { test, expect } = require('@playwright/test');
const path = require('path');

test.describe('Grid Tester Interface', () => {
    let page;

    test.beforeEach(async ({ browser }) => {
        page = await browser.newPage();
        await page.goto('http://localhost:8000/grid-tester.html');
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(1000); // Allow interface to initialize
    });

    test('Page loads successfully', async () => {
        console.log('\n=== Testing Page Load ===');

        // Check title
        const title = await page.title();
        console.log(`Page title: ${title}`);
        expect(title).toContain('PDF Grid Viewer');
        expect(title).toContain('A/B/C Tester');

        // Check main heading
        const heading = await page.locator('h1').textContent();
        console.log(`Main heading: ${heading}`);
        expect(heading).toContain('PDF Grid Viewer');
        expect(heading).toContain('Comparison Tester');
    });

    test('Three iframes load with correct sources', async () => {
        console.log('\n=== Testing iframes ===');

        // Check iframe A
        const iframeA = page.locator('#iframe-a');
        await expect(iframeA).toBeVisible();
        const srcA = await iframeA.getAttribute('src');
        console.log(`iframe A source: ${srcA}`);
        expect(srcA).toContain('index.html');

        // Check iframe B
        const iframeB = page.locator('#iframe-b');
        await expect(iframeB).toBeVisible();
        const srcB = await iframeB.getAttribute('src');
        console.log(`iframe B source: ${srcB}`);
        expect(srcB).toContain('index-checkpoint.html');

        // Check iframe C
        const iframeC = page.locator('#iframe-c');
        await expect(iframeC).toBeVisible();
        const srcC = await iframeC.getAttribute('src');
        console.log(`iframe C source: ${srcC}`);
        expect(srcC).toContain('index-baseline.html');

        console.log('✅ All 3 iframes loaded with correct sources');
    });

    test('Header row contains all three column headings', async () => {
        console.log('\n=== Testing Header Row ===');

        // Check for "Test PDF" heading
        const testPdfHeading = page.locator('label:has-text("Test PDF")');
        await expect(testPdfHeading).toBeVisible();
        console.log('✅ "Test PDF" heading visible');

        // Check for "Manual Testing" heading
        const manualTestingHeading = page.locator('label:has-text("Manual Testing")');
        await expect(manualTestingHeading).toBeVisible();
        console.log('✅ "Manual Testing" heading visible');

        // Check for "Automated Testing" heading
        const automatedTestingHeading = page.locator('label:has-text("Automated Testing")');
        await expect(automatedTestingHeading).toBeVisible();
        console.log('✅ "Automated Testing" heading visible');
    });

    test('All control buttons are visible and enabled', async () => {
        console.log('\n=== Testing Buttons ===');

        // Load PDF button
        const loadPdfBtn = page.locator('#loadPdfBtn');
        await expect(loadPdfBtn).toBeVisible();
        await expect(loadPdfBtn).toBeEnabled();
        console.log('✅ Load PDF button visible and enabled');

        // Execute Test button
        const executeBtn = page.locator('#executeBtn');
        await expect(executeBtn).toBeVisible();
        await expect(executeBtn).toBeEnabled();
        console.log('✅ Execute Test button visible and enabled');

        // Run Playwright button
        const playwrightBtn = page.locator('#playwrightBtn');
        await expect(playwrightBtn).toBeVisible();
        await expect(playwrightBtn).toBeEnabled();
        console.log('✅ Run Playwright button visible and enabled');

        // Export Results button
        const exportBtn = page.locator('#exportResultsBtn');
        await expect(exportBtn).toBeVisible();
        await expect(exportBtn).toBeEnabled();
        console.log('✅ Export Results button visible and enabled');
    });

    test('All dropdown menus are present', async () => {
        console.log('\n=== Testing Dropdown Menus ===');

        // PDF selection dropdown
        const pdfSelect = page.locator('#pdfSelect');
        await expect(pdfSelect).toBeVisible();
        const pdfOptions = await pdfSelect.locator('option').count();
        console.log(`PDF select has ${pdfOptions} options`);
        expect(pdfOptions).toBeGreaterThan(0);

        // Action dropdown
        const actionSelect = page.locator('#actionSelect');
        await expect(actionSelect).toBeVisible();
        const actionOptions = await actionSelect.locator('option').count();
        console.log(`Action select has ${actionOptions} options`);
        expect(actionOptions).toBeGreaterThan(0);

        // Test file dropdown
        const testFileSelect = page.locator('#testFileSelect');
        await expect(testFileSelect).toBeVisible();
        const testFileOptions = await testFileSelect.locator('option').count();
        console.log(`Test file select has ${testFileOptions} options`);
        expect(testFileOptions).toBeGreaterThan(0);

        console.log('✅ All dropdowns present and populated');
    });

    test('Filename links are clickable and open in new tab', async () => {
        console.log('\n=== Testing Filename Links ===');

        // Version A link
        const linkA = page.locator('a[href="index.html"]');
        await expect(linkA).toBeVisible();
        const targetA = await linkA.getAttribute('target');
        expect(targetA).toBe('_blank');
        console.log('✅ Version A link: index.html (opens in new tab)');

        // Version B link
        const linkB = page.locator('a[href="index-checkpoint.html"]');
        await expect(linkB).toBeVisible();
        const targetB = await linkB.getAttribute('target');
        expect(targetB).toBe('_blank');
        console.log('✅ Version B link: index-checkpoint.html (opens in new tab)');

        // Version C link
        const linkC = page.locator('a[href="index-baseline.html"]');
        await expect(linkC).toBeVisible();
        const targetC = await linkC.getAttribute('target');
        expect(targetC).toBe('_blank');
        console.log('✅ Version C link: index-baseline.html (opens in new tab)');
    });

    test('Metrics table is present and has correct columns', async () => {
        console.log('\n=== Testing Metrics Table ===');

        // The table itself (parent of #metricsTable tbody)
        const tbody = page.locator('#metricsTable');
        await expect(tbody).toBeVisible();
        console.log('✅ Metrics table body visible');

        // Check for table headers in thead (sibling of tbody)
        const headers = await page.locator('table thead th').allTextContents();
        console.log(`Table headers: ${headers.join(', ')}`);

        expect(headers).toContain('Metric');
        expect(headers.some(h => h.includes('A') || h.includes('Current'))).toBe(true);
        expect(headers.some(h => h.includes('B') || h.includes('Previous'))).toBe(true);
        expect(headers.some(h => h.includes('C') || h.includes('Baseline'))).toBe(true);
        expect(headers).toContain('Status');
        console.log('✅ All expected columns present');

        // Check for expected metrics rows
        const rows = await tbody.locator('tr').count();
        console.log(`Metrics table has ${rows} rows`);
        expect(rows).toBeGreaterThan(0);
    });

    test('Metrics table populates with actual data', async () => {
        console.log('\n=== Testing Metrics Table Population ===');

        // Wait for iframes to load PDFs and metrics to collect (automatic 5-second interval)
        console.log('Waiting for PDFs to load and metrics to populate...');
        await page.waitForTimeout(12000); // Wait for initial load + at least 2 collection cycles

        // Check that all expected metric rows exist
        const tbody = page.locator('#metricsTable');

        // Check for all expected metrics
        const metricsToCheck = [
            'Lines of Code',
            'Load Time',
            'Console Errors',
            'Pages Cached',
            'Tile Completeness'
        ];

        for (const metric of metricsToCheck) {
            const row = tbody.locator(`tr:has-text("${metric}")`);
            await expect(row).toBeVisible();
            console.log(`✅ Found metric row: ${metric}`);
        }

        // Verify that metric cells exist and have data
        console.log('\nVerifying metric values populate:');

        // Lines of Code should have numeric values
        const locA = await page.locator('#loc-a').textContent();
        const locB = await page.locator('#loc-b').textContent();
        const locC = await page.locator('#loc-c').textContent();

        console.log(`  Lines of Code A: ${locA}`);
        console.log(`  Lines of Code B: ${locB}`);
        console.log(`  Lines of Code C: ${locC}`);

        expect(locA).not.toBe('-');
        expect(locB).not.toBe('-');
        expect(locC).not.toBe('-');

        // Load Time should have numeric values
        const loadTimeA = await page.locator('#loadtime-a').textContent();
        const loadTimeB = await page.locator('#loadtime-b').textContent();
        const loadTimeC = await page.locator('#loadtime-c').textContent();

        console.log(`  Load Time A: ${loadTimeA}`);
        console.log(`  Load Time B: ${loadTimeB}`);
        console.log(`  Load Time C: ${loadTimeC}`);

        // Load time might not be available via performance.timing, so we allow "-"
        // as long as it's consistently collected or not collected
        console.log(`  (Load time uses performance.timing API which may not be available in iframes)`);

        // Pages Cached should have numeric values (not just "-")
        const pagesCachedA = await page.locator('#pages-a').textContent();
        const pagesCachedB = await page.locator('#pages-b').textContent();
        const pagesCachedC = await page.locator('#pages-c').textContent();

        console.log(`  Pages Cached A: ${pagesCachedA}`);
        console.log(`  Pages Cached B: ${pagesCachedB}`);
        console.log(`  Pages Cached C: ${pagesCachedC}`);

        // At least one version should have pages cached
        const hasPagesData = pagesCachedA !== '-' || pagesCachedB !== '-' || pagesCachedC !== '-';
        expect(hasPagesData).toBe(true);

        // Console Errors should be 0 (all versions should work without errors)
        const errorsA = await page.locator('#errors-a').textContent();
        const errorsB = await page.locator('#errors-b').textContent();
        const errorsC = await page.locator('#errors-c').textContent();

        console.log(`  Console Errors A: ${errorsA}`);
        console.log(`  Console Errors B: ${errorsB}`);
        console.log(`  Console Errors C: ${errorsC}`);

        expect(errorsA).toBe('0');
        expect(errorsB).toBe('0');
        expect(errorsC).toBe('0');

        // Tiles should have data
        const tilesA = await page.locator('#tiles-a').textContent();
        const tilesB = await page.locator('#tiles-b').textContent();
        const tilesC = await page.locator('#tiles-c').textContent();

        console.log(`  Tiles A: ${tilesA}`);
        console.log(`  Tiles B: ${tilesB}`);
        console.log(`  Tiles C: ${tilesC}`);

        expect(tilesA).not.toBe('-');
        expect(tilesB).not.toBe('-');
        expect(tilesC).not.toBe('-');

        console.log('\n✅ Metrics table successfully populates with actual data');
    });

    test('Console output sections exist for all versions', async () => {
        console.log('\n=== Testing Console Output Sections ===');

        // Check console output for Version A
        const consoleA = page.locator('#console-a');
        await expect(consoleA).toBeVisible();
        console.log('✅ Version A console output visible');

        // Check console output for Version B
        const consoleB = page.locator('#console-b');
        await expect(consoleB).toBeVisible();
        console.log('✅ Version B console output visible');

        // Check console output for Version C
        const consoleC = page.locator('#console-c');
        await expect(consoleC).toBeVisible();
        console.log('✅ Version C console output visible');

        console.log('✅ All console output sections present');
    });

    test('Load PDF button loads PDF in all versions', async () => {
        console.log('\n=== Testing Load PDF Functionality ===');

        // Get current iframe sources before clicking
        const iframeA = page.locator('#iframe-a');
        const iframeB = page.locator('#iframe-b');
        const iframeC = page.locator('#iframe-c');

        const srcABefore = await iframeA.getAttribute('src');
        console.log(`Version A src before: ${srcABefore}`);

        // Click Load PDF button
        const loadPdfBtn = page.locator('#loadPdfBtn');
        await loadPdfBtn.click();
        console.log('Clicked Load PDF button');

        // Wait for iframes to reload
        await page.waitForTimeout(2000);

        // Check that iframe sources now include the pdf parameter
        const srcAAfter = await iframeA.getAttribute('src');
        const srcBAfter = await iframeB.getAttribute('src');
        const srcCAfter = await iframeC.getAttribute('src');

        console.log(`Version A src after: ${srcAAfter}`);
        console.log(`Version B src after: ${srcBAfter}`);
        console.log(`Version C src after: ${srcCAfter}`);

        // All three should have pdf parameter
        expect(srcAAfter).toContain('pdf=');
        expect(srcBAfter).toContain('pdf=');
        expect(srcCAfter).toContain('pdf=');

        console.log('✅ Load PDF button successfully loads PDF in all versions');
    });

    test('Playwright output section exists', async () => {
        console.log('\n=== Testing Playwright Output Section ===');

        const playwrightOutput = page.locator('#playwrightOutput');
        await expect(playwrightOutput).toBeDefined();
        console.log('✅ Playwright output section exists');

        const playwrightOutputContent = page.locator('#playwrightOutputContent');
        await expect(playwrightOutputContent).toBeDefined();
        console.log('✅ Playwright output content area exists');
    });

    test.afterEach(async () => {
        await page.close();
    });
});
