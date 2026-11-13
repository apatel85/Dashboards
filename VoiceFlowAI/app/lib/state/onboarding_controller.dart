import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../audio/mic.dart';

abstract class ModelInstallerPort {
  bool get installed;
  int get sizeMb;
  Future<void> install({ModelProgress? onProgress, CancelToken? cancel});
}

class ManagerInstaller implements ModelInstallerPort {
  ManagerInstaller(this.manager);
  final ModelManager manager;
  @override
  bool get installed => manager.installed;
  @override
  int get sizeMb => manager.spec.sizeMb;
  @override
  Future<void> install({ModelProgress? onProgress, CancelToken? cancel}) =>
      manager.ensureInstalled(onProgress: onProgress, cancel: cancel);
}

enum ModelUiState {
  idle,
  downloading,
  verifying,
  extracting,
  paused,
  failed,
  integrity,
  installed,
}

/// The 4 onboarding steps (spec §9.3): welcome + privacy, microphone with a live
/// level meter, model download (progress, pause/resume), try it.
class OnboardingController extends ChangeNotifier {
  OnboardingController({
    required this.mic,
    required this.installer,
    this.onFinished,
    this.initialDeviceId,
  }) : model = installer.installed ? ModelUiState.installed : ModelUiState.idle,
       deviceId = initialDeviceId;

  final MicProbe mic;
  final ModelInstallerPort installer;
  final VoidCallback? onFinished;
  final String? initialDeviceId;

  int step = 0; // 0..3
  bool? micAllowed;
  List<MicDevice> devices = const [];
  String? deviceId;
  double level = 0;
  ModelUiState model;
  int percent = 0;

  StreamSubscription<double>? _levels;
  CancelToken? _cancel;

  bool get canBack => step > 0 && model != ModelUiState.downloading;
  // The mic step never blocks (a user without a mic must not be trapped);
  // the model step needs the model; the last step finishes.
  bool get canNext => switch (step) {
    0 || 1 => true,
    2 => model == ModelUiState.installed,
    _ => false,
  };

  /// Spec: skippable only after step 3.
  bool get canSkip => step == 3;

  void next() {
    if (!canNext) return;
    if (step == 1) _stopMeter();
    step++;
    notifyListeners();
  }

  void back() {
    if (!canBack) return;
    if (step == 1) _stopMeter();
    step--;
    if (step == 1 && micAllowed == true) _startMeter();
    notifyListeners();
  }

  Future<void> allowMic() async {
    micAllowed = await mic.requestPermission();
    devices = micAllowed == true ? await mic.devices() : const [];
    if (devices.isNotEmpty && !devices.any((d) => d.id == deviceId)) {
      deviceId = devices.first.id;
    }
    if (micAllowed == true && devices.isNotEmpty) _startMeter();
    notifyListeners();
  }

  void selectDevice(String id) {
    deviceId = id;
    _startMeter();
    notifyListeners();
  }

  void _startMeter() {
    _levels?.cancel();
    level = 0;
    _levels = mic
        .levels(deviceId)
        .listen(
          (l) {
            level = l;
            notifyListeners();
          },
          onError: (_) {
            micAllowed = false;
            level = 0;
            notifyListeners();
          },
        );
  }

  void _stopMeter() {
    _levels?.cancel();
    _levels = null;
    level = 0;
  }

  Future<void> download() async {
    if (model == ModelUiState.downloading ||
        model == ModelUiState.verifying ||
        model == ModelUiState.extracting) {
      return;
    }
    _cancel = CancelToken();
    model = ModelUiState.downloading;
    notifyListeners();
    try {
      await installer.install(
        cancel: _cancel,
        onProgress: (phase, done, total) {
          switch (phase) {
            case ModelPhase.downloading:
              model = ModelUiState.downloading;
              percent = total > 0 ? (done * 100 ~/ total).clamp(0, 100) : 0;
            case ModelPhase.verifying:
              model = ModelUiState.verifying;
            case ModelPhase.extracting:
              model = ModelUiState.extracting;
            case ModelPhase.done:
              break;
          }
          notifyListeners();
        },
      );
      model = ModelUiState.installed;
    } on ModelCancelled {
      model = ModelUiState.paused;
    } on ModelIntegrityException {
      model = ModelUiState.integrity;
    } catch (_) {
      model = ModelUiState.failed;
    }
    notifyListeners();
  }

  void pause() => _cancel?.cancelled = true;

  void finish() {
    _stopMeter();
    onFinished?.call();
  }

  @override
  void dispose() {
    _levels?.cancel();
    super.dispose();
  }
}
