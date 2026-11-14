import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/dictation_service.dart';
import '../state/pack_store.dart';
import 'home_page.dart';
import 'packs_page.dart';
import 'style_page.dart';

/// Left-navigation shell (spec §9.3 main window).
class AppShell extends StatefulWidget {
  const AppShell({
    super.key,
    required this.controller,
    this.service,
    this.packStore,
    this.pickPackFile,
  });
  final AppController controller;
  final DictationService? service;
  final PackStore? packStore;
  final PackFilePicker? pickPackFile;
  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final items = <(IconData, String)>[
      (Icons.home_outlined, t.navHome),
      (Icons.tune, t.navStyle),
      (Icons.menu_book_outlined, t.navDictionary),
      (Icons.extension_outlined, t.navPacks),
      (Icons.history, t.navHistory),
      (Icons.settings_outlined, t.navSettings),
    ];
    final pages = <Widget>[
      HomePage(
        controller: widget.controller,
        service: widget.service,
        packStore: widget.packStore,
      ),
      StylePage(controller: widget.controller),
      for (var i = 2; i < items.length; i++)
        if (i == 3 && widget.packStore != null)
          PacksPage(
            store: widget.packStore!,
            pick: widget.pickPackFile ?? pickPackFile,
          )
        else
          _Later(title: items[i].$2),
    ];
    final narrow = MediaQuery.sizeOf(context).width < 600;
    if (narrow) {
      // Phones: bottom bar with five pages. Dictionary is still a placeholder, so Packs takes
      // its place until the Dictionary page exists.
      const shown = [0, 1, 3, 4, 5];
      return Scaffold(
        body: SafeArea(child: pages[_index]),
        bottomNavigationBar: NavigationBar(
          selectedIndex: shown.contains(_index) ? shown.indexOf(_index) : 0,
          onDestinationSelected: (i) => setState(() => _index = shown[i]),
          destinations: [
            for (final i in shown)
              NavigationDestination(
                icon: Icon(items[i].$1),
                label: items[i].$2,
              ),
          ],
        ),
      );
    }
    return Scaffold(
      body: Row(
        children: [
          SafeArea(
            child: NavigationRail(
              extended: MediaQuery.sizeOf(context).width >= 900,
              selectedIndex: _index,
              onDestinationSelected: (i) => setState(() => _index = i),
              labelType: MediaQuery.sizeOf(context).width >= 900
                  ? NavigationRailLabelType.none
                  : NavigationRailLabelType.all,
              destinations: [
                for (final it in items)
                  NavigationRailDestination(
                    icon: Icon(it.$1),
                    label: Text(it.$2),
                  ),
              ],
            ),
          ),
          const VerticalDivider(width: 1),
          Expanded(child: pages[_index]),
        ],
      ),
    );
  }
}

class _Later extends StatelessWidget {
  const _Later({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
    padding: const EdgeInsets.all(24),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.headlineSmall),
        const SizedBox(height: 8),
        Text(AppLocalizations.of(context).comingLater),
      ],
    ),
  );
}
