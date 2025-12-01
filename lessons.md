LESSONS
-------



VERSIONING

Main branch is public and stable. Dev branch is live and stable. Feature branches are unstable, and merged when done.




DOCUMENTATION

Signal-to-noise ratio (SNR):
SNR declines as document size grows. Even if everything is true, local value decreases as global size expands.
Focus on what works, not what might work or what does not work.

Documentation describing urrent state, while useful for a moment, quickly goes stale. These reports should be re-generated rather than maintained. The code and it's comments the best documentation of current state.

Forward-looking documentation stays relevant longer.




EFFICIENCY & MAINTAINABILITY

Regularly scrub for redundancy and optimization; aiming to reduce LOC by 5-10% each time.





FEEDBACK

Programs should employ feed-back control to detect correct operation, and work to reduce errors; not rely exclusively on dead-reckoning and mechanistic behavior operating in the blind.

Programs should employ feed-forward control to pre-fetch, pre-generate, and pre-position in anticipation of user actions.





TESTING

Development should proceed by the principle of feedback control - using measurement and testing to bring error to zero.

Applications should be built with instrumentation for automated testing from the beginning.

Automated test should be built that keep pace with the operation of the program.

Automated tests should give the agent "eyes" by employing visual feedback, and "ears" by employing console logging in debug mode.

A friendly interface for testing should be built that keeps pace with the tests.

Automated testing is preferred. Human testing is to be minimzed.



FEATURE MODULARITY

Features should be implemented with controls to activate and de-activate them

Programs should be built with a debug configuration panel to manually activate features and adjust parameters. This should be used by the agent in testing.





CONCURRENCY
Synchronous methods are fast, but brittle. Asynchronous methods have overhead, but are robust. 

Synchronous interactions are for humans. Asynchronous interactions are for machines. Synchronous interaction is a human privilege to be minimzed.





