package dev.voiceflow.voiceflow_app

/**
 * Extension point the keyboard calls on create/destroy. The shipped (prod) build has none;
 * only the `e2e` build flavor installs one, so no test entry point can exist in a release.
 */
interface ImeHooks {
    fun onDestroy()
}
