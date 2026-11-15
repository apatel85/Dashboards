import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';

import 'package:voiceflow_core/voiceflow_core.dart';

import '../state/app_controller.dart';
import '../state/installed_apps.dart';
import '../state/settings_controller.dart';

/// Profile cards with a before/after example produced by the real formatter.
class StylePage extends StatefulWidget {
  const StylePage({
    super.key,
    required this.controller,
    this.settings,
    this.listApps = listInstalledApps,
  });
  final AppController controller;

  /// Where the per-app styles are saved. Null = no Apps list.
  final SettingsController? settings;

  /// Where the app picker gets its list (installed apps on Android, open programs on Windows).
  final AppLister listApps;

  @override
  State<StylePage> createState() => _StylePageState();
}

class _StylePageState extends State<StylePage> {
  final _newApp = TextEditingController();
  String _newProfile = 'professional';
  final Map<String, String> _names =
      {}; // id -> friendly name, learned from the picker

  @override
  void dispose() {
    _newApp.dispose();
    super.dispose();
  }

  String _newId = '';

  @override
  void initState() {
    super.initState();
    // learn friendly names for apps you already set, so rows read "Notes" and not a package id
    widget.listApps().then((v) {
      if (!mounted) return;
      setState(() {
        for (final a in v) {
          _names[a.id] = a.name;
        }
      });
    }, onError: (_) {});
  }

  AppController get controller => widget.controller;

  Future<void> _pickApp() async {
    final picked = await showDialog<PickableApp>(
      context: context,
      builder: (_) => _AppPickerDialog(load: widget.listApps),
    );
    if (picked == null) return;
    _names[picked.id] = picked.name;
    _newId = picked.id;
    setState(() => _newApp.text = picked.name);
  }

