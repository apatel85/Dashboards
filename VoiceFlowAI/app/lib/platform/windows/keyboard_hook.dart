import 'dart:ffi';

import 'package:ffi/ffi.dart';

import 'hotkey_manager.dart';
import 'win32.dart' as w;

typedef _HookProc = IntPtr Function(Int32 nCode, IntPtr wParam, IntPtr lParam);

/// System-wide low-level keyboard hook (WH_KEYBOARD_LL) feeding [HotkeyManager].
/// The callback runs on the thread that installed the hook (Flutter's platform
/// thread, which pumps messages), so it must return quickly.
class KeyboardHook {
  KeyboardHook(this.manager);
  final HotkeyManager manager;
  NativeCallable<_HookProc>? _callable;
  int _hook = 0;

  bool get installed => _hook != 0;

  void install() {
    if (installed) return;
    final c = _callable = NativeCallable<_HookProc>.isolateLocal(
      _proc,
      exceptionalReturn: 0,
    );
    final hMod = w.getModuleHandle(nullptr.cast<Utf16>());
    _hook = w.setWindowsHookEx(w.kWhKeyboardLl, c.nativeFunction, hMod, 0);
    if (_hook == 0) {
      c.close();
      _callable = null;
      throw StateError('SetWindowsHookEx failed');
    }
  }

  int _proc(int nCode, int wParam, int lParam) {
    if (nCode == 0 /*HC_ACTION*/ ) {
      final p = Pointer<Uint32>.fromAddress(lParam);
      final vk = p[0];
      final extra = Pointer<Int64>.fromAddress(lParam + 16).value;
      final down = wParam == w.kWmKeyDown || wParam == w.kWmSysKeyDown;
      final up = wParam == w.kWmKeyUp || wParam == w.kWmSysKeyUp;
      if (down || up) {
        final consumed = manager.onKey(
          vk: vk,
          down: down,
          ctrl: w.getAsyncKeyState(w.kVkControl) & 0x8000 != 0,
          alt: w.getAsyncKeyState(w.kVkMenu) & 0x8000 != 0,
          ours: extra == w.kOurTag,
        );
        if (consumed) return 1;
      }
    }
    return w.callNextHookEx(0, nCode, wParam, lParam);
  }

  void uninstall() {
    if (_hook != 0) w.unhookWindowsHookEx(_hook);
    _hook = 0;
    _callable?.close();
    _callable = null;
  }
}
