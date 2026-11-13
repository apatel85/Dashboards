import 'package:material_ui/material_ui.dart';

import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';

/// Profile cards with a before/after example produced by the real formatter.
class StylePage extends StatelessWidget {
  const StylePage({super.key, required this.controller});
  final AppController controller;

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
      listenable: controller,
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
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
