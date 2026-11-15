import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';

import 'package:voiceflow_core/voiceflow_core.dart';

import '../state/app_controller.dart';
import '../state/settings_controller.dart';

/// Profile cards with a before/after example produced by the real formatter.
class StylePage extends StatefulWidget {
  const StylePage({super.key, required this.controller, this.settings});
  final AppController controller;

  /// Where the per-app styles are saved. Null = no Apps list.
  final SettingsController? settings;

  @override
  State<StylePage> createState() => _StylePageState();
}

class _StylePageState extends State<StylePage> {
  final _newApp = TextEditingController();
  String _newProfile = 'professional';

  @override
  void dispose() {
    _newApp.dispose();
    super.dispose();
  }

  AppController get controller => widget.controller;

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
            for (final id in extra) row(id, id, '', mine[id]),
            const Divider(),
            Text(
              t.styleAppAddTitle,
              style: Theme.of(context).textTheme.labelLarge,
            ),
            const SizedBox(height: 4),
            TextField(
              key: const Key('app-add-id'),
              controller: _newApp,
              decoration: InputDecoration(hintText: t.styleAppAddHint),
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
                    final id = _newApp.text.trim();
                    if (id.isEmpty) return;
                    await sc.setAppProfile(id, _newProfile);
                    _newApp.clear();
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
