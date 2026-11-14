import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/pack_store.dart';

/// One-tap pack suggestion (spec §8.3). Shown, never applied on its own: nothing changes until
/// the person taps "Turn on". Based on the focused app and what they dictated last.
class PackSuggestionBar extends StatelessWidget {
  const PackSuggestionBar({
    super.key,
    required this.store,
    required this.controller,
  });
  final PackStore store;
  final AppController controller;

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([store, controller]),
      builder: (context, _) {
        final recent = controller.recent.isEmpty
            ? null
            : controller.recent.first.text;
        final found = store.suggest(
          DetectContext(appId: controller.foregroundApp?.call(), text: recent),
        );
        if (found.isEmpty) return const SizedBox.shrink();
        final s = found.first;
        final t = AppLocalizations.of(context);
        return Card(
          key: const Key('pack-suggestion'),
          margin: const EdgeInsets.only(bottom: 16),
          child: Padding(
            padding: const EdgeInsets.all(12),
            child: Row(
              children: [
                const Icon(Icons.lightbulb_outline),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(t.packSuggest(s.pack.name)),
                      Text(
                        t.packSuggestWhy(s.reasons.join(', ')),
                        style: Theme.of(context).textTheme.bodySmall,
                      ),
                    ],
                  ),
                ),
                TextButton(
                  key: const Key('pack-suggestion-dismiss'),
                  onPressed: () => store.dismissSuggestion(s.pack.id),
                  child: Text(t.packsDismiss),
                ),
                FilledButton(
                  key: const Key('pack-suggestion-on'),
                  onPressed: () => store.setActive(s.pack.id, true),
                  child: Text(t.packSuggestOn),
                ),
              ],
            ),
          ),
        );
      },
    );
  }
}
