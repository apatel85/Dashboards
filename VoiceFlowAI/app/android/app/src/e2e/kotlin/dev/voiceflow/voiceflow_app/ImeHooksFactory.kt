package dev.voiceflow.voiceflow_app

object ImeHooksFactory {
    fun create(ime: VoiceFlowIME): ImeHooks? = E2eHooks(ime)
}
