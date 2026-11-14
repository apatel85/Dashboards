import 'dart:async';
import 'dart:ffi';
import 'dart:typed_data';

import 'package:ffi/ffi.dart';

import 'insertion.dart';
import 'win32.dart' as w;

/// Real Win32 implementation of [InsertionOs] (spec §10.1).
class WindowsOs implements InsertionOs {
  WindowsOs()
    : _selfElevated = _isProcessElevated(
        w.getCurrentProcess(),
        ownHandle: true,
      );
  final bool _selfElevated;

  // Clipboard formats that are GDI handles or owner-drawn: not copyable as bytes.
  static bool _copyable(int f) =>
      f != w.kCfBitmap &&
      f != w.kCfMetafilePict &&
      f != w.kCfPalette &&
      f != w.kCfEnhMetafile &&
      !(f >= 0x80 && f <= 0x8F) && // owner-display / DSP formats
      !(f >= 0x200 && f <= 0x2FF) && // private GDI object range
      !(f >= 0x300 && f <= 0x3FF);

  @override
  int foregroundWindow() => w.getForegroundWindow();

  @override
  bool isElevatedWindow(int hwnd) {
    if (_selfElevated) return false; // we are admin too: UIPI does not block us
    final pid = calloc<Uint32>();
    try {
      w.getWindowThreadProcessId(hwnd, pid);
      final h = w.openProcess(
        0x1000 /*QUERY_LIMITED_INFORMATION*/,
        0,
        pid.value,
      );
      if (h == 0) {
        return false; // cannot tell; attempt anyway, failure is reported later
      }
      try {
        return _isProcessElevated(h);
      } finally {
        w.closeHandle(h);
      }
    } finally {
      calloc.free(pid);
    }
  }

  static bool _isProcessElevated(int process, {bool ownHandle = false}) {
    final tok = calloc<IntPtr>();
    final info = calloc<Uint8>(4);
    final len = calloc<Uint32>();
    try {
      if (w.openProcessToken(process, 0x8 /*TOKEN_QUERY*/, tok) == 0) {
        return false;
      }
      try {
        if (w.getTokenInformation(
              tok.value,
              20 /*TokenElevation*/,
              info,
              4,
              len,
            ) ==
            0) {
          return false;
        }
        return info.asTypedList(4)[0] != 0;
      } finally {
        w.closeHandle(tok.value);
      }
    } finally {
      calloc.free(tok);
      calloc.free(info);
      calloc.free(len);
    }
  }

  /// Detects classic Win32 `EDIT` controls with ES_PASSWORD. Browser / UIA password
  /// fields are NOT detected (documented limitation; see AGENTLOG).
  @override
  bool focusedIsPassword() {
    final gti = calloc<Uint8>(72);
    final cls = calloc<Uint16>(64).cast<Utf16>();
    try {
      gti.cast<Uint32>().value = 72; // cbSize
      if (w.getGuiThreadInfo(0, gti) == 0) return false;
      final hwndFocus = ByteData.sublistView(gti.asTypedList(72))
          .getInt64(16, Endian.little);
      if (hwndFocus == 0) return false;
      final n = w.getClassName(hwndFocus, cls, 64);
      if (n <= 0 || cls.toDartString(length: n).toLowerCase() != 'edit') {
        return false;
      }
      return (w.getWindowLongPtr(hwndFocus, -16 /*GWL_STYLE*/) &
              0x20 /*ES_PASSWORD*/ ) !=
          0;
    } finally {
      calloc.free(gti);
      calloc.free(cls);
    }
  }

  Future<bool> _open() async {
    for (var i = 0; i < 20; i++) {
      if (w.openClipboard(0) != 0) return true;
      await Future<void>.delayed(const Duration(milliseconds: 25));
    }
    return false;
  }

  @override
  Future<ClipboardSnapshot> snapshotClipboard() async {
    final entries = <ClipboardEntry>[];
    if (!await _open()) return const ClipboardSnapshot([]);
    try {
      var f = 0;
      while ((f = w.enumClipboardFormats(f)) != 0) {
        if (!_copyable(f)) continue;
        final h = w.getClipboardData(f);
        if (h == 0) continue; // delayed-render the owner did not supply: skip
        final size = w.globalSize(h);
        if (size <= 0) continue;
        final p = w.globalLock(h);
        if (p.address == 0) continue;
        entries.add(ClipboardEntry(f, Uint8List.fromList(p.asTypedList(size))));
        w.globalUnlock(h);
      }
    } finally {
      w.closeClipboard();
    }
    return ClipboardSnapshot(entries);
  }

  int _alloc(Uint8List bytes) {
    final h = w.globalAlloc(w.kGmemMoveable, bytes.isEmpty ? 1 : bytes.length);
    final p = w.globalLock(h);
    p.asTypedList(bytes.length).setAll(0, bytes);
    w.globalUnlock(h);
    return h;
  }

  static Uint8List _utf16z(String s) {
    final b = BytesBuilder();
    for (final u in s.codeUnits) {
      b
        ..addByte(u & 0xFF)
        ..addByte(u >> 8);
    }
    b.add([0, 0]);
    return b.toBytes();
  }

  static int _regFormat(String name) {
    final p = name.toNativeUtf16();
    try {
      return w.registerClipboardFormat(p);
    } finally {
      calloc.free(p);
    }
  }

