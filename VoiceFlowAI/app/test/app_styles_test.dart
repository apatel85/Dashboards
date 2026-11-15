import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/state/installed_apps.dart';
import 'package:voiceflow_app/state/per_app_profiles.dart';
import 'package:voiceflow_app/state/settings_controller.dart';
import 'package:voiceflow_app/ui/style_page.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'helpers.dart';

void main() {
  group('built-in app styles', () {
    test(
      'well-known apps have a default; your choice wins; unknown is null',
      () {
        final p = PerAppProfiles({}, onChanged: (_) {});
        expect(p.profileFor('com.google.android.gm'), 'professional'); // Gmail
        expect(p.profileFor('com.whatsapp'), 'casual');
        expect(p.profileFor('com.slack'), 'business'); // package is com.Slack
        expect(p.profileFor('com.anthropic.claude'), 'ai_prompting');
        expect(p.profileFor('COM.OPENAI.CHATGPT'), 'ai_prompting');
        expect(p.profileFor('com.example.unknown'), isNull);
        expect(p.overrideFor('com.google.android.gm'), isNull);
        final q = PerAppProfiles({
          'com.google.android.gm': 'casual',
        }, onChanged: (_) {});
        expect(q.profileFor('com.google.android.gm'), 'casual');
        q.replaceAll({});
        expect(q.profileFor('com.google.android.gm'), 'professional');
      },
    );

    test('AI apps pick the prompt layout automatically', () {
      PromptStyle f(String? app, {String fmt = 'auto'}) =>
          PromptStyle.resolve(promptFormat: fmt, appId: app);
      expect(f('com.anthropic.claude').format, 'xml');
      expect(f('com.openai.chatgpt').format, 'markdown');
      expect(f('com.google.android.apps.bard').format, 'labels');
      expect(f(null).format, 'labels');
      expect(f('com.anthropic.claude', fmt: 'labels').format, 'labels');
      expect(f('com.whatsapp', fmt: 'xml').format, 'xml');
      expect(PromptStyle.resolve(aiLength: 'as_said').conciseFirst, false);
      expect(PromptStyle.resolve().conciseFirst, true);
    });
  });

  group('settings controller', () {
    test('per-app style is saved, reported and removable', () async {
      final s = Settings();
      var saves = 0;
      Map<String, String>? seen;
      final c = SettingsController(
        s,
        () async => saves++,
        onPerAppChanged: (m) => seen = m,
      );
      await c.setAppProfile('  COM.Example.App ', 'casual');
      expect(s.perAppProfiles, {'com.example.app': 'casual'});
      expect(seen, {'com.example.app': 'casual'});
      await c.setAppProfile('com.example.app', null);
      expect(s.perAppProfiles, isEmpty);
      await c.setAppProfile('   ', 'casual'); // ignored
      expect(s.perAppProfiles, isEmpty);
      expect(saves, 2);
    });

    test(
      'prompt layout and length persist and survive export/import',
      () async {
        final s = Settings();
        final c = SettingsController(s, () async {});
        await c.setPromptFormat('xml');
        await c.setAiLength('as_said');
        final text = c.exportJson();
        final s2 = Settings();
        final c2 = SettingsController(s2, () async {});
        expect(await c2.importJson(text), isEmpty);
        expect(s2.promptFormat, 'xml');
        expect(s2.aiLength, 'as_said');
        // an unknown value in a file is ignored, not applied
        final bad = text.replaceAll('"xml"', '"<script>"');
        final s3 = Settings();
        expect(
          await SettingsController(s3, () async {}).importJson(bad),
          isEmpty,
        );
        expect(s3.promptFormat, 'auto');
      },
    );
  });

  testWidgets('Style page: Apps list shows built-ins and saves a change', (
    t,
  ) async {
    size(t, const Size(500, 3000));
    final ctl = await makeController(t);
    final s = Settings();
    final sc = SettingsController(s, () async {});
    addTearDown(sc.dispose);
    await t.pumpWidget(
      host(
        StylePage(
          controller: ctl,
          settings: sc,
          listApps: () async => const [
            PickableApp('com.example.notes', 'Notes'),
            PickableApp('com.example.calendar', 'Calendar'),
          ],
        ),
      ),
    );
    await t.pump();
    expect(
      find.byKey(const Key('app-row-com.google.android.gm')),
      findsOneWidget,
    );
    expect(find.text('Gmail'), findsOneWidget);
    // change Gmail to Casual
    await t.ensureVisible(
      find.byKey(const Key('app-style-com.google.android.gm')),
    );
    await t.tap(find.byKey(const Key('app-style-com.google.android.gm')));
    await t.pumpAndSettle();
    await t.tap(find.text('Casual').last);
    await t.pumpAndSettle();
    expect(s.perAppProfiles['com.google.android.gm'], 'casual');

    // pick an installed app from the list, give it a style, add it
    await t.ensureVisible(find.byKey(const Key('app-add-id')));
    await t.tap(find.byKey(const Key('app-add-id')));
    await t.pumpAndSettle();
    expect(find.text('Notes'), findsOneWidget);
    expect(find.text('Calendar'), findsOneWidget);
    await t.enterText(find.byKey(const Key('app-pick-search')), 'note');
    await t.pumpAndSettle();
    expect(find.text('Calendar'), findsNothing);
    await t.tap(find.byKey(const Key('app-pick-com.example.notes')));
    await t.pumpAndSettle();
    expect(
      (t.widget(
        find.byKey(const Key('app-add-id')),
      ) as TextField).controller!.text,
      'Notes',
    );
    await t.tap(find.byKey(const Key('app-add-button')));
    await t.pumpAndSettle();
    expect(s.perAppProfiles['com.example.notes'], 'professional');
    // the new row shows the friendly name
    expect(find.byKey(const Key('app-row-com.example.notes')), findsOneWidget);
    expect(find.text('Notes'), findsOneWidget);

    // an app that is not in the list can be typed as an id
    await t.ensureVisible(find.byKey(const Key('app-add-id')));
    await t.tap(find.byKey(const Key('app-add-id')));
    await t.pumpAndSettle();
    await t.enterText(
      find.byKey(const Key('app-pick-search')),
      'org.custom.thing',
    );
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('app-pick-custom')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('app-add-button')));
    await t.pumpAndSettle();
    expect(s.perAppProfiles.containsKey('org.custom.thing'), isTrue);
  });
}
