// Thin dart:ffi bindings to the few Win32 calls VoiceFlow needs (x64 layouts).
// Lookups are lazy so importing this file on other platforms is harmless; nothing
// here may be CALLED off Windows.
import 'dart:ffi';

import 'package:ffi/ffi.dart';

final DynamicLibrary _user32 = DynamicLibrary.open('user32.dll');
final DynamicLibrary _kernel32 = DynamicLibrary.open('kernel32.dll');
final DynamicLibrary _gdi32 = DynamicLibrary.open('gdi32.dll');
final DynamicLibrary _advapi32 = DynamicLibrary.open('advapi32.dll');

// ---- constants
const kWhKeyboardLl = 13;
const kWmKeyDown = 0x100,
    kWmKeyUp = 0x101,
    kWmSysKeyDown = 0x104,
    kWmSysKeyUp = 0x105;
const kWmPaint = 0x000F, kWmNcHitTest = 0x0084, kHtTransparent = -1;
const kVkEscape = 0x1B, kVkControl = 0x11, kVkMenu = 0x12, kVkShift = 0x10;
const kVkLWin = 0x5B,
    kVkBack = 0x08,
    kVkV = 0x56,
    kVkZ = 0x5A,
    kVkP = 0x50,
    kVkF9 = 0x78;
const kInputKeyboard = 1;
const kKeyeventfKeyup = 2, kKeyeventfUnicode = 4;
const kLlkhfInjected = 0x10;
const kCfText = 1,
    kCfBitmap = 2,
    kCfMetafilePict = 3,
    kCfPalette = 9,
    kCfEnhMetafile = 14;
const kCfUnicodeText = 13;
const kGmemMoveable = 2;
const kInputSizeX64 = 40;

/// Marks input WE inject so our own hook ignores it ("VFLW").
const kOurTag = 0x56464C57;

// ---- user32
final int Function(int, Pointer, int, int) setWindowsHookEx = _user32
    .lookupFunction<
      IntPtr Function(Int32, Pointer, IntPtr, Uint32),
      int Function(int, Pointer, int, int)
    >('SetWindowsHookExW');
final int Function(int) unhookWindowsHookEx = _user32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
      'UnhookWindowsHookEx',
    );
final int Function(int, int, int, int) callNextHookEx = _user32
    .lookupFunction<
      IntPtr Function(IntPtr, Int32, IntPtr, IntPtr),
      int Function(int, int, int, int)
    >('CallNextHookEx');
final int Function(int, Pointer<Uint8>, int) sendInput = _user32
    .lookupFunction<
      Uint32 Function(Uint32, Pointer<Uint8>, Int32),
      int Function(int, Pointer<Uint8>, int)
    >('SendInput');
final int Function(int) getAsyncKeyState = _user32
    .lookupFunction<Int16 Function(Int32), int Function(int)>(
      'GetAsyncKeyState',
    );
final int Function() getForegroundWindow = _user32
    .lookupFunction<IntPtr Function(), int Function()>('GetForegroundWindow');
final int Function(int) setForegroundWindow = _user32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
      'SetForegroundWindow',
    );
final int Function(int) setFocus = _user32
    .lookupFunction<IntPtr Function(IntPtr), int Function(int)>('SetFocus');
final int Function(int, Pointer<Uint32>) getWindowThreadProcessId = _user32
    .lookupFunction<
      Uint32 Function(IntPtr, Pointer<Uint32>),
      int Function(int, Pointer<Uint32>)
    >('GetWindowThreadProcessId');
final int Function(int, Pointer<Uint8>) getGuiThreadInfo = _user32
    .lookupFunction<
      Int32 Function(Uint32, Pointer<Uint8>),
      int Function(int, Pointer<Uint8>)
    >('GetGUIThreadInfo');
final int Function(int, Pointer<Utf16>, int) getClassName = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Utf16>, Int32),
      int Function(int, Pointer<Utf16>, int)
    >('GetClassNameW');
final int Function(int, Pointer<Utf16>, int) getWindowText = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Utf16>, Int32),
      int Function(int, Pointer<Utf16>, int)
    >('GetWindowTextW');
final int Function(int, Pointer<Utf16>) setWindowText = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Utf16>),
      int Function(int, Pointer<Utf16>)
    >('SetWindowTextW');
final int Function(int, int) getWindowLongPtr = _user32
    .lookupFunction<IntPtr Function(IntPtr, Int32), int Function(int, int)>(
      'GetWindowLongPtrW',
    );
final int Function(int) isWindowVisible = _user32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>(
      'IsWindowVisible',
    );
