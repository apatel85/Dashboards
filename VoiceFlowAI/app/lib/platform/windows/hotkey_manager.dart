import 'hotkey_gestures.dart';
import 'win32.dart' as w;

/// Decides what to do with every global key event (pure logic; the OS hook just
/// feeds it). Returns true when the event is consumed so the focused app never
/// sees it. Spec §9.3: dictation hotkey, Esc cancels while listening,
/// Ctrl+Alt+Z undoes the last insertion, Ctrl+Alt+P cycles the profile.
class HotkeyManager {
  HotkeyManager({
    required this.gestures,
    required this.onUndo,
    required this.onCycleProfile,
    this.hotkeyVk = w.kVkF9,
  });

  final HotkeyGestures gestures;
  final void Function() onUndo, onCycleProfile;
  int hotkeyVk;
  final Set<int> _swallowUp = {};

  bool onKey({
    required int vk,
    required bool down,
    required bool ctrl,
    required bool alt,
    bool ours = false,
  }) {
    if (ours) return false; // input we injected ourselves (paste, backspaces)

    if (vk == hotkeyVk) return down ? gestures.keyDown() : gestures.keyUp();

    if (vk == w.kVkEscape && down && gestures.active) {
      gestures.cancel();
      _swallowUp.add(vk);
      return true;
    }

    if (down && ctrl && alt && (vk == w.kVkZ || vk == w.kVkP)) {
      _swallowUp.add(vk);
      vk == w.kVkZ ? onUndo() : onCycleProfile();
      return true;
    }

    if (!down && _swallowUp.remove(vk)) return true;
    return false;
  }
}
