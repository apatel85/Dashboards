// Real Windows behaviour, on a real desktop (CI: windows-latest). Real windows, real
// SendInput, real clipboard, real low-level keyboard hook.
import 'dart:ffi';
import 'dart:io';
import 'dart:typed_data';

import 'package:ffi/ffi.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:integration_test/integration_test.dart';
import 'package:voiceflow_app/platform/windows/hotkey_gestures.dart';
import 'package:voiceflow_app/platform/windows/hotkey_manager.dart';
import 'package:voiceflow_app/platform/windows/insertion.dart';
import 'package:voiceflow_app/platform/windows/keyboard_hook.dart';
import 'package:voiceflow_app/platform/windows/pill_window.dart';
import 'package:voiceflow_app/platform/windows/win32.dart' as w;
import 'package:voiceflow_app/platform/windows/windows_os.dart';
import 'package:voiceflow_app/state/app_controller.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/state/dictation_state.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

Future<void> pause(int ms) => Future<void>.delayed(Duration(milliseconds: ms));

/// A real top-level Win32 EDIT control window.
int makeEdit({bool password = false, String title = 'vf-target'}) {
  final cls = 'EDIT'.toNativeUtf16();
  final name = title.toNativeUtf16();
  try {
    // WS_OVERLAPPEDWINDOW | WS_VISIBLE | ES_MULTILINE | ES_AUTOVSCROLL (| ES_PASSWORD)
    final style = 0x00CF0000 | 0x10000000 | 0x4 | 0x40 | (password ? 0x20 : 0);
    return w.createWindowEx(
      0,
      cls,
      name,
      style,
      120,
      120,
      520,
      220,
      0,
      0,
      w.getModuleHandle(nullptr.cast<Utf16>()),
      0,
    );
  } finally {
    calloc.free(cls);
    calloc.free(name);
  }
}

String textOf(int hwnd) {
  final buf = calloc<Uint16>(4096).cast<Utf16>();
  try {
    final n = w.getWindowText(hwnd, buf, 4096);
    return buf.toDartString(length: n);
  } finally {
    calloc.free(buf);
  }
}

/// SetForegroundWindow is restricted; attach to the current foreground thread first.
Future<bool> bringToFront(int hwnd) async {
  for (var i = 0; i < 20; i++) {
    final fg = w.getForegroundWindow();
    final fgThread = w.getWindowThreadProcessId(fg, nullptr.cast<Uint32>());
    final me = w.getCurrentThreadId();
    if (fgThread != 0 && fgThread != me) w.attachThreadInput(me, fgThread, 1);
    w.showWindow(hwnd, 5);
    w.setForegroundWindow(hwnd);
    w.setFocus(hwnd);
    if (fgThread != 0 && fgThread != me) w.attachThreadInput(me, fgThread, 0);
    await pause(100);
    if (w.getForegroundWindow() == hwnd) return true;
  }
  return false;
}

void inject(int vk, {required bool down}) {
  final buf = calloc<Uint8>(w.kInputSizeX64);
  try {
    final b = ByteData.sublistView(buf.asTypedList(w.kInputSizeX64));
    b.setUint32(0, w.kInputKeyboard, Endian.little);
    b.setUint16(8, vk, Endian.little);
    b.setUint32(12, down ? 0 : w.kKeyeventfKeyup, Endian.little);
    // dwExtraInfo left 0: looks like a real (non-VoiceFlow) key press to our hook
    w.sendInput(1, buf, w.kInputSizeX64);
  } finally {
    calloc.free(buf);
  }
}

Future<void> tap(int vk, {int holdMs = 30}) async {
  inject(vk, down: true);
  await pause(holdMs);
  inject(vk, down: false);
}

Future<void> setClip(WindowsOs os, String text, {Uint8List? custom}) async {
  await os.setClipboardText(text);
  // add a registered custom format to prove "all formats" are restored
  if (custom != null) {
    for (var i = 0; i < 20 && w.openClipboard(0) == 0; i++) {
      await pause(25);
    }
    final name = 'VF-TEST-FORMAT'.toNativeUtf16();
    final fmt = w.registerClipboardFormat(name);
    calloc.free(name);
    final h = w.globalAlloc(w.kGmemMoveable, custom.length);
    w.globalLock(h).asTypedList(custom.length).setAll(0, custom);
    w.globalUnlock(h);
    w.setClipboardData(fmt, h);
    w.closeClipboard();
  }
}

