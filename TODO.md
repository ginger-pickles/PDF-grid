# TODO


## INTERFACE

Increase scrollwheel zoom sensitivity

Handle situations where ?url and ?pdf parameters interact or error out depending on file:// vs http:// protocol in use

Handle situations where a .pdf url redirects to some other URL (right now "Error laoding PDF from URL: Failed to fetch proxy.")

Change the download command to expressly download the file to local storage, instead of loading a PDF in the browser

Handle URL redirects properly - some PDF URLs redirect to different locations (e.g., academic publications from institutional repositories)


## PERFORMANCE

Re-enable local PDF storage for faster refresh

Meet the rendering needs of two views displayed at once - minimap and deepzoom.

Render low-res tiles for minimap (0.X scale) in clever order; and substitute nearest available rendered page for otherwise blank tiles; replacing when ready. Result: Minimap is population in scattered fashion amongst dispersed pages instead of sequentially; unrendered gaps are temporarily filled with nearest neighbour and replaced as appropriate, progressively resolving to complete picture.

Render screen-res tiles for deep zoom (X.0 scale)) more cleverly. OSD view-aware rendering.

Optimize or add distinct caches for distinct tasks, as improves performance.

Optimize page refresh performance; consider storing cache or canvas. (Currently re-renders all pages on every refresh; see notes.md for canvas storage vs progressive rendering options.)

Incorporate external libraries somehow rather than pulling from whereever they come from now



## FUNCTIONALITY

Add support to switch between different page layouts: Staggered rotating grid (default), conventional wrapped grid,  vertical and horizontal scroll, Two-up, Infinite(?), etc. Fractal layout? Space-filling curve?

Elegantly handle odd-sized pages; including odd first pages. On PDF load, sample pages to determine the modal page dimensions. Big pages should be reduced. As a stretch goal, resolution should not be sacrificed. Generalizing, that means some regions of the map have greater resolution than others.

Add the ability to export the transformed tile canvas as an image; with approriate resolution options.

Add the ability to switch, with buttons, between PDFs residing in the local directory from which index.html is served

Add browser history support for back/forward navigation between local PDFs (see notes.md for implementation details)

