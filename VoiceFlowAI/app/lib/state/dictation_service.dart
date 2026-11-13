import 'dart:async';
import 'dart:typed_data';

import 'package:flutter/services.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'app_controller.dart';
import 'dictation_state.dart';

/// Copy-mode sink (spec §2 "dictate in the app, copy"): always works, no focus tricks.
class ClipboardSink implements TextSink {
  @override
  Future<InsertResult> insert(String text) async {
    await Clipboard.setData(ClipboardData(text: text));
    return InsertResult.ok;
  }

  @override
  Future<void> undoLast() async {}
}

/// Glue: microphone -> core pipeline -> UI state. Never throws to the UI; every
/// failure becomes one of the §9.2 notices. Loads the speech model while the
/// user is still talking, and unloads it after [idleUnload] of silence.
class DictationService {
  DictationService({
    required this.controller,
    required this.audio,
    required this.pipeline,
    required this.options,
    required this.modelReady,
    required this.loadEngine,
    this.unloadEngine,
    this.idleUnload = const Duration(minutes: 5),
    this.maxDuration = const Duration(minutes: 5),
  });

  final AppController controller;
  final AudioSource audio;
  final DictationPipeline pipeline;
  final DictationOptions Function() options;
  final bool Function() modelReady;
  final Future<void> Function() loadEngine;
  final Future<void> Function()? unloadEngine;
  final Duration idleUnload, maxDuration;

  final BytesBuilder _pcm = BytesBuilder(copy: false);
  StreamSubscription<Uint8List>? _sub;
  Timer? _cap, _idle;
  Future<void>? _loading;
  bool _starting = false;
  bool _engineLoaded = false;
  Object? _loadError;
  Completer<void> _streamDone = Completer<void>();

  bool get isListening => controller.state == DictationUiState.listening;

  Future<void> toggle() => isListening ? stop() : start();

  Future<void> start() async {
    if (_starting || isListening) return; // rapid re-trigger is ignored
    if (controller.state == DictationUiState.processing ||
        controller.state == DictationUiState.polishing) {
      return;
    }
    if (!modelReady()) {
      controller.showNotice(NoticeKind.modelMissing);
      return;
    }
    _starting = true;
    _idle?.cancel();
    controller.startListening(); // visible immediately (spec §9.1 rule 3)
    _pcm.clear();
    _loadError = null;
    _streamDone = Completer<void>();
    try {
      // Hide the model load behind the user's speech. A failure is remembered and
      // reported when they stop (never an unhandled async error).
      _loading = _ensureEngine().catchError((Object e) {
        _loadError = e;
      });
      _sub = audio.start().listen(
        (chunk) {
          _pcm.add(chunk);
          controller.updateLevel(pcmLevel(chunk));
        },
        onError: (_) => _micFailed(),
        onDone: () {
          if (!_streamDone.isCompleted) _streamDone.complete();
        },
      );
      _cap = Timer(maxDuration, () => stop());
    } catch (_) {
      _micFailed();
    } finally {
      _starting = false;
    }
  }

  Future<void> _ensureEngine() async {
    if (_engineLoaded) return;
    await loadEngine();
    _engineLoaded = true;
  }

  void _micFailed() {
    _cap?.cancel();
    _sub?.cancel();
    _sub = null;
    unawaited(audio.stop());
    controller.showNotice(NoticeKind.noMicrophone);
  }

  Future<void> cancel() async {
    _cap?.cancel();
    await _sub?.cancel();
    _sub = null;
    await audio.stop();
    _pcm.clear();
    controller.cancel();
    _armIdle();
  }

  Future<void> stop() async {
    if (!isListening) return;
    _cap?.cancel();
    // Close the source first and let already-queued chunks drain, so the last
    // fraction of a second of speech is not lost.
    await audio.stop();
    await _streamDone.future.timeout(
      const Duration(milliseconds: 500),
      onTimeout: () {},
    );
    await _sub?.cancel();
    _sub = null;
    final pcm = _pcm.takeBytes();
    controller.startProcessing();
    try {
      await _loading;
      if (_loadError != null) {
        controller.showNotice(NoticeKind.modelMissing);
        _armIdle();
        return;
      }
      final r = await pipeline.run(pcm, options());
      switch (r.status) {
        case DictationStatus.ok:
          controller.markInserted(r.finalText ?? '');
        case DictationStatus.noSpeech:
        case DictationStatus.discarded:
          controller.showNotice(NoticeKind.noSpeech);
        case DictationStatus.insertFailed:
          controller.showNotice(NoticeKind.insertFailed);
        case DictationStatus.passwordField:
          controller.showNotice(NoticeKind.passwordField);
        case DictationStatus.commandUndo:
          controller.reset();
        case DictationStatus.error:
          controller.showNotice(NoticeKind.modelMissing);
      }
    } catch (_) {
      controller.showNotice(NoticeKind.modelMissing);
    }
    _armIdle();
  }

  void _armIdle() {
    _idle?.cancel();
    if (unloadEngine == null) return;
    _idle = Timer(idleUnload, () async {
      if (isListening) return;
      _engineLoaded = false;
      await unloadEngine!();
    });
  }

  void dispose() {
    _cap?.cancel();
    _idle?.cancel();
    _sub?.cancel();
  }
}