final int Function(int, Pointer<Uint8>) getWindowRect = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Uint8>),
      int Function(int, Pointer<Uint8>)
    >('GetWindowRect');
final int Function(int, int) showWindow = _user32
    .lookupFunction<Int32 Function(IntPtr, Int32), int Function(int, int)>(
      'ShowWindow',
    );
final int Function(int) destroyWindow = _user32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>('DestroyWindow');
final int Function(int, int, int, int, int, int, int) setWindowPos = _user32
    .lookupFunction<
      Int32 Function(IntPtr, IntPtr, Int32, Int32, Int32, Int32, Uint32),
      int Function(int, int, int, int, int, int, int)
    >('SetWindowPos');
final int Function(int, Pointer, int) invalidateRect = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer, Int32),
      int Function(int, Pointer, int)
    >('InvalidateRect');
final int Function(int, int, int, int) setLayeredWindowAttributes = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Uint32, Uint8, Uint32),
      int Function(int, int, int, int)
    >('SetLayeredWindowAttributes');
final int Function(int, int, int) setWindowRgn = _user32
    .lookupFunction<
      Int32 Function(IntPtr, IntPtr, Int32),
      int Function(int, int, int)
    >('SetWindowRgn');
final int Function(int, Pointer<Uint8>) beginPaint = _user32
    .lookupFunction<
      IntPtr Function(IntPtr, Pointer<Uint8>),
      int Function(int, Pointer<Uint8>)
    >('BeginPaint');
final int Function(int, Pointer<Uint8>) endPaint = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Uint8>),
      int Function(int, Pointer<Uint8>)
    >('EndPaint');
final int Function(int, Pointer<Uint8>) getClientRect = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Uint8>),
      int Function(int, Pointer<Uint8>)
    >('GetClientRect');
final int Function(int, Pointer<Uint8>, int) fillRect = _user32
    .lookupFunction<
      Int32 Function(IntPtr, Pointer<Uint8>, IntPtr),
      int Function(int, Pointer<Uint8>, int)
    >('FillRect');
final int Function(int, Pointer<Utf16>, int, Pointer<Uint8>, int) drawText =
    _user32.lookupFunction<
      Int32 Function(IntPtr, Pointer<Utf16>, Int32, Pointer<Uint8>, Uint32),
      int Function(int, Pointer<Utf16>, int, Pointer<Uint8>, int)
    >('DrawTextW');
final int Function(int, int, Pointer<Uint8>, int) systemParametersInfo = _user32
    .lookupFunction<
      Int32 Function(Uint32, Uint32, Pointer<Uint8>, Uint32),
      int Function(int, int, Pointer<Uint8>, int)
    >('SystemParametersInfoW');
final int Function() getDpiForSystem = _user32
    .lookupFunction<Uint32 Function(), int Function()>('GetDpiForSystem');
final int Function(Pointer<Uint8>) registerClassEx = _user32
    .lookupFunction<
      Uint16 Function(Pointer<Uint8>),
      int Function(Pointer<Uint8>)
    >('RegisterClassExW');
final int Function(
  int,
  Pointer<Utf16>,
  Pointer<Utf16>,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
)
createWindowEx = _user32
    .lookupFunction<
      IntPtr Function(
        Uint32,
        Pointer<Utf16>,
        Pointer<Utf16>,
        Uint32,
        Int32,
        Int32,
        Int32,
        Int32,
        IntPtr,
        IntPtr,
        IntPtr,
        IntPtr,
      ),
      int Function(
        int,
        Pointer<Utf16>,
        Pointer<Utf16>,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
      )
    >('CreateWindowExW');
final int Function(int, int, int, int) defWindowProc = _user32
    .lookupFunction<
      IntPtr Function(IntPtr, Uint32, IntPtr, IntPtr),
      int Function(int, int, int, int)
    >('DefWindowProcW');
final int Function(int) openClipboard = _user32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>('OpenClipboard');
final int Function() closeClipboard = _user32
    .lookupFunction<Int32 Function(), int Function()>('CloseClipboard');
final int Function() emptyClipboard = _user32
    .lookupFunction<Int32 Function(), int Function()>('EmptyClipboard');
final int Function(int, int) setClipboardData = _user32
    .lookupFunction<IntPtr Function(Uint32, IntPtr), int Function(int, int)>(
      'SetClipboardData',
    );
final int Function(int) getClipboardData = _user32
    .lookupFunction<IntPtr Function(Uint32), int Function(int)>(
      'GetClipboardData',
    );
final int Function(int) enumClipboardFormats = _user32
    .lookupFunction<Uint32 Function(Uint32), int Function(int)>(
      'EnumClipboardFormats',
    );
