import 'dart:async';
import 'dart:ffi';
import 'dart:typed_data';
import 'dart:ui' show Locale;

import 'package:ffi/ffi.dart';

import '../../l10n/app_localizations.dart';
import '../../state/app_controller.dart';
import '../../state/dictation_state.dart';
import 'win32.dart' as w;

typedef _WndProc = IntPtr Function(
  IntPtr hwnd,
  Uint32 msg,
  IntPtr wParam,
  IntPtr lParam,
);

/// What the pill shows (pure; unit-tested).
class PillContent {
  final String text;
  final int bg, fg; // 0xRRGGBB
  const PillContent(this.text, this.bg, this.fg);
}

const _dark = 0x1F2937, _white = 0xFFFFFF, _indigo = 0x4F46E5;
const _amber = 0xFFF3CD, _amberText = 0x5C4400;

/// Spec §9.2 states. Every state has a glyph AND words (never colour alone).
/// Returns null when the pill should be hidden.
PillContent? pillContent(AppController c, AppLocalizations t) {
  final flash = c.flashText;
  switch (c.state) {
    case DictationUiState.idle:
      return flash == null ? null : PillContent(flash, _dark, _white);
    case DictationUiState.listening:
      final s = c.listeningFor.elapsed.inSeconds;
      final mm = (s ~/ 60).toString().padLeft(2, '0');
      final ss = (s % 60).toString().padLeft(2, '0');
      return PillContent(
        '●  ${t.stateListening}  $mm:$ss  ·  ${c.profile.name}',
        _indigo,
        _white,
      );
    case DictationUiState.processing:
      return PillContent('◌  ${t.stateProcessing}', _dark, _white);
    case DictationUiState.polishing:
      return PillContent('◌  ${t.statePolishing}', _dark, _white);
    case DictationUiState.inserted:
      return PillContent(
        '${t.stateInserted(c.lastWordCount)}  ·  ${t.undo}: Ctrl+Alt+Z',
        _dark,
        _white,
      );
    case DictationUiState.notice:
      final k = c.notice!;
      final text = switch (k) {
        NoticeKind.noSpeech => t.noticeNoSpeech,
        NoticeKind.noMicrophone => t.noticeNoMicrophone,
        NoticeKind.modelMissing => t.noticeModelMissing,
        NoticeKind.insertFailed => t.noticeInsertFailed,
        NoticeKind.adminWindow => t.noticeAdminWindow,
        NoticeKind.passwordField => t.noticePasswordField,
        NoticeKind.cloudLimit => t.noticeCloudLimit,
      };
      return PillContent('⚠  $text', _amber, _amberText);
  }
}

/// The status pill: a native layered window, always on top, click-through and
/// NEVER activated (spec §9.3 / §10.1), so it cannot steal focus from the app you
/// are typing in. Painted with GDI. Bottom centre, 24 px above the taskbar.
class PillWindow {
  PillWindow(this.controller) : t = lookupAppLocalizations(const Locale('en'));
  final AppController controller;
  final AppLocalizations t;

  static const exStyle =
      0x80000 /*LAYERED*/ |
      0x20 /*TRANSPARENT*/ |
      0x08000000 /*NOACTIVATE*/ |
      0x8 /*TOPMOST*/ |
      0x80 /*TOOLWINDOW*/;

  int hwnd = 0;
  PillContent? _shown;
  NativeCallable<_WndProc>? _proc;
  Timer? _tick;
  static int _classSeq = 0;

  void create() {
    if (hwnd != 0) return;
    final cls = 'VoiceFlowPill${_classSeq++}'.toNativeUtf16();
    final wc = calloc<Uint8>(80);
    try {
      final c = _proc = NativeCallable<_WndProc>.isolateLocal(
        _wndProc,
        exceptionalReturn: 0,
      );
      final bd = wc.asTypedList(80).buffer.asByteData();
      bd.setUint32(0, 80, Endian.little); // cbSize
      bd.setInt64(8, c.nativeFunction.address, Endian.little); // lpfnWndProc
      bd.setInt64(24, w.getModuleHandle(nullptr.cast<Utf16>()), Endian.little);
      bd.setInt64(64, cls.address, Endian.little); // lpszClassName
      w.registerClassEx(wc);
      hwnd = w.createWindowEx(
        exStyle,
        cls,
        nullptr.cast<Utf16>(),
        0x80000000 /*WS_POPUP*/,
        0,
        0,
        10,
        10,
        0,
        0,
        w.getModuleHandle(nullptr.cast<Utf16>()),
        0,
      );
    } finally {
      calloc.free(wc);
    }
    if (hwnd == 0) throw StateError('could not create the status pill window');
    w.setLayeredWindowAttributes(hwnd, 0, 235, 2 /*LWA_ALPHA*/);
    controller.addListener(_update);
    _update();
  }

