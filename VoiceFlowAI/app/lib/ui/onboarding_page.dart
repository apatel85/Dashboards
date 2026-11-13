import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/dictation_service.dart';
import '../state/onboarding_controller.dart';
import 'record_button.dart';
import 'status_pill.dart';

/// 4-step first-run flow (spec §9.3). Skippable only after step 3.
class OnboardingPage extends StatelessWidget {
  const OnboardingPage({
    super.key,
    required this.controller,
    this.app,
    this.service,
  });
  final OnboardingController controller;
  final AppController? app;
  final DictationService? service;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return Scaffold(
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.all(24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 560),
              child: ListenableBuilder(
                listenable: controller,
                builder: (context, _) => Card(
                  child: Padding(
                    padding: const EdgeInsets.all(24),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          t.onbTitle,
                          style: Theme.of(context).textTheme.headlineSmall,
                        ),
                        const SizedBox(height: 4),
                        Text(t.onbStep(controller.step + 1)),
                        const SizedBox(height: 16),
                        LinearProgressIndicator(
                          value: (controller.step + 1) / 4,
                        ),
                        const SizedBox(height: 24),
                        _body(context, t),
                        const SizedBox(height: 24),
                        Wrap(
                          spacing: 8,
                          runSpacing: 8,
                          children: [
                            if (controller.step > 0)
                              OutlinedButton(
                                onPressed: controller.canBack
                                    ? controller.back
                                    : null,
                                child: Text(t.onbBack),
                              ),
                            if (controller.step < 3)
                              FilledButton(
                                onPressed: controller.canNext
                                    ? controller.next
                                    : null,
                                child: Text(t.onbNext),
                              ),
                            if (controller.step == 3) ...[
                              FilledButton(
                                onPressed: controller.finish,
                                child: Text(t.onbDone),
                              ),
                              if (controller.canSkip)
                                TextButton(
                                  onPressed: controller.finish,
                                  child: Text(t.onbSkip),
                                ),
                            ],
                          ],
                        ),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }

  Widget _body(BuildContext context, AppLocalizations t) {
    final text = Theme.of(context).textTheme;
    switch (controller.step) {
      case 0:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.onbWelcomeTitle, style: text.titleLarge),
            const SizedBox(height: 8),
            Text(t.onbWelcomeBody),
            const SizedBox(height: 8),
            Text(t.privacyPromise),
          ],
        );
      case 1:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.onbMicTitle, style: text.titleLarge),
            const SizedBox(height: 8),
            Text(t.onbMicHint),
            const SizedBox(height: 12),
            if (controller.micAllowed != true)
              FilledButton(
                onPressed: controller.allowMic,
                child: Text(t.onbMicAllow),
              ),
            if (controller.micAllowed == false) ...[
              const SizedBox(height: 8),
              Text(t.onbMicDenied),
            ],
            if (controller.micAllowed == true && controller.devices.isEmpty)
              Text(t.onbMicNone),
            if (controller.devices.isNotEmpty) ...[
              DropdownButton<String>(
                isExpanded: true,
                value: controller.deviceId,
                items: [
                  for (final d in controller.devices)
                    DropdownMenuItem(
                      value: d.id,
                      child: Text(d.label, overflow: TextOverflow.ellipsis),
                    ),
                ],
                onChanged: (v) => v == null ? null : controller.selectDevice(v),
              ),
              const SizedBox(height: 12),
              Semantics(
                label: t.onbMicHint,
                child: LinearProgressIndicator(
                  key: const Key('mic-level'),
                  value: controller.level,
                  minHeight: 10,
                ),
              ),
            ],
          ],
        );
      case 2:
        return _modelStep(context, t);
      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(t.onbTryTitle, style: text.titleLarge),
            const SizedBox(height: 8),
            Text(t.onbTrySentence),
            if (app != null && service != null) ...[
              const SizedBox(height: 12),
              StatusPill(controller: app!),
              const SizedBox(height: 12),
              RecordButton(controller: app!, service: service!),
              ListenableBuilder(
                listenable: app!,
                builder: (_, _) => app!.recent.isEmpty
                    ? const SizedBox.shrink()
                    : Padding(
                        padding: const EdgeInsets.only(top: 12),
                        child: SelectableText(
                          app!.recent.first.text,
                          key: const Key('onb-result'),
                        ),
                      ),
              ),
            ],
          ],
        );
    }
  }

  Widget _modelStep(BuildContext context, AppLocalizations t) {
    final text = Theme.of(context).textTheme;
    final m = controller.model;
    final busy =
        m == ModelUiState.downloading ||
        m == ModelUiState.verifying ||
        m == ModelUiState.extracting;
    final status = switch (m) {
      ModelUiState.downloading => t.onbDownloading(controller.percent),
      ModelUiState.verifying => t.onbVerifying,
      ModelUiState.extracting => t.onbExtracting,
      ModelUiState.installed => t.onbInstalled,
      ModelUiState.paused => t.onbPaused,
      ModelUiState.failed => t.onbModelFailed,
      ModelUiState.integrity => t.onbModelIntegrity,
      ModelUiState.idle => '',
    };
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(t.onbModelTitle, style: text.titleLarge),
        const SizedBox(height: 8),
        Text(t.onbModelBody(controller.installer.sizeMb)),
        const SizedBox(height: 12),
        if (busy)
          LinearProgressIndicator(
            key: const Key('model-progress'),
            value: m == ModelUiState.downloading
                ? controller.percent / 100
                : null,
          ),
        if (status.isNotEmpty) ...[
          const SizedBox(height: 8),
          Text(status, key: const Key('model-status')),
        ],
        const SizedBox(height: 12),
        Wrap(
          spacing: 8,
          children: [
            if (m == ModelUiState.idle || m == ModelUiState.paused)
              FilledButton(
                onPressed: controller.download,
                child: Text(t.onbDownload),
              ),
            if (m == ModelUiState.failed || m == ModelUiState.integrity)
              FilledButton(
                onPressed: controller.download,
                child: Text(t.onbRetry),
              ),
            if (m == ModelUiState.downloading)
              OutlinedButton(
                onPressed: controller.pause,
                child: Text(t.onbPause),
              ),
          ],
        ),
      ],
    );
  }
}
