import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/platform/windows/hotkey_gestures.dart';
import 'package:voiceflow_app/platform/windows/hotkey_manager.dart';
import 'package:voiceflow_app/platform/windows/win32.dart' as w;

class Rig {
  final log = <String>[];
  late final HotkeyManager m = HotkeyManager(
    gestures: HotkeyGestures(
      onStart: () => log.add('start'),
      onStop: () => log.add('stop'),
      onCancel: () => log.add('cancel'),
      schedule: (d, f) => Timer(d, f),
    ),
    onUndo: () => log.add('undo'),
    onCycleProfile: () => log.add('cycle'),
  );
  bool key(
    int vk,
    bool down, {
    bool ctrl = false,
    bool alt = false,
    bool ours = false,
  }) => m.onKey(vk: vk, down: down, ctrl: ctrl, alt: alt, ours: ours);
}

void main() {
  test(
    'the dictation hotkey is swallowed (down and up) and drives the gestures',
    () {
      final r = Rig();
      expect(r.key(w.kVkF9, true), isTrue);
      expect(r.log, ['start']);
      expect(r.key(w.kVkF9, false), isTrue);
    },
  );

  test('ordinary keys pass through untouched', () {
    final r = Rig();
    for (final vk in [0x41, 0x0D, 0x20, w.kVkBack]) {
      expect(r.key(vk, true), isFalse);
      expect(r.key(vk, false), isFalse);
    }
    expect(r.log, isEmpty);
  });

  test('Esc is swallowed only while a dictation is active; otherwise the app gets it', () {
    final r = Rig();
    expect(
      r.key(w.kVkEscape, true),
      isFalse,
      reason: 'idle: Esc must reach the app',
    );
    expect(r.key(w.kVkEscape, false), isFalse);
    r.key(w.kVkF9, true); // listening
    expect(r.key(w.kVkEscape, true), isTrue);
    expect(r.log, ['start', 'cancel']);
    expect(
      r.key(w.kVkEscape, false),
      isTrue,
      reason: 'matching key-up swallowed too',
    );
  });

  test(
    'Ctrl+Alt+Z undoes once and swallows both edges; plain Z is untouched',
    () {
      final r = Rig();
      expect(r.key(w.kVkZ, true), isFalse);
      expect(r.key(w.kVkZ, false), isFalse);
      expect(
        r.key(w.kVkZ, true, ctrl: true),
        isFalse,
        reason: 'Ctrl+Z alone is the app\'s undo',
      );
      expect(r.key(w.kVkZ, true, ctrl: true, alt: true), isTrue);
      expect(r.key(w.kVkZ, false, ctrl: true, alt: true), isTrue);
      expect(r.log, ['undo']);
    },
  );

  test('Ctrl+Alt+P cycles the profile', () {
    final r = Rig();
    expect(r.key(w.kVkP, true, ctrl: true, alt: true), isTrue);
    expect(r.key(w.kVkP, false), isTrue);
    expect(r.log, ['cycle']);
  });

  test('keys we injected ourselves (paste, backspaces) are never treated as hotkeys', () {
    final r = Rig();
    expect(r.key(w.kVkF9, true, ours: true), isFalse);
    expect(r.key(w.kVkZ, true, ctrl: true, alt: true, ours: true), isFalse);
    expect(r.log, isEmpty);
  });

  test('a configurable hotkey: changing the key moves the binding', () {
    final r = Rig()..m.hotkeyVk = 0x7B; // F12
    expect(r.key(w.kVkF9, true), isFalse);
    expect(r.key(0x7B, true), isTrue);
    expect(r.log, ['start']);
  });
}