  static const samples = {
    'casual': 'um so i was thinking we could uh grab lunch tomorrow',
    'business': 'hi john comma thanks for the update period can we meet thursday question mark',
    'professional': 'the patient dont have any allergies',
    'ai_prompting': 'i want you to act like a senior python dev and review this function for bugs and keep it short',
  };

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return ListenableBuilder(
      listenable: Listenable.merge([
        controller,
        if (widget.settings != null) widget.settings!,
      ]),
      builder: (context, _) => ListView(
        padding: const EdgeInsets.all(24),
        children: [
          Center(
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 820),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    t.styleTitle,
                    style: Theme.of(context).textTheme.headlineSmall,
                  ),
                  const SizedBox(height: 4),
                  Text(t.styleIntro),
                  const SizedBox(height: 16),
                  for (final p in controller.assets.profiles) ...[
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(16),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            Row(
                              children: [
                                Expanded(
                                  child: Text(
                                    p.name,
                                    style: Theme.of(context)
                                        .textTheme
                                        .titleMedium,
                                  ),
                                ),
                                if (p.id == controller.profile.id)
                                  Chip(label: Text(t.styleDefault))
                                else
                                  OutlinedButton(
                                    onPressed: () => controller.profile = p,
                                    child: Text(t.styleMakeDefault),
                                  ),
                              ],
                            ),
                            const SizedBox(height: 8),
                            Text(
                              t.styleBefore,
                              style: Theme.of(context).textTheme.labelMedium,
                            ),
                            Text(samples[p.id] ?? ''),
                            const SizedBox(height: 8),
                            Text(
                              t.styleAfter,
                              style: Theme.of(context).textTheme.labelMedium,
                            ),
                            Text(controller.format(samples[p.id] ?? '', p)),
                          ],
                        ),
                      ),
                    ),
                    const SizedBox(height: 12),
                  ],
                  if (widget.settings != null) _appsCard(context, t),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _styleDropdown(
    String id,
    String? current, {
    required void Function(String?) onChanged,
    Key? key,
  }) {
    final t = AppLocalizations.of(context);
    final profiles = controller.assets.profiles;
    final value = profiles.any((p) => p.id == current) ? current! : 'auto';
    return DropdownButton<String>(
      key: key,
      value: value,
      items: [
        DropdownMenuItem(value: 'auto', child: Text(t.styleAppAuto)),
        for (final p in profiles)
          DropdownMenuItem(value: p.id, child: Text(p.name)),
      ],
      onChanged: (v) => onChanged(v == null || v == 'auto' ? null : v),
    );
  }

  /// One row per well-known app (automatic or your own choice) plus any other app you set by hand.
  Widget _appsCard(BuildContext context, AppLocalizations t) {
    final sc = widget.settings!;
    final mine = sc.settings.perAppProfiles;
    final known = {for (final k in AppDefaults.known) k.id};
    final extra = [
      for (final id in mine.keys)
        if (!known.contains(id)) id,
    ]..sort();
    Widget row(String id, String name, String sub, String? chosen) {
      return ListTile(
        key: Key('app-row-$id'),
        contentPadding: EdgeInsets.zero,
        title: Text(name),
        subtitle: Text(sub),
        trailing: _styleDropdown(
          id,
          chosen,
          key: Key('app-style-$id'),
          onChanged: (v) => sc.setAppProfile(id, v),
        ),
      );
    }

    return Card(
      margin: const EdgeInsets.only(top: 8),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              t.styleAppsTitle,
              style: Theme.of(context).textTheme.titleMedium,
            ),
            const SizedBox(height: 4),
            Text(t.styleAppsBody),
            const SizedBox(height: 8),
            for (final k in AppDefaults.known)
              row(k.id, k.name, k.group, mine[k.id] ?? k.profileId),
            for (final id in extra)
              row(id, _names[id] ?? id, _names[id] == null ? '' : id, mine[id]),
            const Divider(),
            Text(
              t.styleAppAddTitle,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            TextField(
              key: const Key('app-add-id'),
              controller: _newApp,
              readOnly: true,
              onTap: _pickApp,
              decoration: InputDecoration(
                hintText: t.styleAppAddHint,
                suffixIcon: const Icon(Icons.arrow_drop_down),
              ),
            ),
            const SizedBox(height: 8),
            Row(
              children: [
                _styleDropdown(
                  'new',
                  _newProfile,
                  key: const Key('app-add-style'),
                  onChanged: (v) => setState(() => _newProfile = v ?? 'casual'),
                ),
                const SizedBox(width: 12),
                FilledButton(
                  key: const Key('app-add-button'),
                  onPressed: () async {
                    final id = _newId.trim();
                    if (id.isEmpty) return;
                    await sc.setAppProfile(id, _newProfile);
                    _newApp.clear();
                    _newId = '';
                  },
                  child: Text(t.styleAppAddButton),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

/// Search box plus the list of apps; typing something that is not in the list offers it as an id.
class _AppPickerDialog extends StatefulWidget {
  const _AppPickerDialog({required this.load});
  final AppLister load;
  @override
  State<_AppPickerDialog> createState() => _AppPickerDialogState();
}

class _AppPickerDialogState extends State<_AppPickerDialog> {
  final _q = TextEditingController();
  List<PickableApp>? _apps;

  @override
  void initState() {
    super.initState();
    widget.load().then(
      (v) {
        if (mounted) setState(() => _apps = v);
      },
      onError: (_) {
        if (mounted) setState(() => _apps = const []);
      },
    );
  }

  @override
  void dispose() {
    _q.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final q = _q.text.trim().toLowerCase();
    final all = _apps ?? const <PickableApp>[];
    final shown = [
      for (final a in all)
        if (q.isEmpty || a.name.toLowerCase().contains(q) || a.id.contains(q))
          a,
    ];
    final exact = all.any((a) => a.id == q);
    return AlertDialog(
      title: Text(t.stylePickTitle),
      content: SizedBox(
        width: 420,
        height: 420,
        child: Column(
          children: [
            TextField(
              key: const Key('app-pick-search'),
              controller: _q,
              autofocus: true,
              decoration: InputDecoration(
                prefixIcon: const Icon(Icons.search),
                hintText: t.stylePickSearch,
              ),
              onChanged: (_) => setState(() {}),
            ),
            const SizedBox(height: 8),
            if (_apps == null)
              Padding(
                padding: const EdgeInsets.all(16),
                child: Text(t.stylePickLoading),
              )
            else
              Expanded(
                child: ListView(
                  children: [
                    if (q.isNotEmpty && !exact)
                      ListTile(
                        key: const Key('app-pick-custom'),
                        leading: const Icon(Icons.edit_outlined),
                        title: Text(t.stylePickUse(_q.text.trim())),
                        onTap: () => Navigator.pop(
                          context,
                          PickableApp(q, _q.text.trim()),
                        ),
                      ),
                    if (all.isEmpty && q.isEmpty)
                      Padding(
                        padding: const EdgeInsets.all(8),
                        child: Text(t.stylePickEmpty),
                      ),
                    for (final a in shown)
                      ListTile(
                        key: Key('app-pick-${a.id}'),
                        title: Text(a.name),
                        subtitle: Text(a.id),
                        onTap: () => Navigator.pop(context, a),
                      ),
                  ],
                ),
              ),
          ],
        ),
      ),
    );
  }
}
