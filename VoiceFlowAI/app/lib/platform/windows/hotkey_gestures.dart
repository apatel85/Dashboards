import 'dart:async';

/// Hotkey gesture state machine (spec §9.3), independent of Windows so it is unit-tested:
///  - hold = talk, release = insert;
///  - a press shorter than [minHold] that is not a double-tap is ignored;
///  - double-tap = hands-free, tap again to stop;
///  - Esc (via [cancel]) while listening cancels.
/// `keyDown`/`keyUp` return true when the key event is consumed (swallowed from apps).
class HotkeyGestures {
  HotkeyGestures({
    required this.onStart,
    required this.onStop,
    required this.onCancel,
    this.minHold = const Duration(milliseconds: 300),
    this.doubleTapWindow = const Duration(milliseconds: 400),
    DateTime Function()? now,
    Timer Function(Duration, void Function())? schedule,
  }) : _now = now ?? DateTime.now,
       _schedule = schedule ?? Timer.new;

  final void Function() onStart, onStop, onCancel;
  final Duration minHold, doubleTapWindow;
  final DateTime Function() _now;
  final Timer Function(Duration, void Function()) _schedule;

  _Mode _mode = _Mode.idle;
  bool _down = false; // physical key state, to drop auto-repeat
  bool _swallowUntilUp = false;
  late DateTime _pressedAt;
  Timer? _timer;

  /// True while a dictation started by this hotkey is in progress.
  bool get active => _mode != _Mode.idle && _mode != _Mode.stopping;

  bool keyDown() {
    if (_down) return true; // auto-repeat: consume, no action
    _down = true;
    switch (_mode) {
      case _Mode.idle:
        _mode = _Mode.holding;
        _pressedAt = _now();
        onStart();
      case _Mode.tapPending:
        _timer?.cancel();
        _mode = _Mode.handsFree; // second tap: keep listening, hands-free
      case _Mode.handsFree:
        _mode = _Mode.stopping;
        onStop();
      case _Mode.holding:
      case _Mode.stopping:
        break;
    }
    return true;
  }

  bool keyUp() {
    if (!_down) return false;
    _down = false;
    if (_swallowUntilUp) {
      _swallowUntilUp = false;
      return true;
    }
    switch (_mode) {
      case _Mode.holding:
        if (_now().difference(_pressedAt) >= minHold) {
          _mode = _Mode.idle;
          onStop();
        } else {
          _mode = _Mode.tapPending;
          _timer = _schedule(doubleTapWindow, () {
            if (_mode == _Mode.tapPending) {
              _mode = _Mode.idle;
              onCancel(); // a lone short tap is ignored
            }
          });
        }
      case _Mode.stopping:
        _mode = _Mode.idle;
      case _Mode.handsFree:
      case _Mode.tapPending:
      case _Mode.idle:
        break;
    }
    return true;
  }

  /// Esc, or the app cancelling. No-op when nothing is active.
  void cancel() {
    if (!active) return;
    _timer?.cancel();
    if (_down) _swallowUntilUp = true;
    _mode = _Mode.idle;
    onCancel();
  }

  void dispose() => _timer?.cancel();
}

enum _Mode { idle, holding, tapPending, handsFree, stopping }
