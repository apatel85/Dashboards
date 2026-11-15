import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/ime/ime_backend.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/state/pack_store.dart';
import 'package:voiceflow_app/state/settings_store.dart';
import 'package:voiceflow_app/ui/home_page.dart';
import 'package:voiceflow_app/ui/packs_page.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'dictation_service_test.dart' show FakeStt, tone;
import 'helpers.dart';

const _legal = {
  'id': 'legal_firm',
  'name': 'Legal (Firm)',
  'vocabulary': ['subpoena'],
  'abbreviations': {'nda': 'NDA'},
  'detectors': {
    'apps': ['clio'],
  },
};

Future<(PackStore, Directory, int Function())> makeStore(
  WidgetTester t, {
  Settings? settings,
}) async {
  final assets = (await t.runAsync(AppAssets.load))!;
  final dir = Directory.systemTemp.createTempSync('packs');
  addTearDown(() => dir.deleteSync(recursive: true));
  var saves = 0;
  final s = settings ?? Settings();
  final store = (await t.runAsync(
    () => PackStore.load(assets, s, () async => saves++, userDir: dir),
  ))!;
  return (store, dir, () => saves);
}

void main() {
  testWidgets('bundled packs load; only the saved ones are on, in order', (
    t,
  ) async {
    final s = Settings()
      ..activePacks = ['healthcare_clinic', 'general_business'];
    final (store, _, _) = await makeStore(t, settings: s);
    expect(store.registry.all.map((p) => p.id).toSet(), {
      'general_business',
      'healthcare_clinic',
      'cricket',
    });
    expect(store.active.map((p) => p.id), [
      'healthcare_clinic',
      'general_business',
    ]);
    expect(store.isBundled('general_business'), isTrue);
  });

  testWidgets('import validates, saves to disk, survives a restart', (t) async {
    final (store, dir, _) = await makeStore(t);
    final errs = (await t.runAsync(
      () => store.importJson(jsonEncode(_legal), 'legal.json'),
    ))!;
    expect(errs, isEmpty);
    expect(File('${dir.path}/legal_firm.json').existsSync(), isTrue);
    final assets = (await t.runAsync(AppAssets.load))!;
    final again = (await t.runAsync(
      () => PackStore.load(assets, Settings(), () async {}, userDir: dir),
    ))!;
    expect(again.registry.byId('legal_firm')?.name, 'Legal (Firm)');
  });

  testWidgets('a refused import explains why and leaves nothing behind', (
    t,
  ) async {
    final (store, dir, _) = await makeStore(t);
    final errs = (await t.runAsync(
      () => store.importJson('{"id":"Bad Id","name":"x"}', 'bad.json'),
    ))!;
    expect(errs, isNotEmpty);
    expect(dir.listSync(), isEmpty);
    expect(store.registry.byId('Bad Id'), isNull);
    expect(store.errors, isEmpty, reason: 'shown once in the dialog, not kept');
  });

  testWidgets(
    'a corrupt file already in the user folder is reported, not fatal',
    (t) async {
      final dir = Directory.systemTemp.createTempSync('packs');
      addTearDown(() => dir.deleteSync(recursive: true));
      File('${dir.path}/broken.json').writeAsStringSync('{ nope');
      final assets = (await t.runAsync(AppAssets.load))!;
      final store = (await t.runAsync(
        () => PackStore.load(assets, Settings(), () async {}, userDir: dir),
      ))!;
      expect(store.errors.single.source, 'broken.json');
      expect(store.registry.all, isNotEmpty);
    },
  );

  testWidgets('switching, ordering and removal persist through settings', (
    t,
  ) async {
    final s = Settings();
    final (store, dir, saves) = await makeStore(t, settings: s);
    await t.runAsync(() => store.importJson(jsonEncode(_legal), 'legal.json'));
    await t.runAsync(() => store.setActive('healthcare_clinic', true));
    await t.runAsync(() => store.setActive('legal_firm', true));
    expect(s.activePacks, [
      'general_business',
      'healthcare_clinic',
      'legal_firm',
    ]);
    await t.runAsync(() => store.move('legal_firm', -2));
    expect(s.activePacks.first, 'legal_firm');
    await t.runAsync(() => store.removeUserPack('legal_firm'));
    expect(s.activePacks, isNot(contains('legal_firm')));
    expect(File('${dir.path}/legal_firm.json').existsSync(), isFalse);
    await t.runAsync(() => store.removeUserPack('general_business'));
    expect(
      store.registry.byId('general_business'),
      isNotNull,
      reason: 'bundled stays',
    );
    expect(saves() >= 4, isTrue);
  });

  testWidgets(
    'suggestions never switch anything on; dismiss hides for the session',
    (t) async {
      final s = Settings()..activePacks = [];
      final (store, _, _) = await makeStore(t, settings: s);
      final found = store.suggest(const DetectContext(appId: 'epic.exe'));
      expect(found.single.pack.id, 'healthcare_clinic');
      expect(store.active, isEmpty);
      store.dismissSuggestion('healthcare_clinic');
      expect(store.suggest(const DetectContext(appId: 'epic.exe')), isEmpty);
    },
  );

  testWidgets(
    'Packs page: lists, shows the on-device badge, toggles, reorders',
    (t) async {
      size(t, const Size(500, 1400));
      final s = Settings()
        ..activePacks = ['general_business', 'healthcare_clinic'];
      final (store, _, _) = await makeStore(t, settings: s);
      await t.pumpWidget(host(PacksPage(store: store)));
      await t.pump();
      expect(find.byKey(const Key('pack-general_business')), findsOneWidget);
      expect(find.byKey(const Key('pack-local-only')), findsOneWidget);
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('pack-down-general_business')));
      });
      await t.pump();
      expect(s.activePacks, ['healthcare_clinic', 'general_business']);
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('pack-switch-healthcare_clinic')));
      });
      await t.pump();
      expect(s.activePacks, ['general_business']);
    },
  );

  testWidgets(
    'Packs page import: success adds the pack, refusal shows reasons',
    (t) async {
      size(t, const Size(500, 1400));
      final (store, _, _) = await makeStore(t);
      var next = ('legal.json', jsonEncode(_legal));
      await t.pumpWidget(host(PacksPage(store: store, pick: () async => next)));
      await t.pump();
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('packs-import')));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await t.pump();
      expect(find.byKey(const Key('pack-legal_firm')), findsOneWidget);

      next = (
        'oops.json',
        '{"id":"x","name":"X","rules":[{"pattern":"(a+)+b","replace":"c"}]}',
      );
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('packs-import')));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await t.pump();
      expect(find.byKey(const Key('pack-refused')), findsOneWidget);
      expect(find.textContaining('can hang the app'), findsOneWidget);
    },
  );

  testWidgets(
    'Home shows a pack suggestion chip; "Turn on" is the only thing that activates',
    (t) async {
      size(t, const Size(900, 1000));
      final s = Settings()..activePacks = [];
      final (store, _, _) = await makeStore(t, settings: s);
      final c = await makeController(t);
      c.foregroundApp = () => 'epic.exe';
      await t.pumpWidget(host(HomePage(controller: c, packStore: store)));
      await t.pump();
      expect(find.byKey(const Key('pack-suggestion')), findsOneWidget);
      expect(s.activePacks, isEmpty, reason: 'shown, not applied');
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('pack-suggestion-on')));
      });
      await t.pump();
      expect(s.activePacks, ['healthcare_clinic']);
      expect(find.byKey(const Key('pack-suggestion')), findsNothing);
    },
  );

  group('keyboard backend', () {
    test(
      'suggestions, activation, dismissal and dictation with the pack on',
      () async {
        TestWidgetsFlutterBinding.ensureInitialized();
        final tmp = await Directory.systemTemp.createTemp('imepk');
        addTearDown(() => tmp.deleteSync(recursive: true));
        const spec = ModelSpec(
          id: 'm',
          lang: 'en',
          url: 'http://x',
          sha256: 'abc',
          sizeMb: 1,
          license: 'MIT',
          files: ['a.bin'],
        );
        final models = ModelManager(spec, Directory('${tmp.path}/models'));
        models.dir.createSync(recursive: true);
        File(models.path('a.bin')).writeAsStringSync('x');
        File('${models.dir.path}/.verified').writeAsStringSync('abc');
        final packs = Directory('${tmp.path}/packs')..createSync();
        File('${packs.path}/legal_firm.json')
            .writeAsStringSync(jsonEncode(_legal));
        final stt = FakeStt('sign the nda');
        final store = SettingsStore(Directory('${tmp.path}/s'));
        final b = ImeBackend(
          assets: await AppAssets.load(),
          store: store,
          models: models,
          stt: stt,
          ensureLoaded: () async {},
          unloadEngine: () async {},
          packsDir: packs,
        );

        var sug = await b.handle(
          const MethodCall('suggestions', {'packageName': 'com.clio.app'}),
        );
        expect((sug as List).single['id'], 'legal_firm');
        // shown only: not on yet, so the abbreviation is not applied
        final pcm = tone();
        var r = await b.dictate({'pcm': pcm});
        expect(r['text'], 'Sign the nda.');

        final active = await b.handle(
          const MethodCall('activatePack', {'id': 'legal_firm'}),
        );
        expect(active, contains('legal_firm'));
        expect((await store.load()).activePacks, contains('legal_firm'));
        r = await b.dictate({'pcm': pcm});
        expect(r['text'], 'Sign the NDA.');

        sug = await b.handle(
          const MethodCall('suggestions', {'packageName': 'com.clio.app'}),
        );
        expect(sug, isEmpty, reason: 'already on');

        await b.handle(
          const MethodCall('dismissPack', {'id': 'healthcare_clinic'}),
        );
        sug = await b.handle(
          const MethodCall('suggestions', {'packageName': 'epic'}),
        );
        expect(sug, isEmpty);
      },
    );
  });
}
