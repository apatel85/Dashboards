import 'package:material_ui/material_ui.dart';
import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import 'home_page.dart';
import 'style_page.dart';

/// Left-navigation shell (spec §9.3 main window).
class AppShell extends StatefulWidget {
  const AppShell({super.key, required this.controller});
  final AppController controller;
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
      HomePage(controller: widget.controller),
      StylePage(controller: widget.controller),
      for (var i = 2; i < items.length; i++) _Later(title: items[i].$2),
    ];
    return Scaffold(
      body: Row(children: [
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
                NavigationRailDestination(icon: Icon(it.$1), label: Text(it.$2)),
            ],
          ),
        ),
        const VerticalDivider(width: 1),
        Expanded(child: pages[_index]),
      ]),
    );
  }
}

class _Later extends StatelessWidget {
  const _Later({required this.title});
  final String title;
  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.start, children: [
          Text(title, style: Theme.of(context).textTheme.headlineSmall),
          const SizedBox(height: 8),
          Text(AppLocalizations.of(context).comingLater),
        ]),
      );
}