final int Function(Pointer<Utf16>) registerClipboardFormat = _user32
    .lookupFunction<
      Uint32 Function(Pointer<Utf16>),
      int Function(Pointer<Utf16>)
    >('RegisterClipboardFormatW');

// ---- gdi32
final int Function(int) createSolidBrush = _gdi32
    .lookupFunction<IntPtr Function(Uint32), int Function(int)>(
      'CreateSolidBrush',
    );
final int Function(int) deleteObject = _gdi32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>('DeleteObject');
final int Function(int, int) selectObject = _gdi32
    .lookupFunction<IntPtr Function(IntPtr, IntPtr), int Function(int, int)>(
      'SelectObject',
    );
final int Function(int, int) setBkMode = _gdi32
    .lookupFunction<Int32 Function(IntPtr, Int32), int Function(int, int)>(
      'SetBkMode',
    );
final int Function(int, int) setTextColor = _gdi32
    .lookupFunction<Uint32 Function(IntPtr, Uint32), int Function(int, int)>(
      'SetTextColor',
    );
final int Function(int, int, int, int, int, int) createRoundRectRgn = _gdi32
    .lookupFunction<
      IntPtr Function(Int32, Int32, Int32, Int32, Int32, Int32),
      int Function(int, int, int, int, int, int)
    >('CreateRoundRectRgn');
final int Function(
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  int,
  Pointer<Utf16>,
)
createFont = _gdi32
    .lookupFunction<
      IntPtr Function(
        Int32,
        Int32,
        Int32,
        Int32,
        Int32,
        Uint32,
        Uint32,
        Uint32,
        Uint32,
        Uint32,
        Uint32,
        Uint32,
        Uint32,
        Pointer<Utf16>,
      ),
      int Function(
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        int,
        Pointer<Utf16>,
      )
    >('CreateFontW');

// ---- kernel32 / advapi32
final int Function(int, int) globalAlloc = _kernel32
    .lookupFunction<IntPtr Function(Uint32, IntPtr), int Function(int, int)>(
      'GlobalAlloc',
    );
final Pointer<Uint8> Function(int) globalLock = _kernel32
    .lookupFunction<
      Pointer<Uint8> Function(IntPtr),
      Pointer<Uint8> Function(int)
    >('GlobalLock');
final int Function(int) globalUnlock = _kernel32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>('GlobalUnlock');
final int Function(int) globalSize = _kernel32
    .lookupFunction<IntPtr Function(IntPtr), int Function(int)>('GlobalSize');
final int Function(Pointer<Utf16>) getModuleHandle = _kernel32
    .lookupFunction<
      IntPtr Function(Pointer<Utf16>),
      int Function(Pointer<Utf16>)
    >('GetModuleHandleW');
final int Function(int, int, int) openProcess = _kernel32
    .lookupFunction<
      IntPtr Function(Uint32, Int32, Uint32),
      int Function(int, int, int)
    >('OpenProcess');
final int Function(int) closeHandle = _kernel32
    .lookupFunction<Int32 Function(IntPtr), int Function(int)>('CloseHandle');
final int Function() getCurrentProcess = _kernel32
    .lookupFunction<IntPtr Function(), int Function()>('GetCurrentProcess');
final int Function(int, int, Pointer<Utf16>, Pointer<Uint32>)
queryFullProcessImageName = _kernel32
    .lookupFunction<
      Int32 Function(IntPtr, Uint32, Pointer<Utf16>, Pointer<Uint32>),
      int Function(int, int, Pointer<Utf16>, Pointer<Uint32>)
    >('QueryFullProcessImageNameW');
final int Function(int, int, Pointer<IntPtr>) openProcessToken = _advapi32
    .lookupFunction<
      Int32 Function(IntPtr, Uint32, Pointer<IntPtr>),
      int Function(int, int, Pointer<IntPtr>)
    >('OpenProcessToken');
final int Function(int, int, Pointer<Uint8>, int, Pointer<Uint32>)
getTokenInformation = _advapi32
    .lookupFunction<
      Int32 Function(IntPtr, Int32, Pointer<Uint8>, Uint32, Pointer<Uint32>),
      int Function(int, int, Pointer<Uint8>, int, Pointer<Uint32>)
    >('GetTokenInformation');

final int Function(int, int, int) attachThreadInput = _user32
    .lookupFunction<
      Int32 Function(Uint32, Uint32, Int32),
      int Function(int, int, int)
    >('AttachThreadInput');
final int Function() getCurrentThreadId = _kernel32
    .lookupFunction<Uint32 Function(), int Function()>('GetCurrentThreadId');
