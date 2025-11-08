# TODO


## INTERFACE

Remove version number from page title

Catch error when demo.pdf not present on server; ensure instruction screen is shown - presently blank


## PERFORMANCE

implement progressive loading and rendering

support more than a hundred or so pages without crashing

Incorporate external libraries somehow rather than pulling from whereever they come from now.

Optimize page refresh performance - currently re-renders all pages on every refresh (see notes.md for canvas storage vs progressive rendering options)


## FUNCTIONALITY

Add support to switch between different page layouts: Rotating grid (default), Skewed/Staggered, Conventional grid, Scroll, Two-up, Infinite(?), etc

A "staggered" rotating grid looks like:
0 0 1 2 3
0 1 2 3 0
1 2 3 0 0
(where zero denotes a blank page)

Elegantly handle odd-sized pages; including odd first pages

Add browser history support for back/forward navigation between local PDFs (see notes.md for implementation details)

Add the ability to switch, with buttons, between PDFs residing in the local direcotry from which index.html is served.
