# TODO



## PERFORMANCE

Exploit periodicity when constructing multi-page tiles.

Handle poor low-hi res fallback performance - improve resolution switching and fallback behavior

Render low-res tiles for minimap (0.X scale) in clever order; and substitute nearest available rendered page for otherwise blank tiles; replacing when ready. Result: Minimap is populated in scattered fashion amongst dispersed pages instead of sequentially; unrendered gaps are temporarily filled with nearest neighbour and replaced as appropriate, progressively resolving to complete picture.


Further improve sub-pixel hairline gaps between tiles (iOS Safari) - current mitigations (JPEG, overlap, OSD config) help but some artifacts remain



## IMPLEMENTATION

Incorporate and conditinoally use local copies of external libraries for sandboxed instances or offline machines; pull from CDN for online machines without libraries.




## INTERFACE


Ensure Debug Panel always shows if button clicked or URL param present; even when no PDF loaded

On mobile, increase pan inertia (flickMomentum)

If not alrady done, Smartly harmonize home screen text with help screen text to include attribution, and do not display "drag & drop" on mobile

When demo PDF fails to load (file not present when served), remove ?pdf URL parameter after elegant failure

Handle situations where ?url and ?pdf parameters interact or error out depending on file:// vs http:// protocol in use

Handle PDF URL redirects - some URLs redirect to different locations (currently errors with "Failed to fetch proxy")



**Improve grid layout for even-numbered page counts** 
For an even-number of pages, an extra column as follows:
0 0 1 2 3
0 1 2 3 4
1 2 3 4 0
2 3 4 0 0

For an odd-number of pages, NxN grid layout as follows:
0 0 1 2 3
0 1 2 3 4
1 2 3 4 5
2 3 4 5 0
3 4 5 0 0


Add support to switch between different page layouts: Staggered rotating grid (default), conventional wrapped grid,  vertical and horizontal scroll, Two-up, Infinite(?), etc. Fractal layout? Space-filling curve?


## FUNCTIONALITY & FEATURES

Handle odd-sized pages; including odd first pages.

SIMPLE APPROACH: On PDF load, sample pages to determine the modal page dimensions. Enlarge small pages to fit; reduce large pages to fit.
DESIRED APPROACH: Elegantly rearrange pages to present wide pages (as seen in in National Geographic) at full height and width.
STRETCH GOAL: Elegantly handle tall pages.

Add the ability to (detect and) crop pages with excessive margins, like some academic papers and books

Change the download command to expressly download the file to local storage, instead of loading a PDF in the browser

iPadOS Safari download behavior  - Download PDF button currently saves to browser's Downloads manager instead of filesystem. 

Add the ability to export the transformed tile canvas as an image; with approriate resolution options.

Add the ability to switch, with buttons, between PDFs residing in the local directory from which index.html is served

Add browser history support for back/forward navigation between local PDFs

Support annotating PDFs (long horizon)


