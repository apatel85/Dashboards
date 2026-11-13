// ignore_for_file: deprecated_member_use
// Decision (AGENTLOG): tray_manager/window_manager 0.9/0.7 ship a new native API;
// this file uses their `legacy.dart` bridge (0.5.x API). Migrate when it is removed.
import 'dart:io';
import 'dart:ui' show Locale;
import 'package:flutter/services.dart';
import 'package:tray_manager/legacy.dart';
import 'package:window_manager/legacy.dart';
import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';

/// Windows window + tray behaviour (spec §9.3): closing the window hides it to
/// the tray; the tray menu offers profile switching, copy-last and quit.
/// Everything here is a no-op on other platforms (and in widget tests).
class DesktopShell with TrayListener, WindowListener {
  DesktopShell._(this.c) : t = lookupAppLocalizations(const Locale('en'));
  final AppController c;
  final AppLocalizations t;

  static Future<void> init(AppController c) async {
    if (!Platform.isWindows) return;
    final s = DesktopShell._(c);
    await windowManager.ensureInitialized();
    await windowManager.waitUntilReadyToShow(
      const WindowOptions(
        size: Size(1000, 700),
        minimumSize: Size(720, 520),
        title: 'VoiceFlow',
      ),
      () async {
        await windowManager.setPreventClose(true);
        await windowManager.show();
      },
    );
    windowManager.addListener(s);
    trayManager.addListener(s);
    await trayManager.setIcon('assets/tray_icon.ico');
    await trayManager.setToolTip(s.t.appName);
    c.addListener(s._refreshMenu);
    await s._refreshMenu();
  }

  Future<void> _refreshMenu() async {
    await trayManager.setContextMenu(Menu(items: [
      MenuItem(key: 'status', label: '${t.appName}: ${t.stateIdle}', disabled: true),
      MenuItem.separator(),
      MenuItem.submenu(
        label: t.navStyle,
        submenu: Menu(items: [
          for (final p in c.assets.profiles)
            MenuItem.checkbox(key: 'profile:${p.id}', label: p.name, checked: p.id == c.profile.id),
        ]),
      ),
      MenuItem(key: 'copy', label: t.actionCopy, disabled: c.recent.isEmpty),
      MenuItem.separator(),
      MenuItem(key: 'open', label: t.appName),
      MenuItem(key: 'quit', label: 'Quit'),
    ]));
  }

  @override
  void onWindowClose() async {
    // Hide to tray instead of quitting.
    await windowManager.hide();
  }

  @override
  void onTrayIconMouseDown() => _open();
  @override
  void onTrayIconRightMouseDown() => trayManager.popUpContextMenu();

  Future<void> _open() async {
    await windowManager.show();
    await windowManager.focus();
  }

  @override
  void onTrayMenuItemClick(MenuItem menuItem) async {
    final k = menuItem.key ?? '';
    if (k == 'open') {
      await _open();
    } else if (k == 'quit') {
      await trayManager.destroy();
      await windowManager.destroy();
    } else if (k == 'copy' && c.recent.isNotEmpty) {
      await Clipboard.setData(ClipboardData(text: c.recent.first.text));
    } else if (k.startsWith('profile:')) {
      final id = k.substring(8);
      c.profile = c.assets.profiles.firstWhere((p) => p.id == id);
    }
  }
}
