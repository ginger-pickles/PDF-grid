LESSONS
-------

RECURSION

All applications should be designed for both human and machine interaction. Machines (agents) must be able to operate the application both like a human would, and as a machine can. Agents must use the tools they develop.

The web browser is the universal local computing platform that everyone has on their computer. The web browser shoud be the interactive interface for all software used by agents. 



TESTING

Applications should be developed using the principle of feedback control - using measurement and testing to bring error to zero.

Applications should be built with instrmentation for automated testing from the beginning.

An automated tester should be built that keeps pace with the operation of the program.

Automated testing should give the agent "eyes" by employing visual feedback, and "ears" by employing console logging in debug mode.



FEEDBACK

Programs should employ feed-back control to detect correct operation, and work to reduce errors; not rely exclusively on dead-reckoning and mechanistic behavior operating in the blind.

Programs should employ feed-forward control to pre-fetch, pre-generate, and pre-position in anticipation of user actions.



FEATURE MODULARITY

Features should be implemented with controls to activate and de-activate them

Programs should be built with a debug configuration panel to manually activate features and adjust parameters. This should be used by the agent in testing.



EFFICIENCY & MAINTAINABILITY

Regularly scrub for redundancy and optimization; aiming to reduce LOC by 5-10% each time.



VERSIONING

Main branch is public and stable. Dev branch is live and stable. Feature branches are unstable, and merged when done.



DOCUMENTATION

Documentation describing urrent state, while useful for a moment, quickly goes stale. These reports should be re-generated rather than maintained. The code and it's comments the best documentation of current state.

Forward-looking documentation stays relevant longer.
