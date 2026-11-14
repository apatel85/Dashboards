import 'dart:ffi';
import 'dart:io';

import 'package:ffi/ffi.dart';

import 'win32.dart' as w;

/// Start at login via HKCU\Software\Microsoft\Windows\CurrentVersion\Run (spec §10.1).
/// Per-user, no admin rights. [valueName] is injectable so tests never touch the real entry.
class Autostart {
  Autostart({this.valueName = 'VoiceFlow', String? exePath})
    : exePath = exePath ?? Platform.resolvedExecutable;
  final String valueName, exePath;
  static const _key = r'Software\Microsoft\Windows\CurrentVersion\Run';

  /// The command stored in the registry (quoted: paths may contain spaces).
  String get command => '"$exePath" --background';

  bool get enabled => value != null;

  String? get value {
    final key = _key.toNativeUtf16(), name = valueName.toNativeUtf16();
    final size = calloc<Uint32>()..value = 4096;
    final buf = calloc<Uint8>(4096);
    try {
      if (w.regGetValue(
            w.kHkeyCurrentUser,
            key,
            name,
            w.kRrfRtRegSz,
            nullptr,
            buf,
            size,
          ) !=
          0) {
        return null;
      }
      final units = buf.cast<Uint16>().asTypedList(size.value ~/ 2);
      final end = units.indexOf(0);
      return String.fromCharCodes(end < 0 ? units : units.sublist(0, end));
    } finally {
      calloc
        ..free(key)
        ..free(name)
        ..free(size)
        ..free(buf);
    }
  }

  bool set(bool on) {
    final key = _key.toNativeUtf16(), name = valueName.toNativeUtf16();
    try {
      if (!on) {
        final r = w.regDeleteKeyValue(w.kHkeyCurrentUser, key, name);
        return r == 0 || r == 2; // 2 = already absent
      }
      final data = command.toNativeUtf16();
      try {
        final bytes = (command.length + 1) * 2;
        return w.regSetKeyValue(
              w.kHkeyCurrentUser,
              key,
              name,
              w.kRegSz,
              data.cast<Uint8>(),
              bytes,
            ) ==
            0;
      } finally {
        calloc.free(data);
      }
    } finally {
      calloc
        ..free(key)
        ..free(name);
    }
  }
}

/// One VoiceFlow per user session: a named mutex held for the process lifetime.
class SingleInstance {
  SingleInstance._(this._handle);
  final int _handle;

  /// Returns null when another instance already holds [name].
  static SingleInstance? acquire(String name) {
    final n = name.toNativeUtf16();
    try {
      // OpenMutex first: GetLastError is unreliable across FFI calls.
      final existing = w.openMutex(0x100000 /*SYNCHRONIZE*/, 0, n);
      if (existing != 0) {
        w.closeHandle(existing);
        return null;
      }
      final h = w.createMutex(nullptr, 0, n);
      return h == 0 ? null : SingleInstance._(h);
    } finally {
      calloc.free(n);
    }
  }

  void release() => w.closeHandle(_handle);
}
