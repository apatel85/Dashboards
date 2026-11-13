import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/dictation_service.dart';
import 'record_button.dart';
import 'status_pill.dart';

/// Home: status, hotkey reminder, "Try it" box (also the copy-mode fallback,
/// spec §2), last 3 dictations.
class HomePage extends StatefulWidget {
  const HomePage({super.key, required this.controller, this.service});
  final AppController controller;
  final DictationService? service;
  @override
  State<HomePage> createState() => _HomePageState();
}

class _HomePageState extends State<HomePage> {
  final _input = TextEditingController();
  bool _copied = false;

  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_rebuild);
  }

  void _rebuild() => setState(() {});

  @override
  void dispose() {
    widget.controller.removeListener(_rebuild);
    _input.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.controller;
    final text = Theme.of(context).textTheme;
    final output = _input.text.trim().isEmpty ? '' : c.format(_input.text);

    return SingleChildScrollView(
      padding: const EdgeInsets.all(24),
      child: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 820),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(t.navHome, style: text.headlineSmall),
              const SizedBox(height: 16),
              _Section(
                title: t.homeStatusTitle,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    StatusPill(controller: c),
                    if (widget.service != null) ...[
                      const SizedBox(height: 12),
                      Row(
                        children: [
                          RecordButton(controller: c, service: widget.service!),
                          const SizedBox(width: 12),
                          Expanded(child: Text(t.recordHint)),
                        ],
                      ),
                    ],
                    const SizedBox(height: 12),
                    Text(t.homeHotkeyReminder(c.hotkey)),
                    const SizedBox(height: 4),
                    Text(t.privacyPromise, style: text.bodySmall),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _Section(
                title: t.tryItTitle,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Wrap(
                      spacing: 8,
                      runSpacing: 8,
                      children: [
                        for (final p in c.assets.profiles)
                          ChoiceChip(
                            label: Text(p.name),
                            selected: p.id == c.profile.id,
                            onSelected: (_) => c.profile = p,
                          ),
                      ],
                    ),
                    const SizedBox(height: 12),
                    TextField(
                      controller: _input,
                      minLines: 2,
                      maxLines: 5,
                      decoration: InputDecoration(hintText: t.tryItHint),
                      onChanged: (_) => setState(() => _copied = false),
                    ),
                    const SizedBox(height: 12),
                    Text(t.tryItOutput, style: text.labelLarge),
                    const SizedBox(height: 4),
                    Container(
                      width: double.infinity,
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Theme.of(context)
                            .colorScheme
                            .surfaceContainerLow,
                        borderRadius: BorderRadius.circular(12),
                      ),
                      child: SelectableText(
                        output.isEmpty ? t.tryItEmpty : output,
                        key: const Key('tryit-output'),
                      ),
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        OutlinedButton.icon(
                          onPressed: output.isEmpty
                              ? null
                              : () async {
                                  await Clipboard.setData(
                                    ClipboardData(text: output),
                                  );
                                  if (mounted) setState(() => _copied = true);
                                },
                          icon: const Icon(Icons.copy, size: 18),
                          label: Text(t.actionCopy),
                        ),
                        if (_copied) ...[
                          const SizedBox(width: 12),
                          Text(t.tryItCopied),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 16),
              _Section(
                title: t.recentTitle,
                child: c.recent.isEmpty
                    ? Text(t.recentEmpty(c.hotkey))
                    : Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          for (final r in c.recent)
                            Padding(
                              padding: const EdgeInsets.symmetric(vertical: 4),
                              child: Text(r.text),
                            ),
                        ],
                      ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Section extends StatelessWidget {
  const _Section({required this.title, required this.child});
  final String title;
  final Widget child;
  @override
  Widget build(BuildContext context) => Card(
    child: Padding(
      padding: const EdgeInsets.all(16),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(title, style: Theme.of(context).textTheme.titleMedium),
          const SizedBox(height: 12),
          child,
        ],
      ),
    ),
  );
}
