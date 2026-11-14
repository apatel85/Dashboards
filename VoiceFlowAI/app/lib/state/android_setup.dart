import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../audio/mic.dart';
import 'onboarding_controller.dart';

/// What the Android setup checklist needs from the OS.
abstract class SetupPlatform {
  Future<bool> keyboardEnabled();
  Future<bool> keyboardSelected();
  Future<bool> micGranted();
  Future<void> openKeyboardSettings();
  Future<void> showKeyboardPicker();
}

class ChannelSetupPlatform implements SetupPlatform {
  static const _ch = MethodChannel('voiceflow/setup');
  Future<bool> _b(String m) async => (await _ch.invokeMethod<bool>(m)) ?? false;
  @override
  Future<bool> keyboardEnabled() => _b('keyboardEnabled');
  @override
  Future<bool> keyboardSelected() => _b('keyboardSelected');
  @override
  Future<bool> micGranted() => _b('micGranted');
  @override
  Future<void> openKeyboardSettings() =>
      _ch.invokeMethod('openKeyboardSettings');
  @override
  Future<void> showKeyboardPicker() => _ch.invokeMethod('showKeyboardPicker');
}

enum SetupStep { enable, select, mic, model, done }

/// Android first-run checklist: enable keyboard, select keyboard, allow microphone,
/// download model, then try it. Ticks come from the OS, so they update on resume.
class AndroidSetupController extends ChangeNotifier {
  AndroidSetupController({
    required this.platform,
    required this.mic,
    required this.installer,
    this.onFinished,
  }) : _model = OnboardingController(mic: mic, installer: installer) {
    _model.addListener(notifyListeners);
  }

  final SetupPlatform platform;
  final MicProbe mic;
  final ModelInstallerPort installer;
  final VoidCallback? onFinished;
  final OnboardingController _model;

  bool enabled = false, selected = false, micOk = false;
  bool micAsked = false;

  ModelUiState get model => _model.model;
  int get percent => _model.percent;
  bool get modelOk => _model.model == ModelUiState.installed;
  bool get allDone => enabled && selected && micOk && modelOk;

  /// First thing still to do, in order.
  SetupStep get current {
    if (!enabled) return SetupStep.enable;
    if (!selected) return SetupStep.select;
    if (!micOk) return SetupStep.mic;
    if (!modelOk) return SetupStep.model;
    return SetupStep.done;
  }

  /// Re-read the OS state (call on start and whenever the app resumes).
  Future<void> refresh() async {
    enabled = await platform.keyboardEnabled();
    selected = enabled && await platform.keyboardSelected();
    micOk = await platform.micGranted();
    notifyListeners();
  }

  Future<void> openKeyboardSettings() => platform.openKeyboardSettings();
  Future<void> pickKeyboard() => platform.showKeyboardPicker();

  Future<void> allowMic() async {
    micAsked = true;
    await mic.requestPermission();
    await refresh();
  }

  Future<void> download() => _model.download();
  void pause() => _model.pause();
  void finish() => onFinished?.call();

  @override
  void dispose() {
    _model.removeListener(notifyListeners);
    _model.dispose();
    super.dispose();
  }
}
