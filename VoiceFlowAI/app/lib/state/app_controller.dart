import 'dart:async';
import 'package:flutter/foundation.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'assets_loader.dart';
import 'dictation_state.dart';

class RecentDictation {
  final String text;
  final DateTime at;
  const RecentDictation(this.text, this.at);
}

/// UI state for the dictation flow. The hotkey/audio layers (later slices) drive
/// the same methods; the UI only reads this object.
class AppController extends ChangeNotifier {
  AppController(this.assets, {this.hotkey = 'F9'})
      : _profile = assets.profiles.firstWhere((p) => p.id == 'business',
            orElse: () => assets.profiles.first);

  final AppAssets assets;
  final String hotkey;
  late final RuleFormatter _formatter = RuleFormatter(assets.lang);

  DictationUiState state = DictationUiState.idle;
  NoticeKind? notice;
  int lastWordCount = 0;
  double level = 0; // 0..1 live input level while listening
  final Stopwatch listeningFor = Stopwatch();
  final List<RecentDictation> recent = [];
  Timer? _timer;
  Profile _profile;

  Profile get profile => _profile;
  set profile(Profile p) {
    _profile = p;
    notifyListeners();
  }

  /// Runs text through the real on-device rule formatter (used by "Try it" and
  /// the Style page examples).
  String format(String text, [Profile? p]) => _formatter.format(text, p ?? _profile);

  /// Spec §9.1 rule 3: the Listening state must be visible immediately, so this
  /// flips state synchronously and only then lets audio start.
  void startListening() {
    _timer?.cancel();
    notice = null;
    state = DictationUiState.listening;
    listeningFor
      ..reset()
      ..start();
    notifyListeners();
  }

  void updateLevel(double v) {
    level = v.clamp(0, 1);
    notifyListeners();
  }

  void startProcessing() {
    listeningFor.stop();
    level = 0;
    state = DictationUiState.processing;
    notifyListeners();
  }

  void startPolishing() {
    state = DictationUiState.polishing;
    notifyListeners();
  }

  void markInserted(String text) {
    lastWordCount = text.trim().isEmpty ? 0 : text.trim().split(RegExp(r'\s+')).length;
    recent.insert(0, RecentDictation(text, DateTime.now()));
    if (recent.length > 3) recent.removeLast();
    state = DictationUiState.inserted;
    notifyListeners();
    _autoReset(const Duration(seconds: 4));
  }

  void showNotice(NoticeKind k) {
    listeningFor.stop();
    level = 0;
    notice = k;
    state = DictationUiState.notice;
    notifyListeners();
    _autoReset(const Duration(seconds: 6));
  }

  void cancel() => reset();

  void reset() {
    _timer?.cancel();
    listeningFor.stop();
    level = 0;
    notice = null;
    state = DictationUiState.idle;
    notifyListeners();
  }

  void _autoReset(Duration d) {
    _timer?.cancel();
    _timer = Timer(d, reset);
  }

  @override
  void dispose() {
    _timer?.cancel();
    super.dispose();
  }
}
