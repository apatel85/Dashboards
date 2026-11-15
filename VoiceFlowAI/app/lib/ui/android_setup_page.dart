import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/android_setup.dart';
import '../state/onboarding_controller.dart';

/// Android first-run checklist (spec §9.3 adapted): the floating button is the product, so setup
/// is about letting it listen, appear over other apps, type into the focused field, and giving it
/// its speech model.
class AndroidSetupPage extends StatefulWidget {
  const AndroidSetupPage({super.key, required this.controller});
  final AndroidSetupController controller;
  @override
  State<AndroidSetupPage> createState() => _AndroidSetupPageState();
}

class _AndroidSetupPageState extends State<AndroidSetupPage>
    with WidgetsBindingObserver {
  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    widget.controller.refresh();
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    super.dispose();
  }

  // Coming back from system settings is how most steps get ticked.
  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (state == AppLifecycleState.resumed) widget.controller.refresh();
  }

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.controller;
    return Scaffold(
      body: SafeArea(
        child: ListenableBuilder(
          listenable: c,
          builder: (context, _) => ListView(
            padding: const EdgeInsets.all(16),
            children: [
              Text(
                t.setupTitle,
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 4),
              Text(t.setupIntro),
              const SizedBox(height: 16),
              _step(
                context,
                'mic',
                c.micOk,
                c.current == SetupStep.mic,
                t.setupMic,
                t.setupMicBody,
                button: t.setupMicButton,
                onPressed: c.allowMic,
                extra: c.micAsked && !c.micOk ? Text(t.setupMicDenied) : null,
              ),
              _step(
                context,
                'overlay',
                c.overlayOk,
                c.current == SetupStep.overlay,
                t.setupOverlay,
                t.setupOverlayBody,
                button: t.setupOverlayButton,
                onPressed: c.openOverlaySettings,
              ),
              _step(
                context,
                'access',
                c.accessOk,
                c.current == SetupStep.accessibility,
                t.setupAccess,
                t.setupAccessBody,
                button: t.setupAccessButton,
                onPressed: c.openAccessibilitySettings,
                extra: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(t.setupAccessRestricted),
                    const SizedBox(height: 8),
                    OutlinedButton(
                      key: const Key('btn-appinfo'),
                      onPressed: c.openAppInfo,
                      child: Text(t.setupAppInfoButton),
                    ),
                  ],
                ),
              ),
              _modelStep(context, t, c),
              _step(
                context,
                'bubble',
                c.bubbleOn,
                c.current == SetupStep.bubble,
                t.setupBubble,
                t.setupBubbleBody,
                button: t.setupBubbleButton,
                onPressed: c.showBubble,
              ),
              if (c.allDone) ...[
                const SizedBox(height: 8),
                Card(
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.setupTry,
                          style: Theme.of(context).textTheme.titleMedium,
                        ),
                        const SizedBox(height: 4),
                        Text(t.setupTryBody),
                        const SizedBox(height: 12),
                        TextField(
                          key: const Key('setup-try'),
                          minLines: 2,
                          maxLines: 4,
                          decoration: InputDecoration(
                            border: const OutlineInputBorder(),
                            hintText: t.setupTryHint,
                          ),
                        ),
                        const SizedBox(height: 12),
                        FilledButton(
                          key: const Key('setup-finish'),
                          onPressed: c.finish,
                          child: Text(t.setupDone),
                        ),
                      ],
                    ),
                  ),
                ),
              ],
            ],
          ),
        ),
      ),
    );
  }

  Widget _tile(
    BuildContext context,
    String id,
    bool done,
    bool active,
    String title,
    List<Widget> body,
  ) {
    final cs = Theme.of(context).colorScheme;
    return Card(
      key: Key('step-$id'),
      color: active ? cs.secondaryContainer : null,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Semantics(
                  label: done ? 'done' : 'to do',
                  child: Icon(
                    done ? Icons.check_circle : Icons.radio_button_unchecked,
                    key: Key('tick-$id'),
                    color: done ? cs.primary : cs.outline,
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Text(
                    title,
                    style: Theme.of(context).textTheme.titleMedium,
                  ),
                ),
              ],
            ),
            if (active) ...[const SizedBox(height: 8), ...body],
          ],
        ),
      ),
    );
  }

  Widget _step(
    BuildContext context,
    String id,
    bool done,
    bool active,
    String title,
    String body, {
    required String button,
    required VoidCallback onPressed,
    Widget? extra,
  }) {
    return _tile(context, id, done, active, title, [
      Text(body),
      if (extra != null) ...[const SizedBox(height: 8), extra],
      const SizedBox(height: 12),
      FilledButton(
        key: Key('btn-$id'),
        onPressed: onPressed,
        child: Text(button),
      ),
    ]);
  }

  Widget _modelStep(
    BuildContext context,
    AppLocalizations t,
    AndroidSetupController c,
  ) {
    final m = c.model;
    final busy =
        m == ModelUiState.downloading ||
        m == ModelUiState.verifying ||
        m == ModelUiState.extracting;
    final status = switch (m) {
      ModelUiState.downloading => t.onbDownloading(c.percent),
      ModelUiState.verifying => t.onbVerifying,
      ModelUiState.extracting => t.onbExtracting,
      ModelUiState.installed => t.onbInstalled,
      ModelUiState.paused => t.onbPaused,
      ModelUiState.failed => t.onbModelFailed,
      ModelUiState.integrity => t.onbModelIntegrity,
      ModelUiState.idle => '',
    };
    return _tile(
      context,
      'model',
      c.modelOk,
      c.current == SetupStep.model,
      t.setupModel,
      [
        Text(t.onbModelBody(c.installer.sizeMb)),
        if (busy) ...[
          const SizedBox(height: 8),
          LinearProgressIndicator(
            key: const Key('model-progress'),
            value: m == ModelUiState.downloading ? c.percent / 100 : null,
          ),
        ],
        if (status.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(status, key: const Key('model-status')),
        ],
        const SizedBox(height: 12),
        if (m == ModelUiState.downloading)
          OutlinedButton(onPressed: c.pause, child: Text(t.onbPause))
        else if (!busy)
          FilledButton(
            key: const Key('btn-model'),
            onPressed: c.download,
            child: Text(
              m == ModelUiState.failed || m == ModelUiState.integrity
                  ? t.onbRetry
                  : t.onbDownload,
            ),
          ),
      ],
    );
  }
}
