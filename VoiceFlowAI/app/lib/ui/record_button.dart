import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/dictation_service.dart';
import '../state/dictation_state.dart';

/// Start/stop dictation inside the app (copy-mode fallback on every platform).
class RecordButton extends StatelessWidget {
  const RecordButton({
    super.key,
    required this.controller,
    required this.service,
  });
  final AppController controller;
  final DictationService service;

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        final listening = controller.state == DictationUiState.listening;
        final busy =
            controller.state == DictationUiState.processing ||
            controller.state == DictationUiState.polishing;
        return FilledButton.icon(
          onPressed: busy ? null : service.toggle,
          icon: Icon(listening ? Icons.stop : Icons.mic),
          label: Text(listening ? t.stopButton : t.recordButton),
        );
      },
    );
  }
}