  @override
  Future<bool> setClipboardText(String text) async {
    if (!await _open()) return false;
    try {
      w.emptyClipboard();
      if (w.setClipboardData(w.kCfUnicodeText, _alloc(_utf16z(text))) == 0) {
        return false;
      }
      // Keep dictation out of Win+V history, cloud sync and clipboard monitors.
      w.setClipboardData(
        _regFormat('ExcludeClipboardContentFromMonitorProcessing'),
        _alloc(Uint8List(4)),
      );
      w.setClipboardData(
        _regFormat('CanIncludeInClipboardHistory'),
        _alloc(Uint8List(4)),
      );
      w.setClipboardData(
        _regFormat('CanUploadToCloudClipboard'),
        _alloc(Uint8List(4)),
      );
      return true;
    } finally {
      w.closeClipboard();
    }
  }

  @override
  Future<void> restoreClipboard(ClipboardSnapshot s) async {
    if (!await _open()) return;
    try {
      w.emptyClipboard();
      for (final e in s.entries) {
        w.setClipboardData(e.format, _alloc(e.bytes));
      }
    } finally {
      w.closeClipboard();
    }
  }

  // ---- input injection (tagged so our own hook ignores it)

  static void _key(
    ByteData b,
    int i, {
    int vk = 0,
    int scan = 0,
    int flags = 0,
  }) {
    final o = i * w.kInputSizeX64;
    b.setUint32(o, w.kInputKeyboard, Endian.little);
    b.setUint16(o + 8, vk, Endian.little);
    b.setUint16(o + 10, scan, Endian.little);
    b.setUint32(o + 12, flags, Endian.little);
    b.setUint32(o + 16, 0, Endian.little); // time
    b.setInt64(o + 24, w.kOurTag, Endian.little); // dwExtraInfo
  }

  static int _send(void Function(ByteData b) fill, int count) {
    final buf = calloc<Uint8>(count * w.kInputSizeX64);
    try {
      final bd = ByteData.sublistView(buf.asTypedList(count * w.kInputSizeX64));
      fill(bd);
      return w.sendInput(count, buf, w.kInputSizeX64);
    } finally {
      calloc.free(buf);
    }
  }

  /// Physically-held modifiers would turn Ctrl+V into Ctrl+Alt+V, Backspace into
  /// Ctrl+Alt+Backspace, etc.: lift them, run [body], put them back.
  T _withModifiersReleased<T>(T Function() body) {
    final held = [
      for (final vk in [w.kVkControl, w.kVkMenu, w.kVkShift, w.kVkLWin])
        if (w.getAsyncKeyState(vk) & 0x8000 != 0) vk,
    ];
    if (held.isNotEmpty) {
      _send((b) {
        for (var i = 0; i < held.length; i++) {
          _key(b, i, vk: held[i], flags: w.kKeyeventfKeyup);
        }
      }, held.length);
    }
    try {
      return body();
    } finally {
      if (held.isNotEmpty) {
        _send((b) {
          for (var i = 0; i < held.length; i++) {
            _key(b, i, vk: held[i]);
          }
        }, held.length);
      }
    }
  }

  @override
  int sendPaste() => _withModifiersReleased(
    () => _send((b) {
      _key(b, 0, vk: w.kVkControl);
      _key(b, 1, vk: w.kVkV);
      _key(b, 2, vk: w.kVkV, flags: w.kKeyeventfKeyup);
      _key(b, 3, vk: w.kVkControl, flags: w.kKeyeventfKeyup);
    }, 4),
  );

  @override
  int sendBackspaces(int n) => _withModifiersReleased(
    () => _send((b) {
      for (var i = 0; i < n; i++) {
        _key(b, i * 2, vk: w.kVkBack);
        _key(b, i * 2 + 1, vk: w.kVkBack, flags: w.kKeyeventfKeyup);
      }
    }, n * 2),
  );

  @override
  int sendUnicode(String text) {
    final units = text.codeUnits;
    return _withModifiersReleased(
      () => _send((b) {
        for (var i = 0; i < units.length; i++) {
          _key(b, i * 2, scan: units[i], flags: w.kKeyeventfUnicode);
          _key(
            b,
            i * 2 + 1,
            scan: units[i],
            flags: w.kKeyeventfUnicode | w.kKeyeventfKeyup,
          );
        }
      }, units.length * 2),
    );
  }
}

/// Foreground application id (exe name, lower-case) for per-app profile memory.
String? foregroundAppId() {
  final hwnd = w.getForegroundWindow();
  if (hwnd == 0) return null;
  final pid = calloc<Uint32>();
  try {
    w.getWindowThreadProcessId(hwnd, pid);
    final h = w.openProcess(0x1000, 0, pid.value);
    if (h == 0) return null;
    final buf = calloc<Uint16>(1024).cast<Utf16>();
    final len = calloc<Uint32>()..value = 1024;
    try {
      if (w.queryFullProcessImageName(h, 0, buf, len) == 0) return null;
      final path = buf.toDartString(length: len.value);
      return path.split(RegExp(r'[\\/]')).last.toLowerCase();
    } finally {
      calloc.free(buf);
      calloc.free(len);
      w.closeHandle(h);
    }
  } finally {
    calloc.free(pid);
  }
}
