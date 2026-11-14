import 'dart:convert';

import 'package:file_selector/file_selector.dart';
import 'package:flutter/services.dart';
import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/polish_config.dart';
import '../state/polish_holder.dart';
import '../state/settings_controller.dart';

/// Reads one settings file chosen by the user: (file name, text), or null if cancelled.
typedef SettingsFilePicker = Future<(String, String)?> Function();

Future<(String, String)?> pickSettingsFile() async {
  const group = XTypeGroup(label: 'Settings', extensions: ['json']);
  final f = await openFile(acceptedTypeGroups: const [group]);
  if (f == null) return null;
  return (f.name, utf8.decode(await f.readAsBytes(), allowMalformed: true));
}

/// Settings (spec §9.3): cloud polish with consent, privacy statement, backup and restore, about.
class SettingsPage extends StatefulWidget {
  const SettingsPage({
    super.key,
    required this.controller,
    this.polish,
    this.pick = pickSettingsFile,
    this.copyToClipboard = _copy,
  });
  final SettingsController controller;
  final PolishHolder? polish;
  final SettingsFilePicker pick;
  final Future<void> Function(String) copyToClipboard;

  static Future<void> _copy(String s) =>
      Clipboard.setData(ClipboardData(text: s));

  @override
  State<SettingsPage> createState() => _SettingsPageState();
}

class _SettingsPageState extends State<SettingsPage> {
  String? _testResult;
  bool _testing = false;
  late final _url = TextEditingController(
    text: widget.controller.settings.ollamaUrl,
  );
  late final _model = TextEditingController(
    text: widget.controller.settings.ollamaModel,
  );

  @override
  void dispose() {
    _url.dispose();
    _model.dispose();
    super.dispose();
  }

