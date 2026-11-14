import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../l10n/app_localizations.dart';
import '../state/pack_store.dart';

/// Reads one pack file chosen by the user: (file name, text), or null if cancelled.
typedef PackFilePicker = Future<(String, String)?> Function();

Future<(String, String)?> pickPackFile() async {
  const group = XTypeGroup(label: 'Pack', extensions: ['json']);
  final f = await openFile(acceptedTypeGroups: const [group]);
  if (f == null) return null;
  return (f.name, utf8.decode(await f.readAsBytes(), allowMalformed: true));
}

/// Packs page (spec §9.3): what is on and in what order, what is available, import, problems.
class PacksPage extends StatelessWidget {
  const PacksPage({super.key, required this.store, this.pick = pickPackFile});
  final PackStore store;
  final PackFilePicker pick;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    return ListenableBuilder(
      listenable: store,
      builder: (context, _) {
        final active = store.active;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(t.navPacks, style: text.headlineSmall),
            const SizedBox(height: 8),
            Text(t.packsIntro),
            const SizedBox(height: 16),
            Text(t.packsActive, style: text.titleMedium),
            const SizedBox(height: 8),
            if (active.isEmpty) Text(t.packsNoneActive),
            for (var i = 0; i < active.length; i++)
              _tile(
                context,
                active[i],
                on: true,
                first: i == 0,
                last: i == active.length - 1,
              ),
            const SizedBox(height: 16),
            Text(t.packsAvailable, style: text.titleMedium),
            const SizedBox(height: 8),
            for (final p in store.inactive) _tile(context, p, on: false),
            const SizedBox(height: 16),
            Align(
              alignment: Alignment.centerLeft,
              child: OutlinedButton.icon(
                key: const Key('packs-import'),
                icon: const Icon(Icons.file_open_outlined),
                label: Text(t.packsImport),
                onPressed: () => _import(context),
              ),
            ),
            if (store.errors.isNotEmpty) ...[
              const SizedBox(height: 24),
              Row(
                children: [
                  Expanded(
                    child: Text(t.packsProblems, style: text.titleMedium),
                  ),
                  TextButton(
                    onPressed: store.clearErrors,
                    child: Text(t.packsDismiss),
                  ),
                ],
              ),
              for (final e in store.errors)
                Card(
                  key: const Key('pack-error'),
                  child: Padding(
                    padding: const EdgeInsets.all(12),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.packsRefusedFile(e.source),
                          style: text.labelLarge,
                        ),
                        for (final m in e.messages) Text('• $m'),
                      ],
                    ),
                  ),
                ),
            ],
          ],
        );
      },
    );
  }

  Widget _tile(
    BuildContext context,
    DomainPack p, {
    required bool on,
    bool first = false,
    bool last = false,
  }) {
    final t = AppLocalizations.of(context);
    return Card(
      key: Key('pack-${p.id}'),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 8, 8, 8),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Text(
                    p.name,
                    style: Theme.of(context).textTheme.titleSmall,
                  ),
                ),
                Switch(
                  key: Key('pack-switch-${p.id}'),
                  value: on,
                  onChanged: (v) => store.setActive(p.id, v),
                ),
              ],
            ),
            Text(
              t.packsDetails(
                p.vocabulary.length + p.abbreviations.length,
                p.version,
              ),
              style: Theme.of(context).textTheme.bodySmall,
            ),
            if (p.description.isNotEmpty) Text(p.description),
            if (!p.cloudAllowed)
              Padding(
                padding: const EdgeInsets.only(top: 4),
                child: Row(
                  children: [
                    const Icon(Icons.lock_outline, size: 16),
                    const SizedBox(width: 4),
                    Text(t.packsLocalOnly, key: const Key('pack-local-only')),
                  ],
                ),
              ),
            Wrap(
              children: [
                if (on)
                  IconButton(
                    key: Key('pack-up-${p.id}'),
                    tooltip: t.packsMoveUp,
                    icon: const Icon(Icons.arrow_upward),
                    onPressed: first ? null : () => store.move(p.id, -1),
                  ),
                if (on)
                  IconButton(
                    key: Key('pack-down-${p.id}'),
                    tooltip: t.packsMoveDown,
                    icon: const Icon(Icons.arrow_downward),
                    onPressed: last ? null : () => store.move(p.id, 1),
                  ),
                if (!store.isBundled(p.id))
                  TextButton(
                    key: Key('pack-remove-${p.id}'),
                    onPressed: () => store.removeUserPack(p.id),
                    child: Text(t.packsRemove),
                  ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _import(BuildContext context) async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final picked = await pick();
    if (picked == null || !context.mounted) return;
    final errors = await store.importJson(picked.$2, picked.$1);
    if (!context.mounted) return;
    if (errors.isEmpty) {
      final id = (jsonDecode(picked.$2) as Map)['id'] as String;
      messenger.showSnackBar(
        SnackBar(
          content: Text(t.packsImported(store.registry.byId(id)?.name ?? id)),
        ),
      );
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (c) => AlertDialog(
        key: const Key('pack-refused'),
        title: Text(t.packsRefusedTitle),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.packsRefusedFile(picked.$1)),
              const SizedBox(height: 8),
              for (final m in errors) Text('• $m'),
            ],
          ),
        ),
        actions: [
          TextButton(onPressed: () => Navigator.pop(c), child: Text(t.packsOk)),
        ],
      ),
    );
  }
}
