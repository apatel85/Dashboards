import 'dart:typed_data';

import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/platform/windows/insertion.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

class FakeOs implements InsertionOs {
  int fg = 100;
  bool elevated = false, password = false, clipboardLocked = false;
  int pasteAccepted = 4;
  final calls = <String>[];
  ClipboardSnapshot clip = ClipboardSnapshot([
    ClipboardEntry(13, Uint8List.fromList([1, 2, 3])),
  ]);
  String? textOnClipboard;
  int backspaces = 0;
  String typed = '';

  @override
  int foregroundWindow() => fg;
  @override
  bool isElevatedWindow(int hwnd) => elevated;
  @override
  bool focusedIsPassword() => password;
  @override
  Future<ClipboardSnapshot> snapshotClipboard() async {
    calls.add('snapshot');
    return clip;
  }

  @override
  Future<bool> setClipboardText(String text) async {
    calls.add('set');
    if (clipboardLocked) return false;
    textOnClipboard = text;
    return true;
  }

  @override
  Future<void> restoreClipboard(ClipboardSnapshot s) async {
    calls.add('restore');
    clip = s;
    textOnClipboard = null;
  }

  @override
  int sendPaste() {
    calls.add('paste');
    return pasteAccepted;
  }

  @override
  int sendBackspaces(int n) {
    backspaces += n;
    return n * 2;
  }

  @override
  int sendUnicode(String text) {
    typed += text;
    calls.add('type');
    return text.codeUnits.length * 2;
  }
}

WindowsTextSink sink(FakeOs os, {DateTime Function()? now}) =>
    WindowsTextSink(os, restoreDelay: Duration.zero, now: now);

void main() {
  test('paste path: snapshot -> set -> paste -> restore, in that order, clipboard returned intact', () async {
    final os = FakeOs();
    final before = os.clip;
    expect(await sink(os).insert('Hello world.'), InsertResult.ok);
    expect(os.calls, ['snapshot', 'set', 'paste', 'restore']);
    expect(identical(os.clip, before), isTrue);
    expect(os.textOnClipboard, isNull);
    expect(os.typed, isEmpty);
  });

  test(
    'password field: nothing is pasted or typed, clipboard untouched',
    () async {
      final os = FakeOs()..password = true;
      expect(await sink(os).insert('secret'), InsertResult.passwordField);
      expect(os.calls, isEmpty);
    },
  );

  test('elevated target window: reported, nothing sent', () async {
    final os = FakeOs()..elevated = true;
    expect(await sink(os).insert('hi'), InsertResult.elevatedTarget);
    expect(os.calls, isEmpty);
  });

  test('no foreground window: failed, nothing sent', () async {
    final os = FakeOs()..fg = 0;
    expect(await sink(os).insert('hi'), InsertResult.failed);
    expect(os.calls, isEmpty);
  });

  test(
    'paste rejected by the OS: clipboard restored, falls back to typing',
    () async {
      final os = FakeOs()..pasteAccepted = 0;
      expect(await sink(os).insert('Hello'), InsertResult.ok);
      expect(os.typed, 'Hello');
      expect(os.calls, ['snapshot', 'set', 'paste', 'restore', 'type']);
    },
  );

  test(
    'clipboard locked by another app: falls back to typing and still restores',
    () async {
      final os = FakeOs()..clipboardLocked = true;
      expect(await sink(os).insert('Hi there'), InsertResult.ok);
      expect(os.typed, 'Hi there');
      expect(
        os.calls,
        containsAllInOrder(['snapshot', 'set', 'restore', 'type']),
      );
      expect(os.calls.contains('paste'), isFalse);
    },
  );

  test('empty text is a successful no-op', () async {
    final os = FakeOs();
    expect(await sink(os).insert(''), InsertResult.ok);
    expect(os.calls, isEmpty);
  });

  group('undo (Appendix C)', () {
    test(
      'sends one Backspace per grapheme (emoji and combining marks count once)',
      () async {
        final os = FakeOs();
        final s = sink(os);
        await s.insert(
          'Hi 👍🏽 café',
        ); // H i space 👍🏽 space c a f é = 9 graphemes
        await s.undoLast();
        expect(os.backspaces, 9);
      },
    );

    test('works once only', () async {
      final os = FakeOs();
      final s = sink(os);
      await s.insert('abc');
      await s.undoLast();
      await s.undoLast();
      expect(os.backspaces, 3);
    });

    test('a new insertion replaces the undo target', () async {
      final os = FakeOs();
      final s = sink(os);
      await s.insert('first one');
      await s.insert('second');
      await s.undoLast();
      expect(os.backspaces, 6);
    });

    test('focus change clears it', () async {
      final os = FakeOs();
      final s = sink(os);
      await s.insert('abc');
      os.fg = 200;
      await s.undoLast();
      expect(os.backspaces, 0);
    });

    test('30 s timeout clears it (29 s still works)', () async {
      var t = DateTime(2026);
      final os = FakeOs();
      final s = sink(os, now: () => t);
      await s.insert('abc');
      t = t.add(const Duration(seconds: 29));
      await s.undoLast();
      expect(os.backspaces, 3);
      await s.insert('abc');
      t = t.add(const Duration(seconds: 31));
      await s.undoLast();
      expect(os.backspaces, 3, reason: 'expired: nothing more deleted');
    });

    test('nothing to undo is a no-op', () async {
      final os = FakeOs();
      await sink(os).undoLast();
      expect(os.backspaces, 0);
    });
  });
}