  Future<void> _toggleCloud(bool on) async {
    final c = widget.controller;
    if (!on) return c.setCloudPolish(false, consent: false);
    final local = c.settings.cloudPreset == 'ollama';
    if (local) {
      return c.setCloudPolish(
        true,
        consent: false,
      ); // text stays on this computer
    }
    final t = AppLocalizations.of(context);
    final agreed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        key: const Key('consent-dialog'),
        title: Text(t.setConsentTitle),
        content: Text(t.setConsentBody),
        actions: [
          TextButton(
            key: const Key('consent-cancel'),
            onPressed: () => Navigator.pop(ctx, false),
            child: Text(t.setCancel),
          ),
          FilledButton(
            key: const Key('consent-agree'),
            onPressed: () => Navigator.pop(ctx, true),
            child: Text(t.setConsentAgree),
          ),
        ],
      ),
    );
    if (agreed == true) await c.setCloudPolish(true, consent: true);
  }

  Future<void> _test() async {
    setState(() {
      _testing = true;
      _testResult = null;
    });
    final r = await widget.polish?.test() ?? 'Polish is off.';
    if (!mounted) return;
    setState(() {
      _testing = false;
      _testResult = r;
    });
  }

  Future<void> _import() async {
    final t = AppLocalizations.of(context);
    final messenger = ScaffoldMessenger.of(context);
    final picked = await widget.pick();
    if (picked == null || !mounted) return;
    final errors = await widget.controller.importJson(picked.$2);
    if (!mounted) return;
    if (errors.isEmpty) {
      messenger.showSnackBar(SnackBar(content: Text(t.setImported)));
      return;
    }
    await showDialog<void>(
      context: context,
      builder: (ctx) => AlertDialog(
        key: const Key('import-refused'),
        title: Text(t.setImportRefused),
        content: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [for (final e in errors) Text('• $e')],
          ),
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx),
            child: Text(t.packsOk),
          ),
        ],
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final text = Theme.of(context).textTheme;
    final c = widget.controller;
    return ListenableBuilder(
      listenable: c,
      builder: (context, _) {
        final s = c.settings;
        final counts =
            widget.polish?.chain?.todayCounts.values.fold<int>(
              0,
              (a, b) => a + b,
            ) ??
            0;
        return ListView(
          padding: const EdgeInsets.all(24),
          children: [
            Text(t.setTitle, style: text.headlineSmall),
            const SizedBox(height: 16),
            _card(context, t.setGeneralTitle, [
              SwitchListTile(
                key: const Key('set-sounds'),
                contentPadding: EdgeInsets.zero,
                title: Text(t.setSounds),
                value: s.soundsOn,
                onChanged: c.setSounds,
              ),
            ]),
            _card(context, t.setCloudTitle, [
              Text(t.setCloudBody),
              const SizedBox(height: 8),
              DropdownButton<String>(
                key: const Key('set-preset'),
                isExpanded: true,
                value: s.cloudPreset == 'ollama' ? 'ollama' : 'proxy',
                items: [
                  DropdownMenuItem(
                    value: 'proxy',
                    child: Text(t.setPresetProxy),
                  ),
                  DropdownMenuItem(
                    value: 'ollama',
                    child: Text(t.setPresetOllama),
                  ),
                ],
                onChanged: (v) => v == null ? null : c.setPreset(v),
              ),
              if (s.cloudPreset == 'ollama') ...[
                const SizedBox(height: 8),
                TextField(
                  key: const Key('set-ollama-url'),
                  controller: _url,
                  decoration: InputDecoration(labelText: t.setOllamaUrl),
                  onChanged: (v) => c.setOllama(url: v),
                ),
                TextField(
                  key: const Key('set-ollama-model'),
                  controller: _model,
                  decoration: InputDecoration(labelText: t.setOllamaModel),
                  onChanged: (v) => c.setOllama(model: v),
                ),
              ],
              SwitchListTile(
                key: const Key('set-cloud'),
                contentPadding: EdgeInsets.zero,
                title: Text(t.setCloudSwitch),
                value: s.cloudPolish,
                onChanged: _toggleCloud,
              ),
              if (s.cloudPolish) ...[
                Wrap(
                  spacing: 12,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    OutlinedButton(
                      key: const Key('set-test'),
                      onPressed: _testing ? null : _test,
                      child: Text(_testing ? t.setTesting : t.setTest),
                    ),
                    Text(t.setTodayCount(counts)),
                  ],
                ),
                if (_testResult != null)
                  Padding(
                    padding: const EdgeInsets.only(top: 8),
                    child: Text(
                      _testResult!,
                      key: const Key('set-test-result'),
                    ),
                  ),
              ],
            ]),
            _card(context, t.setPrivacyTitle, [Text(t.setPrivacyBody)]),
            _card(context, t.setBackupTitle, [
              Text(t.setBackupBody),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                children: [
                  OutlinedButton(
                    key: const Key('set-export'),
                    onPressed: () async {
                      final m = ScaffoldMessenger.of(context);
                      await widget.copyToClipboard(c.exportJson());
                      m.showSnackBar(SnackBar(content: Text(t.setExported)));
                    },
                    child: Text(t.setExport),
                  ),
                  OutlinedButton(
                    key: const Key('set-import'),
                    onPressed: _import,
                    child: Text(t.setImport),
                  ),
                ],
              ),
            ]),
            _card(context, t.setAboutTitle, [
              Text(t.setVersion(kAppVersion), key: const Key('set-version')),
              TextButton(
                onPressed: () => showLicensePage(
                  context: context,
                  applicationName: t.appName,
                  applicationVersion: kAppVersion,
                ),
                child: Text(t.setLicenses),
              ),
            ]),
          ],
        );
      },
    );
  }

  Widget _card(BuildContext context, String title, List<Widget> children) =>
      Card(
        margin: const EdgeInsets.only(bottom: 16),
        child: Padding(
          padding: const EdgeInsets.all(16),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: Theme.of(context).textTheme.titleMedium),
              const SizedBox(height: 8),
              ...children,
            ],
          ),
        ),
      );
}
