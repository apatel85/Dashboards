import 'dart:typed_data';

import 'package:characters/characters.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

/// One clipboard format's raw bytes (memory formats only; GDI handles are skipped).
class ClipboardEntry {
  final int format;
  final Uint8List bytes;
  const ClipboardEntry(this.format, this.bytes);
}

class ClipboardSnapshot {
  final List<ClipboardEntry> entries;
  const ClipboardSnapshot(this.entries);
}

/// Everything the insertion logic needs from the OS (faked in unit tests; the
/// real implementation uses Win32 and lives in `windows_os.dart`).
abstract class InsertionOs {
  /// HWND of the foreground window as an int; 0 if none.
  int foregroundWindow();

  /// True when [hwnd]'s process is elevated and ours is not (UIPI blocks our input).
  bool isElevatedWindow(int hwnd);

  /// True when keyboard focus is in a password field we can detect.
  bool focusedIsPassword();

  Future<ClipboardSnapshot> snapshotClipboard();

  /// Puts [text] on the clipboard, excluded from Win+V history and cloud sync.
  Future<bool> setClipboardText(String text);
  Future<void> restoreClipboard(ClipboardSnapshot s);

  /// Sends Ctrl+V; returns how many of the 4 key events the OS accepted.
  int sendPaste();

  /// Backspace [n] times; returns events accepted (2 per key expected).
  int sendBackspaces(int n);

  /// Types [text] with KEYEVENTF_UNICODE; returns events accepted.
  int sendUnicode(String text);
}

/// Spec §10.1: snapshot clipboard -> write text (history-excluded) -> Ctrl+V ->
/// restore after 300 ms -> fall back to Unicode typing if paste cannot be sent.
/// Undo (Appendix C): last insertion only, once, same window, within 30 s.
class WindowsTextSink implements TextSink {
  WindowsTextSink(
    this.os, {
    this.restoreDelay = const Duration(milliseconds: 300),
    this.undoWindow = const Duration(seconds: 30),
    DateTime Function()? now,
  }) : _now = now ?? DateTime.now;

  final InsertionOs os;
  final Duration restoreDelay, undoWindow;
  final DateTime Function() _now;

  int? _lastHwnd;
  DateTime? _lastAt;
  int _lastGraphemes = 0;

  @override
  Future<InsertResult> insert(String text) async {
    if (text.isEmpty) return InsertResult.ok;
    if (os.focusedIsPassword()) return InsertResult.passwordField;
    final hwnd = os.foregroundWindow();
    if (hwnd == 0) return InsertResult.failed;
    if (os.isElevatedWindow(hwnd)) return InsertResult.elevatedTarget;

    final snap = await os.snapshotClipboard();
    var ok = false;
    if (await os.setClipboardText(text) && os.sendPaste() == 4) {
      await Future<void>.delayed(restoreDelay);
      ok = true;
    }
    await os.restoreClipboard(
      snap,
    ); // always give the user their clipboard back
    if (!ok) {
      // Paste could not be sent (or the clipboard was locked): type it instead.
      ok = os.sendUnicode(text) == text.codeUnits.length * 2;
    }
    if (!ok) return InsertResult.failed;

    _lastHwnd = hwnd;
    _lastAt = _now();
    _lastGraphemes = text.characters.length; // one Backspace per grapheme
    return InsertResult.ok;
  }

  @override
  Future<void> undoLast() async {
    final at = _lastAt, hwnd = _lastHwnd;
    if (at == null || hwnd == null) return;
    final same = os.foregroundWindow() == hwnd;
    final fresh = _now().difference(at) <= undoWindow;
    _lastAt = _lastHwnd = null; // single use, win or lose
    if (!same || !fresh || _lastGraphemes == 0) return;
    os.sendBackspaces(_lastGraphemes);
  }
}
