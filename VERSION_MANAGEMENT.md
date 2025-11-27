# Version Management

## Version Synchronization

**IMPORTANT:** The version number in `CONFIG.VERSION` (in index.html) must be kept in sync with git tags.

### Current Process

1. **Before creating a new release:**
   - Update `CONFIG.VERSION` in index.html to match the intended tag (e.g., '1.5.3')
   - Commit the version change
   - Create annotated git tag: `git tag -a v1.5.3 -m "Release message"`
   - Push tag: `git push origin v1.5.3`

2. **Version appears in:**
   - Console logs: `[v1.5.3] Loaded filename.pdf with X pages`
   - Help overlay title: "PDF Grid Viewer v1.5.3"

### Known Issues

- v1.5.2 tag exists but CONFIG.VERSION was not updated (still shows 1.5.1)
- This creates confusion about which version is actually running
- **Solution:** Always update CONFIG.VERSION in the same commit that gets tagged

### Automation Ideas (Future)

1. **Build-time injection:**
   - Use a build tool to inject git tag into CONFIG.VERSION
   - Requires build step (webpack, vite, etc.)
   - Single source of truth: git tags

2. **Runtime git query:**
   - Use GitHub API to fetch latest tag
   - Requires network request
   - Not suitable for offline use

3. **Pre-commit hook:**
   - Check if CONFIG.VERSION matches latest tag
   - Warn if mismatch detected
   - Prevents forgetting to update

For now, **manual synchronization** with clear comments in the code is the best approach.

---

## URL-Loaded PDF Caching Decision

### Context

In v1.6.9, URL-loaded PDFs were cached to local storage for faster refresh. This was reverted in v1.5.3.

### Current Behavior (v1.5.3)

- Local PDFs (file uploads): Cached in IndexedDB
- URL PDFs: NOT cached, URL remembered in browser history
- Refreshing with ?url= parameter re-fetches from network

### Reasoning

1. **URL persistence is sufficient:**
   - Browser history maintains ?url= parameter
   - Refresh re-loads from original source
   - Ensures user always sees latest version

2. **Storage concerns:**
   - Large PDFs from URLs can quickly fill storage
   - User didn't explicitly choose to store it locally
   - Unlike file uploads where storage is expected

3. **Cache invalidation:**
   - If source PDF updates, cached version would be stale
   - No mechanism to detect upstream changes
   - Re-fetching is safer default behavior

### Reconsideration Points

**Reasons to add URL caching:**
1. Offline access to previously viewed URLs
2. Faster refresh for large PDFs
3. Reduced bandwidth for repeated views
4. Better experience on slow connections

**Implementation if reconsidered:**
```javascript
// Option A: Explicit "Save for offline" button
// User opts-in to caching URL-loaded PDFs

// Option B: Cache with TTL (time-to-live)
// Auto-expire after N hours/days
// Configurable in CONFIG

// Option C: Smart caching
// Cache only if PDF is large (>1MB)
// Or only if loaded more than once
```

**Cache management if implemented:**
- Add UI to view cached URLs
- Add "Clear URL cache" button
- Show cache size/usage
- Respect storage quotas

### Decision Log

- **v1.6.9:** Added URL caching for performance
- **v1.5.3:** Removed URL caching (conservative approach)
- **Future:** Reconsider with user-controlled caching (opt-in)

### Related Code Locations

- `index.html:~1578` - `loadPDFFromURL()` - Clears storage when loading from URL
- `index.html:~1355` - Auto-load priority logic
- `index.html:~500-588` - PDFStorage module

### Notes for Future Discussion

**Questions to consider:**
1. Should URL caching be opt-in or opt-out?
2. What's reasonable TTL for URL-cached PDFs?
3. How to communicate cache status to user?
4. Should cache respect HTTP cache headers?
5. What about authentication-protected PDFs?

**User research needed:**
- How often do users re-visit same URL PDFs?
- Are URL PDFs typically static or dynamic?
- What's the typical PDF size from URLs?
- Do users expect offline access?
