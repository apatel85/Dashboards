import 'package:flutter/foundation.dart';
import 'package:flutter/services.dart';

import '../audio/mic.dart';
import 'onboarding_controller.dart';

/// What the Android setup checklist needs from the OS.
abstract class SetupPlatform {
  Future<bool> micGranted();
  Future<bool> overlayGranted();
  Future<bool> accessibilityEnabled();
  Future<bool> bubbleRunning();
  Future<void> openOverlaySettings();
  Future<void> openAccessibilitySettings();
  Future<void> openAppInfo();
  Future<void> showBubble();
  Future<void> hideBubble();
}

class ChannelSetupPlatform implements SetupPlatform {
  static const _ch = MethodChannel('voiceflow/setup');
  Future<bool> _b(String m) async => (await _ch.invokeMethod<bool>(m)) ?? false;
  @override
  Future<bool> micGranted() => _b('micGranted');
  @override
  Future<bool> overlayGranted() => _b('overlayGranted');
  @override
  Future<bool> accessibilityEnabled() => _b('accessibilityEnabled');
  @override
  Future<bool> bubbleRunning() => _b('bubbleRunning');
  @override
  Future<void> openOverlaySettings() => _ch.invokeMethod('openOverlaySettings');
  @override
  Future<void> openAccessibilitySettings() =>
      _ch.invokeMethod('openAccessibilitySettings');
  @override
  Future<void> openAppInfo() => _ch.invokeMethod('openAppInfo');
  @override
  Future<void> showBubble() => _ch.invokeMethod('showBubble');
  @override
  Future<void> hideBubble() => _ch.invokeMethod('hideBubble');
}

enum SetupStep { mic, overlay, accessibility, model, bubble, done }

/// Android first-run checklist: allow microphone, allow drawing over other apps (the floating
/// button), turn on the accessibility service (how text is typed into the focused field),
/// download the model, show the button. Ticks come from the OS, so they update on resume.
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

  bool micOk = false, overlayOk = false, accessOk = false, bubbleOn = false;
  bool micAsked = false;

  ModelUiState get model => _model.model;
  int get percent => _model.percent;
  bool get modelOk => _model.model == ModelUiState.installed;
  bool get allDone => micOk && overlayOk && accessOk && modelOk && bubbleOn;

  /// First thing still to do, in order.
  SetupStep get current {
    if (!micOk) return SetupStep.mic;
    if (!overlayOk) return SetupStep.overlay;
    if (!accessOk) return SetupStep.accessibility;
    if (!modelOk) return SetupStep.model;
    if (!bubbleOn) return SetupStep.bubble;
    return SetupStep.done;
  }

  /// Re-read the OS state (call on start and whenever the app resumes).
  Future<void> refresh() async {
    micOk = await platform.micGranted();
    overlayOk = await platform.overlayGranted();
    accessOk = await platform.accessibilityEnabled();
    bubbleOn = await platform.bubbleRunning();
    notifyListeners();
  }

  Future<void> openOverlaySettings() => platform.openOverlaySettings();
  Future<void> openAccessibilitySettings() =>
      platform.openAccessibilitySettings();

  Future<void> openAppInfo() => platform.openAppInfo();

  Future<void> showBubble() async {
    await platform.showBubble();
    // The service starts asynchronously: give it a moment before reading its state.
    for (var i = 0; i < 15; i++) {
      if (await platform.bubbleRunning()) break;
      await Future<void>.delayed(const Duration(milliseconds: 200));
    }
    await refresh();
  }

  Future<void> hideBubble() async {
    await platform.hideBubble();
    await refresh();
  }

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