void main() {
  IntegrationTestWidgetsFlutterBinding.ensureInitialized();
  if (!Platform.isWindows) return;

  testWidgets(
    'paste lands in a real window; the user\'s clipboard comes back byte-for-byte',
    (t) async {
      final os = WindowsOs();
      final sink = WindowsTextSink(os);
      final edit = makeEdit();
      addTearDown(() => w.destroyWindow(edit));
      expect(
        await bringToFront(edit),
        isTrue,
        reason: 'test window must be foreground',
      );

      final custom = Uint8List.fromList([9, 8, 7, 6, 5]);
      await setClip(os, 'ORIGINAL-CLIPBOARD', custom: custom);
      final before = await os.snapshotClipboard();
      final names = before.entries.map((e) => e.format).toSet();
      expect(names, contains(w.kCfUnicodeText));

      const text = 'Hello, this is a native paste test.';
      expect(await sink.insert(text), InsertResult.ok);
      await pause(200);
      expect(textOf(edit), text);

      final after = await os.snapshotClipboard();
      Map<int, List<int>> asMap(ClipboardSnapshot s) => {
        for (final e in s.entries) e.format: e.bytes,
      };
      final a = asMap(before), b = asMap(after);
      expect(
        b.keys.toSet(),
        a.keys.toSet(),
        reason: 'same formats after restore',
      );
      for (final k in a.keys) {
        expect(b[k], a[k], reason: 'format $k restored exactly');
      }

      // Undo removes exactly what we inserted (and nothing else), once.
      w.setWindowText(edit, ('before ').toNativeUtf16());
      await bringToFront(edit);
      expect(await sink.insert('abc'), InsertResult.ok);
      await pause(200);
      expect(textOf(edit), endsWith('abc'));
      await sink.undoLast();
      await pause(200);
      expect(textOf(edit), 'before ');
      await sink.undoLast(); // second undo does nothing
      await pause(100);
      expect(textOf(edit), 'before ');
    },
  );

  testWidgets('unicode typing fallback types accents and emoji', (t) async {
    final os = WindowsOs();
    final edit = makeEdit();
    addTearDown(() => w.destroyWindow(edit));
    expect(await bringToFront(edit), isTrue);
    final s = 'café \u{1F600}';
    expect(os.sendUnicode(s), s.codeUnits.length * 2);
    await pause(300);
    expect(textOf(edit), s);
  });

  testWidgets('a password field is refused and nothing is typed or pasted', (
    t,
  ) async {
    final os = WindowsOs();
    final sink = WindowsTextSink(os);
    final pw = makeEdit(password: true, title: 'vf-password');
    addTearDown(() => w.destroyWindow(pw));
    expect(await bringToFront(pw), isTrue);
    expect(os.focusedIsPassword(), isTrue);
    expect(await sink.insert('secret'), InsertResult.passwordField);
    await pause(200);
    expect(textOf(pw), '');
  });

  testWidgets('a normal edit control is not mistaken for a password field', (
    t,
  ) async {
    final os = WindowsOs();
    final edit = makeEdit();
    addTearDown(() => w.destroyWindow(edit));
    expect(await bringToFront(edit), isTrue);
    expect(os.focusedIsPassword(), isFalse);
    expect(os.isElevatedWindow(edit), isFalse);
    expect(foregroundAppId(), isNotNull);
  });

  testWidgets(
    'real low-level hook: hold, tap, double-tap, Esc, undo and profile hotkeys',
    (t) async {
      final log = <String>[];
      final mgr = HotkeyManager(
        gestures: HotkeyGestures(
          onStart: () => log.add('start'),
          onStop: () => log.add('stop'),
          onCancel: () => log.add('cancel'),
        ),
        onUndo: () => log.add('undo'),
        onCycleProfile: () => log.add('cycle'),
      );
      final hook = KeyboardHook(mgr)..install();
      addTearDown(hook.uninstall);
      expect(hook.installed, isTrue);
      await pause(200);

      // hold = talk, release = insert
      inject(w.kVkF9, down: true);
      await pause(700);
      inject(w.kVkF9, down: false);
      await pause(300);
      expect(log, ['start', 'stop']);

      // lone short tap is ignored (cancelled after the double-tap window)
      log.clear();
      await tap(w.kVkF9, holdMs: 60);
      await pause(900);
      expect(log, ['start', 'cancel']);

      // double-tap = hands-free; a later tap stops
      log.clear();
      await tap(w.kVkF9, holdMs: 60);
      await pause(100);
      await tap(w.kVkF9, holdMs: 60);
      await pause(700);
      expect(log, ['start'], reason: 'still listening hands-free');
      await tap(w.kVkF9, holdMs: 60);
      await pause(300);
      expect(log, ['start', 'stop']);

      // Esc cancels while holding
      log.clear();
      inject(w.kVkF9, down: true);
      await pause(500);
      await tap(w.kVkEscape);
      await pause(200);
      inject(w.kVkF9, down: false);
      await pause(300);
      expect(log, ['start', 'cancel']);

      // Ctrl+Alt+Z / Ctrl+Alt+P
      log.clear();
      inject(w.kVkControl, down: true);
      inject(w.kVkMenu, down: true);
      await tap(w.kVkZ);
      await tap(w.kVkP);
      inject(w.kVkMenu, down: false);
      inject(w.kVkControl, down: false);
      await pause(300);
      expect(log, ['undo', 'cycle']);
    },
  );

  testWidgets('F9 is swallowed: the focused app never receives it', (t) async {
    final mgr = HotkeyManager(
      gestures: HotkeyGestures(onStart: () {}, onStop: () {}, onCancel: () {}),
      onUndo: () {},
      onCycleProfile: () {},
    );
    final hook = KeyboardHook(mgr)..install();
    addTearDown(hook.uninstall);
    final edit = makeEdit();
    addTearDown(() => w.destroyWindow(edit));
    expect(await bringToFront(edit), isTrue);
    await tap(w.kVkF9, holdMs: 400);
    await tap(0x41); // 'A' passes through
    await pause(1200); // let the lone-tap timer settle
    expect(textOf(edit), 'a', reason: 'A reached the app; F9 did not');
  });

  testWidgets(
    'status pill: click-through, no-activate, topmost, bottom-centre, never steals focus',
    (t) async {
      final assets = await AppAssets.load();
      final c = AppController(assets);
      addTearDown(c.dispose);
      final edit = makeEdit();
      addTearDown(() => w.destroyWindow(edit));
      expect(await bringToFront(edit), isTrue);
      final fgBefore = w.getForegroundWindow();

      final pill = PillWindow(c)..create();
      addTearDown(pill.dispose);
      expect(pill.hwnd, isNot(0));
      final ex = w.getWindowLongPtr(pill.hwnd, -20 /*GWL_EXSTYLE*/);
      for (final flag in [0x80000, 0x20, 0x08000000, 0x8]) {
        expect(ex & flag, flag, reason: 'ex-style 0x${flag.toRadixString(16)}');
      }
      expect(w.isWindowVisible(pill.hwnd), 0, reason: 'hidden while idle');

      final shots = <String>[];
      Future<void> check(String label) async {
        await pause(1100); // time for the CI screenshotter
        expect(w.isWindowVisible(pill.hwnd), isNot(0), reason: label);
        expect(
          w.getForegroundWindow(),
          fgBefore,
          reason: '$label: focus must not move',
        );
        shots.add(label);
      }

      c.startListening();
      await check('listening');
      c.startProcessing();
      await check('processing');
      c.markInserted('forty two words');
      await check('inserted');
      c.showNotice(NoticeKind.insertFailed);
      await check('notice');

      // geometry: horizontally centred, 24 px (DPI-scaled) above the work area bottom
      final r = calloc<Uint8>(16);
      final wa = calloc<Uint8>(16);
      w.getWindowRect(pill.hwnd, r);
      w.systemParametersInfo(0x30, 0, wa, 0);
      final rb = ByteData.sublistView(r.asTypedList(16)),
          ab = ByteData.sublistView(wa.asTypedList(16));
      final left = rb.getInt32(0, Endian.little),
          right = rb.getInt32(8, Endian.little);
      final bottom = rb.getInt32(12, Endian.little);
      final aLeft = ab.getInt32(0, Endian.little),
          aRight = ab.getInt32(8, Endian.little);
      final aBottom = ab.getInt32(12, Endian.little);
      calloc.free(r);
      calloc.free(wa);
      final centre = (left + right) / 2, areaCentre = (aLeft + aRight) / 2;
      expect((centre - areaCentre).abs(), lessThanOrEqualTo(2));
      final gap = aBottom - bottom;
      expect(gap, closeTo(24 * w.getDpiForSystem() / 96, 3));

      c.reset();
      await pause(300);
      expect(w.isWindowVisible(pill.hwnd), 0, reason: 'hides again when idle');
      expect(w.getForegroundWindow(), fgBefore);
      // ignore: avoid_print
      print('PILL_STATES_SHOWN ${shots.join(',')} gap=$gap');
    },
  );
}
