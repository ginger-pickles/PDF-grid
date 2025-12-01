LESSONS
-------



VERSIONING

Main branch is public and stable. Dev branch is live and stable. Feature branches are unstable, and merged into Dev when stable. Dev is merged into Main when Dev is better than Main.




DOCUMENTATION

Signal-to-noise ratio (SNR):
SNR declines as document size grows. Even if all content is true, global value of any given local content decreases as global size expands.
To keep SNR from decaying, focus on what works, not what might work or what does not workor what might be done.

Documentation describing the current state goes stale and its value quickly decays. Perhaps reports should be re-generated, rather than maintained. The code and its comments are the best documentation of current state.

Therefore, documentaiton should be forward-looking; forward-looking documentation stays relevant longer.




EFFICIENCY & MAINTAINABILITY

Regularly scrub for redundancy and optimization; aiming to reduce LOC by 5-10% each time.





FEEDBACK

Programs should employ feed-back control to detect correct operation, and work to reduce errors; not rely exclusively on dead-reckoning and mechanistic behavior operating in the blind.

Programs should employ feed-forward control to pre-fetch, pre-generate, and pre-position program state in anticipation of user action.





TESTING

Development should proceed by the principle of feedback control - using measurement and testing to bring error to zero.

Applications should be built with instrumentation for automated testing from the beginning.

Automated test should be built that keep pace with the operation of the program.

Automated tests should give the agent "eyes" by employing visual feedback, and "ears" by employing console logging in debug mode.

A friendly interface for testing should be built that keeps pace with the tests.

Automated testing is preferred. Human testing is to be minimzed.

The risk of feed-back control is reward-hacking; that is, modifying the test to generate "successful" outcome rather than a correct one. 





FEATURE MODULARITY

Features should be implemented with controls to activate and de-activate them.

Programs should be built with a debug configuration panel to manually activate features and adjust parameters. This interface should be used by the agent in testing.





CONCURRENCY
Synchronous methods are fast, but brittle. Asynchronous methods have overhead, but are robust. 

Synchronous interactions are for humans. Asynchronous interactions are for machines. Synchronous interaction is a human privilege to be minimzed.



METHODOLOGY

The first working approach may have limitations.

Symptom-chasing gets stuck in local minima.

Sunk cost creates blinders that obscure the broader environment, makes one forgets that a broader environment (may) exists -- There is risk of becoming a victim of a wrong abstraction. When one finds oneself building elaborate workarounds, that is a signal to revisit foundational assumptions.


RESEARCH

Do advanced research in library documentation to move beyond basic examples.

