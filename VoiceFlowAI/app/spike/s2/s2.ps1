# Spike S2: SendInput paste into a test window; clipboard restored; history-exclusion formats set.
# Throwaway evidence harness (the shipped version is the C++ plugin, spec §10.1).
$ErrorActionPreference = 'Stop'
Add-Type -ReferencedAssemblies System.Windows.Forms,System.Drawing -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Windows.Forms;

public static class Native {
  [StructLayout(LayoutKind.Sequential)] public struct MOUSEINPUT { public int dx, dy; public uint mouseData, dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Sequential)] public struct KEYBDINPUT { public ushort wVk, wScan; public uint dwFlags, time; public IntPtr dwExtraInfo; }
  [StructLayout(LayoutKind.Explicit)] public struct U { [FieldOffset(0)] public MOUSEINPUT mi; [FieldOffset(0)] public KEYBDINPUT ki; }
  [StructLayout(LayoutKind.Sequential)] public struct INPUT { public uint type; public U u; }
  [DllImport("user32.dll", SetLastError=true)] public static extern uint SendInput(uint n, INPUT[] i, int size);
  [DllImport("user32.dll")] public static extern bool OpenClipboard(IntPtr h);
  [DllImport("user32.dll")] public static extern bool CloseClipboard();
  [DllImport("user32.dll")] public static extern bool EmptyClipboard();
  [DllImport("user32.dll")] public static extern IntPtr SetClipboardData(uint f, IntPtr h);
  [DllImport("user32.dll")] public static extern IntPtr GetClipboardData(uint f);
  [DllImport("user32.dll")] public static extern bool IsClipboardFormatAvailable(uint f);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern uint RegisterClipboardFormat(string s);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("kernel32.dll")] public static extern IntPtr GlobalAlloc(uint f, UIntPtr n);
  [DllImport("kernel32.dll")] public static extern IntPtr GlobalLock(IntPtr h);
  [DllImport("kernel32.dll")] public static extern bool GlobalUnlock(IntPtr h);
  const uint CF_UNICODETEXT = 13, GMEM_MOVEABLE = 2;

  static bool Open() { for (int i = 0; i < 20; i++) { if (OpenClipboard(IntPtr.Zero)) return true; Thread.Sleep(25); } return false; }
  static IntPtr Alloc(byte[] b) { var h = GlobalAlloc(GMEM_MOVEABLE, (UIntPtr)b.Length); var p = GlobalLock(h); Marshal.Copy(b, 0, p, b.Length); GlobalUnlock(h); return h; }

  public static string GetText() {
    if (!Open()) throw new Exception("clipboard locked");
    try { if (!IsClipboardFormatAvailable(CF_UNICODETEXT)) return null;
      var h = GetClipboardData(CF_UNICODETEXT); var p = GlobalLock(h); var s = Marshal.PtrToStringUni(p); GlobalUnlock(h); return s; }
    finally { CloseClipboard(); }
  }
  // exclude=true: keep text out of Win+V history / cloud sync / clipboard monitors (spec §10.1 step 2).
  public static void SetText(string text, bool exclude) {
    if (!Open()) throw new Exception("clipboard locked");
    try {
      EmptyClipboard();
      if (text != null) SetClipboardData(CF_UNICODETEXT, Alloc(Encoding.Unicode.GetBytes(text + "\0")));
      if (exclude) {
        SetClipboardData(RegisterClipboardFormat("ExcludeClipboardContentFromMonitorProcessing"), Alloc(new byte[4]));
        SetClipboardData(RegisterClipboardFormat("CanIncludeInClipboardHistory"), Alloc(BitConverter.GetBytes(0)));
        SetClipboardData(RegisterClipboardFormat("CanUploadToCloudClipboard"), Alloc(BitConverter.GetBytes(0)));
      }
    } finally { CloseClipboard(); }
  }
  public static bool HasFormat(string name) { if (!Open()) return false; try { return IsClipboardFormatAvailable(RegisterClipboardFormat(name)); } finally { CloseClipboard(); } }

  static INPUT Key(ushort vk, ushort scan, uint flags) { var i = new INPUT(); i.type = 1; i.u.ki.wVk = vk; i.u.ki.wScan = scan; i.u.ki.dwFlags = flags; return i; }
  public static uint CtrlV() {
    var a = new[] { Key(0x11,0,0), Key(0x56,0,0), Key(0x56,0,2), Key(0x11,0,2) };
    return SendInput((uint)a.Length, a, System.Runtime.InteropServices.Marshal.SizeOf(typeof(INPUT)));
  }
  public static uint TypeUnicode(string s) {
    var l = new System.Collections.Generic.List<INPUT>();
    foreach (char c in s) { l.Add(Key(0, c, 4)); l.Add(Key(0, c, 4 | 2)); }
    var a = l.ToArray(); return SendInput((uint)a.Length, a, Marshal.SizeOf(typeof(INPUT)));
  }
}
'@

Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Application]::EnableVisualStyles()
$form = New-Object System.Windows.Forms.Form
$form.Text = 'S2 target'; $form.Width = 500; $form.Height = 200; $form.TopMost = $true
$tb = New-Object System.Windows.Forms.TextBox
$tb.Multiline = $true; $tb.Dock = 'Fill'; $form.Controls.Add($tb)
$form.Show(); $form.Activate(); [void][Native]::SetForegroundWindow($form.Handle); $tb.Focus() | Out-Null

function Pump([int]$ms) { $sw = [Diagnostics.Stopwatch]::StartNew(); while ($sw.ElapsedMilliseconds -lt $ms) { [System.Windows.Forms.Application]::DoEvents(); Start-Sleep -Milliseconds 10 } }
Pump 800
$fg = ([Native]::GetForegroundWindow() -eq $form.Handle)
Write-Output "foreground_is_target=$fg"

$fail = 0
for ($i = 1; $i -le 5; $i++) {
  $sentinel = "SENTINEL-$i-original-clipboard"
  $text = "Hello, this is dictation run $i."
  [Native]::SetText($sentinel, $false)
  $snap = [Native]::GetText()                       # 1 snapshot (text only in this spike)
  [Native]::SetText($text, $true)                   # 2 write with history/cloud exclusion
  $excl = [Native]::HasFormat('ExcludeClipboardContentFromMonitorProcessing')
  $tb.Clear(); $tb.Focus() | Out-Null; Pump 100
  $sent = [Native]::CtrlV()                         # 3 paste
  Pump 400
  $got = $tb.Text
  Start-Sleep -Milliseconds 300                     # 4 restore after 300 ms
  [Native]::SetText($snap, $false)
  $restored = [Native]::GetText()
  $okPaste = ($got -eq $text); $okRestore = ($restored -eq $sentinel)
  Write-Output ("run=$i sendinput_events=$sent paste_ok=$okPaste restore_ok=$okRestore exclusion_format_set=$excl got='$got'")
  if (-not ($okPaste -and $okRestore -and $excl -and $sent -eq 4)) { $fail++ }
}

# 5 fallback: type with KEYEVENTF_UNICODE (accents + emoji surrogate pair)
$tb.Clear(); $tb.Focus() | Out-Null; Pump 100
$u = "caf$([char]0xE9) $([char]::ConvertFromUtf32(0x1F600))"
[void][Native]::TypeUnicode($u); Pump 400
$okU = ($tb.Text -eq $u)
Write-Output "unicode_type_ok=$okU"
if (-not $okU) { $fail++ }
Write-Output "S2_FAILURES=$fail"
exit $fail
