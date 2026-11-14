import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/platform/windows/hotkey_gestures.dart';

class Rig {
  var t = DateTime(2026, 1, 1);
  final log = <String>[];
  final timers = <_T>[];
  late final HotkeyGestures g = HotkeyGestures(
    onStart: () => log.add('start'),
    onStop: () => log.add('stop'),
    onCancel: () => log.add('cancel'),
    now: () => t,
    schedule: (d, f) {
      final x = _T(t.add(d), f);
      timers.add(x);
      return x;
    },
  );
  void advance(int ms) {
    t = t.add(Duration(milliseconds: ms));
    for (final x in List.of(timers)) {
      if (!x.cancelled && !x.fired && !x.due.isAfter(t)) {
        x.fired = true;
        x.f();
      }
    }
  }
}

class _T implements Timer {
  _T(this.due, this.f);
  final DateTime due;
  final void Function() f;
  bool cancelled = false, fired = false;
  @override
  void cancel() => cancelled = true;
  @override
  bool get isActive => !cancelled && !fired;
  @override
  int get tick => 0;
}

void main() {
  test('hold then release inserts: start on press, stop on release', () {
    final r = Rig();
    expect(r.g.keyDown(), isTrue);
    expect(r.log, [
      'start',
    ], reason: 'listening begins at the press, not after a delay');
    r.advance(1200);
    expect(r.g.keyUp(), isTrue);
    expect(r.log, ['start', 'stop']);
    expect(r.g.active, isFalse);
  });

  test('auto-repeat key-downs while held are swallowed and do nothing', () {
    final r = Rig();
    r.g.keyDown();
    for (var i = 0; i < 20; i++) {
      r.advance(30);
      expect(r.g.keyDown(), isTrue);
    }
    expect(r.log, ['start']);
    r.g.keyUp();
    expect(r.log, ['start', 'stop']);
  });

  test('a lone short tap (< 300 ms) is ignored: cancelled after the double-tap window', () {
    final r = Rig();
    r.g.keyDown();
    r.advance(100);
    r.g.keyUp();
    expect(r.log, ['start'], reason: 'waiting to see if a second tap follows');
    r.advance(399);
    expect(r.log, ['start']);
    r.advance(2);
    expect(r.log, ['start', 'cancel']);
    expect(r.g.active, isFalse);
  });

  test('double-tap starts hands-free; a third press stops and inserts', () {
    final r = Rig();
    r.g.keyDown();
    r.advance(80);
    r.g.keyUp();
    r.advance(120);
    r.g.keyDown(); // second tap
    r.advance(80);
    r.g.keyUp();
    expect(r.log, [
      'start',
    ], reason: 'no second start, no stop: still listening');
    r.advance(5000); // talk hands-free
    expect(r.g.active, isTrue);
    r.g.keyDown(); // tap again to stop
    expect(r.log, ['start', 'stop']);
    r.g.keyUp();
    expect(r.g.active, isFalse);
    // and it can start again
    r.g.keyDown();
    expect(r.log.last, 'start');
  });

  test('Esc while holding cancels; the later release does nothing', () {
    final r = Rig();
    r.g.keyDown();
    r.advance(500);
    r.g.cancel();
    expect(r.log, ['start', 'cancel']);
    expect(
      r.g.keyUp(),
      isTrue,
      reason: 'swallowed so apps never see a stray F9 up',
    );
    expect(r.log, ['start', 'cancel']);
  });

  test('Esc during hands-free cancels', () {
    final r = Rig();
    r.g.keyDown();
    r.advance(50);
    r.g.keyUp();
    r.advance(50);
    r.g.keyDown();
    r.g.keyUp();
    r.g.cancel();
    expect(r.log, ['start', 'cancel']);
    expect(r.g.active, isFalse);
  });

  test('Esc when idle is a no-op (the key must reach the app)', () {
    final r = Rig();
    r.g.cancel();
    expect(r.log, isEmpty);
    expect(r.g.active, isFalse);
  });

  test('exactly 300 ms counts as a hold; 299 ms is a tap', () {
    var r = Rig();
    r.g.keyDown();
    r.advance(300);
    r.g.keyUp();
    expect(r.log, ['start', 'stop']);
    r = Rig();
    r.g.keyDown();
    r.advance(299);
    r.g.keyUp();
    expect(r.log, ['start']);
  });

  test('a stray key-up with no key-down is not consumed', () {
    final r = Rig();
    expect(r.g.keyUp(), isFalse);
  });

  test(
    'a new press during tap-pending after the window expired starts fresh',
    () {
      final r = Rig();
      r.g.keyDown();
      r.advance(50);
      r.g.keyUp();
      r.advance(500); // window expired -> cancelled
      r.g.keyDown();
      expect(r.log, ['start', 'cancel', 'start']);
    },
  );
}
