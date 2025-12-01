# Development Vectors

Future optimization ideas for PDF Grid Viewer.

---


THE NEXT THING:
Now that we have asychronous tile request & generation, we can implement progressive page rendering & tile generation. We should re-publish tiles as pages are completed.





## Scalability Ideas

**Scattered rendering order** - Render pages in bit-reversal order for progressive minimap appearance instead of sequential.

**Web Worker rendering** - Offload page rendering to Web Workers for parallel multi-core processing. Requires OffscreenCanvas.

**IndexedDB persistence** - Cache rendered pages to IndexedDB for instant refresh across sessions. Capacity: ~50MB mobile, ~500MB desktop.

**Lazy L0 tiles** - Generate minimap tiles on-demand using PDF.js thumbnail extraction (0.1x scale) instead of pre-rendering.

---

## Anti-Bloat Discipline

For every feature added, consider removing 2x its LOC elsewhere.

Before adding code, ask:
- Could this be a config change instead?
- Does this replace existing functionality? (Remove old code!)
- Is this debugging code that should be `?debug=1` only?

