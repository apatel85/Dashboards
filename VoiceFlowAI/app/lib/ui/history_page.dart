import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/settings_controller.dart';

typedef CopyText = Future<void> Function(String text);

Future<void> _systemCopy(String t) => Clipboard.setData(ClipboardData(text: t));

/// History: every dictation with the raw transcript next to the converted text, so the
/// conversion can be checked and the gaps found. Re-running an entry applies today's rules to its
/// raw text. "Copy report" puts all of it on the clipboard as plain text.
class HistoryPage extends StatefulWidget {
  const HistoryPage({
    super.key,
    required this.store,
    required this.controller,
    this.settings,
    this.copy = _systemCopy,
  });
  final HistoryStore store;
  final AppController controller;
  final SettingsController? settings;
  final CopyText copy;

  @override
  State<HistoryPage> createState() => _HistoryPageState();
}

class _HistoryPageState extends State<HistoryPage> {
  final _search = TextEditingController();
  final Set<HistoryEntry> _rerun = {};
  bool _loading = true;

  @override
  void initState() {
    super.initState();
    _reload();
  }

  @override
  void dispose() {
    _search.dispose();
    super.dispose();
  }

  Future<void> _reload() async {
    await widget.store
        .load(); // the floating-button engine writes the same file
    if (mounted) setState(() => _loading = false);
  }

  Profile? _profile(String id) =>
      widget.controller.assets.profiles.where((p) => p.id == id).firstOrNull;

  String _name(String id) {
    // Professional is one choice with a tone level: the formal profile shows under that name
    final p = _profile(id == 'professional' ? 'business' : id);
    return p?.name ?? id;
  }

  List<HistoryEntry> get _shown => _search.text.trim().isEmpty
      ? widget.store.items
      : widget.store.search(_search.text.trim());

  Future<void> _copy(String text) async {
    await widget.copy(text);
    if (!mounted) return;
    ScaffoldMessenger.maybeOf(context)?.showSnackBar(
      SnackBar(content: Text(AppLocalizations.of(context).historyCopied)),
    );
  }

  Future<void> _clear() async {
    final t = AppLocalizations.of(context);
    final ok = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        content: Text(t.historyClearAsk),
        actions: [
          TextButton(
            key: const Key('history-clear-no'),
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(t.setCancel),
          ),
          FilledButton(
            key: const Key('history-clear-yes'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(t.historyClear),
          ),
        ],
      ),
    );
    if (ok == true) {
      await widget.store.clear();
      if (mounted) setState(() => _rerun.clear());
    }
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final items = _shown;
    final sc = widget.settings;
    return ListView(
      padding: const EdgeInsets.all(24),
      children: [
        Row(
          children: [
            Expanded(
              child: Text(
                t.historyTitle,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
            ),
            IconButton(
              key: const Key('history-refresh'),
              tooltip: t.historyRefresh,
              onPressed: _reload,
              icon: const Icon(Icons.refresh),
            ),
          ],
        ),
        const SizedBox(height: 4),
        Text(t.historyIntro),
        if (sc != null)
          SwitchListTile(
            key: const Key('history-save'),
            contentPadding: EdgeInsets.zero,
            title: Text(t.historySave),
            subtitle: Text(t.historySaveNote),
            value: sc.settings.historyEnabled,
            onChanged: (v) async {
              widget.store.enabled = v;
              await sc.setHistoryEnabled(v);
              if (mounted) setState(() {});
            },
          ),
        const SizedBox(height: 8),
        Wrap(
          spacing: 12,
          runSpacing: 8,
          crossAxisAlignment: WrapCrossAlignment.center,
          children: [
            SizedBox(
              width: 280,
              child: TextField(
                key: const Key('history-search'),
                controller: _search,
                decoration: InputDecoration(
                  prefixIcon: const Icon(Icons.search),
                  hintText: t.historySearch,
                ),
                onChanged: (_) => setState(() {}),
              ),
            ),
            OutlinedButton.icon(
              key: const Key('history-copy-report'),
              onPressed: items.isEmpty
                  ? null
                  : () => _copy(historyReport(items, profileName: _name)),
              icon: const Icon(Icons.copy_all),
              label: Text(t.historyCopyReport),
            ),
            OutlinedButton.icon(
              key: const Key('history-clear'),
              onPressed: widget.store.items.isEmpty ? null : _clear,
              icon: const Icon(Icons.delete_outline),
              label: Text(t.historyClear),
            ),
          ],
        ),
        const SizedBox(height: 16),
        if (_loading)
          const Center(child: CircularProgressIndicator())
        else if (items.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: 24),
            child: Text(t.historyEmpty, key: const Key('history-empty')),
          )
        else
          for (final e in items) _card(context, t, e),
      ],
    );
  }

  Widget _card(BuildContext context, AppLocalizations t, HistoryEntry e) {
    final theme = Theme.of(context);
    final when = e.at.toLocal().toString().split('.').first;
    final tags = [
      _name(e.profileId),
      if (e.app != null) e.app!,
      if (e.route != null) e.route!,
      if (e.polished) t.historyPolished,
      if (e.fallback != null) t.historyFellBack(e.fallback!),
    ];
    final raw = e.raw.trim();
    String? again;
    if (_rerun.contains(e) && raw.isNotEmpty) {
      final p = _profile(e.profileId);
      again = p == null ? null : widget.controller.format(raw, p);
    }
    return Card(
      key: Key('history-entry-${e.at.microsecondsSinceEpoch}'),
      margin: const EdgeInsets.only(bottom: 12),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(when, style: theme.textTheme.labelMedium),
            const SizedBox(height: 4),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [for (final x in tags) Chip(label: Text(x))],
            ),
            const SizedBox(height: 8),
            Text(t.historyHeard, style: theme.textTheme.labelMedium),
            SelectableText(
              raw.isEmpty ? t.historyOlder : raw,
              key: Key('history-raw-${e.at.microsecondsSinceEpoch}'),
            ),
            const SizedBox(height: 8),
            Text(t.historyTyped, style: theme.textTheme.labelMedium),
            SelectableText(
              e.text,
              key: Key('history-text-${e.at.microsecondsSinceEpoch}'),
            ),
            if (again != null) ...[
              const SizedBox(height: 8),
              Text(
                again == e.text ? t.historySame : t.historyDiffers,
                style: theme.textTheme.labelMedium,
              ),
              if (again != e.text)
                SelectableText(
                  again,
                  key: Key('history-again-${e.at.microsecondsSinceEpoch}'),
                ),
            ],
            const SizedBox(height: 8),
            Wrap(
              spacing: 8,
              children: [
                TextButton(
                  onPressed: raw.isEmpty ? null : () => _copy(raw),
                  child: Text(t.historyCopyHeard),
                ),
                TextButton(
                  onPressed: () => _copy(e.text),
                  child: Text(t.historyCopyTyped),
                ),
                TextButton(
                  key: Key('history-rerun-${e.at.microsecondsSinceEpoch}'),
                  onPressed: raw.isEmpty
                      ? null
                      : () => setState(() => _rerun.add(e)),
                  child: Text(t.historyRerun),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}