  int get _dpi => w.getDpiForSystem();
  int _px(int v) => v * _dpi ~/ 96;

  void _update() {
    if (hwnd == 0) return;
    final next = pillContent(controller, t);
    _tick?.cancel();
    if (next == null) {
      _shown = null;
      w.showWindow(hwnd, 0 /*SW_HIDE*/);
      return;
    }
    _shown = next;
    _place(next.text);
    w.showWindow(hwnd, 4 /*SW_SHOWNOACTIVATE*/);
    w.invalidateRect(hwnd, nullptr, 1);
    if (controller.state == DictationUiState.listening) {
      _tick = Timer.periodic(const Duration(seconds: 1), (_) => _update());
    }
  }

  void _place(String text) {
    final width = _px((text.length * 9 + 56).clamp(240, 640));
    final height = _px(44);
    final wa = calloc<Uint8>(16);
    try {
      w.systemParametersInfo(0x30 /*SPI_GETWORKAREA*/, 0, wa, 0);
      final r = wa.asTypedList(16).buffer.asByteData();
      final left = r.getInt32(0, Endian.little),
          right = r.getInt32(8, Endian.little);
      final bottom = r.getInt32(12, Endian.little);
      final x = left + ((right - left) - width) ~/ 2;
      final y = bottom - height - _px(24);
      // HWND_TOPMOST = -1; SWP_NOACTIVATE = 0x10, SWP_SHOWWINDOW = 0x40
      w.setWindowPos(hwnd, -1, x, y, width, height, 0x10 | 0x40);
      w.setWindowRgn(
        hwnd,
        w.createRoundRectRgn(0, 0, width + 1, height + 1, height, height),
        1,
      );
    } finally {
      calloc.free(wa);
    }
  }

  int _wndProc(int h, int msg, int wParam, int lParam) {
    switch (msg) {
      case w.kWmPaint:
        _paint(h);
        return 0;
      case w.kWmNcHitTest:
        return w.kHtTransparent;
    }
    return w.defWindowProc(h, msg, wParam, lParam);
  }

  void _paint(int h) {
    final ps = calloc<Uint8>(80);
    final rc = calloc<Uint8>(16);
    final face = 'Segoe UI'.toNativeUtf16();
    final txt = (_shown?.text ?? '').toNativeUtf16();
    try {
      final hdc = w.beginPaint(h, ps);
      w.getClientRect(h, rc);
      int bgr(int rgb) =>
          ((rgb & 0xFF) << 16) | (rgb & 0xFF00) | ((rgb >> 16) & 0xFF);
      final brush = w.createSolidBrush(bgr(_shown?.bg ?? _dark));
      w.fillRect(hdc, rc, brush);
      w.deleteObject(brush);
      final font = w.createFont(
        -_px(16),
        0,
        0,
        0,
        600,
        0,
        0,
        0,
        1,
        0,
        0,
        5 /*CLEARTYPE*/,
        0,
        face,
      );
      final old = w.selectObject(hdc, font);
      w.setBkMode(hdc, 1 /*TRANSPARENT*/);
      w.setTextColor(hdc, bgr(_shown?.fg ?? _white));
      // DT_CENTER | DT_VCENTER | DT_SINGLELINE | DT_END_ELLIPSIS
      w.drawText(hdc, txt, -1, rc, 0x1 | 0x4 | 0x20 | 0x8000);
      w.selectObject(hdc, old);
      w.deleteObject(font);
      w.endPaint(h, ps);
    } finally {
      calloc.free(ps);
      calloc.free(rc);
      calloc.free(face);
      calloc.free(txt);
    }
  }

  void dispose() {
    controller.removeListener(_update);
    _tick?.cancel();
    if (hwnd != 0) w.destroyWindow(hwnd);
    hwnd = 0;
    _proc?.close();
    _proc = null;
  }
}
