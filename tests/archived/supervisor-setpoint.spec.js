const { test, expect } = require('@playwright/test');

/**
 * Supervisor SETPOINT.md Loading Test
 *
 * This test ensures that supervisor.html correctly loads and displays
 * the content from SETPOINT.md file on disk, with no placeholder text.
 *
 * Requirements:
 * - SETPOINT.md must be fetched from disk on every page load (cache-busting)
 * - Description must match content from SETPOINT.md (not default placeholder)
 * - All YAML requirements must be parsed and displayed correctly
 * - Textarea must be populated with raw file content
 */
test('Supervisor loads and displays SETPOINT.md correctly', async ({ page }) => {
    const consoleLogs = [];
    let fetchResponse = null;
    let parsedDescription = null;
    let parsedYAML = null;

    // Capture all console messages
    page.on('console', msg => {
        const text = msg.text();
        consoleLogs.push({
            type: msg.type(),
            text: text
        });

        // Extract parsed values from console logs
        if (text.includes('[Supervisor] SETPOINT.md fetch response:')) {
            fetchResponse = text;
        }
        if (text.includes('[Supervisor] Parsed description:')) {
            parsedDescription = text.split('Parsed description:')[1].trim();
        }
        if (text.includes('[Supervisor] Parsed YAML content:')) {
            parsedYAML = text.split('Parsed YAML content:')[1].trim();
        }
    });

    // Navigate to supervisor.html
    await page.goto('http://localhost:8000/supervisor.html');

    // Wait for SETPOINT to load
    await page.waitForTimeout(2000);

    // ===== TEST 1: File fetch successful =====
    expect(fetchResponse, 'SETPOINT.md should be fetched successfully').toContain('200 OK');

    // ===== TEST 2: Description from file, not placeholder =====
    const setpointDescription = await page.locator('#setpointDescription').textContent();
    expect(setpointDescription, 'Description should be from SETPOINT.md file').toBe('SETPOINT');
    expect(setpointDescription, 'Description should NOT be placeholder text').not.toContain('Demo PDF loads successfully');

    // ===== TEST 3: Requirements parsed correctly =====
    const requirementsHTML = await page.locator('#setpointRequirements').innerHTML();

    // Check that all expected requirements are displayed
    expect(requirementsHTML).toContain('All Versions Load Successfully');
    expect(requirementsHTML).toContain('Console Errors Max');
    expect(requirementsHTML).toContain('Console Errors Warning');
    expect(requirementsHTML).toContain('Max Load Time Ms');
    expect(requirementsHTML).toContain('Warning Load Time Ms');
    expect(requirementsHTML).toContain('Performance Regression Percent');
    expect(requirementsHTML).toContain('No Regressions');

    // Check requirement values
    expect(requirementsHTML).toContain('15000'); // max_load_time_ms
    expect(requirementsHTML).toContain('8000');  // warning_load_time_ms
    expect(requirementsHTML).toContain('10');    // performance_regression_percent

    // ===== TEST 4: Textarea populated with raw content =====
    const textareaContent = await page.locator('#setpointTextarea').inputValue();
    expect(textareaContent, 'Textarea should contain file content').toContain('SETPOINT');
    expect(textareaContent, 'Textarea should contain YAML block').toContain('```yaml');
    expect(textareaContent, 'Textarea should contain requirements').toContain('all_versions_load_successfully');

    // ===== TEST 5: No console errors =====
    const errorLogs = consoleLogs.filter(log => log.type === 'error' && !log.text.includes('Error loading session data'));
    expect(errorLogs.length, 'Should have no console errors (except expected session data error)').toBe(0);

    // Print summary
    console.log('\n=== TEST SUMMARY ===');
    console.log(`✓ SETPOINT.md fetched successfully: ${fetchResponse}`);
    console.log(`✓ Description loaded from file: "${setpointDescription}"`);
    console.log(`✓ Parsed description: "${parsedDescription}"`);
    console.log(`✓ All 7 requirements displayed correctly`);
    console.log(`✓ Textarea populated with ${textareaContent.length} characters`);
    console.log(`✓ No unexpected console errors`);
});
