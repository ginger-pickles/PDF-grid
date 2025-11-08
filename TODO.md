# TODO


## INTERFACE

Increase scrollwheel zoom sensitivity

Handle situations where ?url and ?pdf parameters interact or error out depending on file:// vs http:// protocol in use

Change the download command to expressly download the file to local storage, instead of loading a PDF in the browser


## PERFORMANCE

Implement progressive loading and rendering

Support more than a hundred or so pages without crashing

Gracefully handle pages of odd size

Incorporate external libraries somehow rather than pulling from whereever they come from now

Optimize page refresh performance - currently re-renders all pages on every refresh (see notes.md for canvas storage vs progressive rendering options)


## FUNCTIONALITY

Add support to switch between different page layouts: Rotating grid (default), Skewed/Staggered, Conventional grid, Scroll, Two-up, Infinite(?), etc

A "staggered" rotating grid looks like:
'''
0 0 1 2 3
0 1 2 3 0
1 2 3 0 0
'''
(where zero denotes a blank page)

Elegantly handle odd-sized pages; including odd first pages

Add browser history support for back/forward navigation between local PDFs (see notes.md for implementation details)

Add the ability to switch, with buttons, between PDFs residing in the local directory from which index.html is served

Add the ability to export the transformed tile canvas to a reduced image
