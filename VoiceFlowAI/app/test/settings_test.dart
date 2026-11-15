import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/ime/ime_backend.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/state/polish_holder.dart';
import 'package:voiceflow_app/state/settings_controller.dart';
import 'package:voiceflow_app/state/settings_store.dart';
import 'package:voiceflow_app/ui/settings_page.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'dictation_service_test.dart' show FakeStt, tone;
import 'helpers.dart';

MockClient _ok(void Function() onCall) => MockClient((req) async {
  onCall();
  return http.Response(jsonEncode({'text': 'Hello, this is a test.'}), 200);
});

PolishHolder _holder(Settings s, http.Client c) => PolishHolder(
  s,
  client: c,
  proxyUrl: 'https://x.test/fn',
  proxyAnonKey: 'anon',
);

void main() {
  group('controller', () {
    test('turning cloud polish on records consent; off clears it', () async {
      final s = Settings();
      var saves = 0;
      final c = SettingsController(s, () async => saves++);
      await c.setCloudPolish(true, consent: true);
      expect(s.cloudActive, isTrue);
      await c.setCloudPolish(false, consent: false);
      expect(s.cloudPolish, isFalse);
      expect(s.cloudConsent, isFalse);
      expect(saves, 2);
    });

    test('a different kind of server is a new decision: switching preset resets consent', () async {
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      await SettingsController(s, () async {}).setPreset('ollama');
      expect(s.cloudPreset, 'ollama');
      expect(s.cloudPolish, isFalse);
      expect(s.cloudConsent, isFalse);
    });

    test('import applies on the shared object and notifies; a bad file changes nothing', () async {
      final s = Settings()..dictionary = ['keep'];
      var notified = 0;
      final c = SettingsController(
        s,
        () async {},
        onImported: () => notified++,
      );
      final errs = await c.importJson(
        jsonEncode({
          'dictionary': ['Kubernetes'],
          'cloudConsent': true,
        }),
      );
      expect(errs, isEmpty);
      expect(s.dictionary, ['Kubernetes']);
      expect(s.cloudConsent, isFalse, reason: 'a file cannot grant consent');
      expect(notified, 1);
      final bad = await c.importJson('{ nope');
      expect(bad, isNotEmpty);
      expect(s.dictionary, ['Kubernetes']);
      expect(notified, 1);
    });

    test('export has no secrets and imports back', () async {
      final s = Settings()..dictionary = ['Zed'];
      final json = SettingsController(s, () async {}).exportJson();
      expect(json, isNot(contains('anon')));
      final t = Settings();
      await SettingsController(t, () async {}).importJson(json);
      expect(t.dictionary, ['Zed']);
    });
  });

  group('polish holder', () {
    test('default settings: no chain, so no network', () {
      var calls = 0;
      final h = _holder(Settings(), _ok(() => calls++));
      expect(h.chain, isNull);
      expect(calls, 0);
    });

    test('the chain is kept until polish settings change', () {
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      final h = _holder(s, _ok(() {}));
      final a = h.chain;
      expect(a, isNotNull);
      s.soundsOn = false;
      expect(identical(h.chain, a), isTrue);
      s.cloudPolish = false;
      expect(h.chain, isNull);
    });

    test('test() answers in plain words', () async {
      final off = await _holder(Settings(), _ok(() {})).test();
      expect(off, contains('off'));
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      expect(
        await _holder(s, _ok(() {})).test(),
        contains('Hello, this is a test.'),
      );
      final down = MockClient((_) async => http.Response('nope', 503));
      expect(await _holder(s, down).test(), contains('No answer'));
    });
  });

  group('settings page', () {
    Future<(SettingsController, Settings, PolishHolder, List<String>)> mount(
      WidgetTester t, {
      Settings? settings,
      http.Client? client,
      SettingsFilePicker? pick,
    }) async {
      size(t, const Size(600, 2200));
      final s = settings ?? Settings();
      final c = SettingsController(s, () async {});
      final polish = _holder(s, client ?? _ok(() {}));
      final copied = <String>[];
      await t.pumpWidget(
        host(
          SettingsPage(
            controller: c,
            polish: polish,
            pick: pick ?? () async => null,
            copyToClipboard: (v) async => copied.add(v),
          ),
        ),
      );
      await t.pump();
      return (c, s, polish, copied);
    }

    testWidgets('cloud polish is off, and turning it on asks first', (t) async {
      final (_, s, _, _) = await mount(t);
      expect(s.cloudPolish, isFalse);
      await t.tap(find.byKey(const Key('set-cloud')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('consent-dialog')), findsOneWidget);
      expect(
        s.cloudPolish,
        isFalse,
        reason: 'nothing changes before the person agrees',
      );
      await t.tap(find.byKey(const Key('consent-cancel')));
      await t.pumpAndSettle();
      expect(s.cloudPolish, isFalse);

      await t.tap(find.byKey(const Key('set-cloud')));
      await t.pumpAndSettle();
      await t.tap(find.byKey(const Key('consent-agree')));
      await t.pumpAndSettle();
      expect(s.cloudActive, isTrue);
    });

    testWidgets(
      'the free-tier privacy note is shown, and masking is a switch',
      (t) async {
        final (_, s, _, _) = await mount(t);
        expect(find.byKey(const Key('set-cloud-privacy')), findsOneWidget);
        expect(
          find.textContaining('free Gemini tier'),
          findsOneWidget,
          reason: 'the plain-words privacy note (spec section 2)',
        );
        expect(find.byKey(const Key('set-mask')), findsNothing);
        await t.tap(find.byKey(const Key('set-cloud')));
        await t.pumpAndSettle();
        await t.tap(find.byKey(const Key('consent-agree')));
        await t.pumpAndSettle();
        expect(s.maskCloud, isFalse, reason: 'off until chosen');
        await t.tap(find.byKey(const Key('set-mask')));
        await t.pumpAndSettle();
        expect(s.maskCloud, isTrue);
      },
    );

    testWidgets('a server on this computer needs no consent dialog', (t) async {
      final s = Settings()..cloudPreset = 'ollama';
      await mount(t, settings: s);
      await t.tap(find.byKey(const Key('set-cloud')));
      await t.pumpAndSettle();
      expect(find.byKey(const Key('consent-dialog')), findsNothing);
      expect(s.cloudPolish, isTrue);
      expect(s.cloudConsent, isFalse);
    });

    testWidgets('Test polish shows a plain-language result', (t) async {
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      await mount(t, settings: s);
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('set-test')));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await t.pump();
      expect(find.byKey(const Key('set-test-result')), findsOneWidget);
      expect(find.textContaining('Hello, this is a test.'), findsOneWidget);
    });

    testWidgets('export copies settings; import restores or explains', (
      t,
    ) async {
      var next = (
        's.json',
        jsonEncode({
          'dictionary': ['Restored'],
        }),
      );
      final s = Settings()..dictionary = ['Mine'];
      final (_, _, _, copied) = await mount(
        t,
        settings: s,
        pick: () async => next,
      );
      await t.tap(find.byKey(const Key('set-export')));
      await t.pump();
      expect(copied.single, contains('Mine'));

      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('set-import')));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await t.pump();
      expect(s.dictionary, ['Restored']);

      next = ('bad.json', jsonEncode({'ollamaUrl': 'https://evil.example/v1'}));
      await t.runAsync(() async {
        await t.tap(find.byKey(const Key('set-import')));
        await Future<void>.delayed(const Duration(milliseconds: 100));
      });
      await t.pump();
      expect(find.byKey(const Key('import-refused')), findsOneWidget);
      expect(s.dictionary, ['Restored']);
    });

    testWidgets('privacy statement and version are shown', (t) async {
      await mount(t);
      expect(find.textContaining('never saved'), findsOneWidget);
      expect(find.byKey(const Key('set-version')), findsOneWidget);
    });
  });

  test(
    'keyboard backend: polish happens only with the switch and consent',
    () async {
      TestWidgetsFlutterBinding.ensureInitialized();
      final tmp = Directory.systemTemp.createTempSync('imepol');
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
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response(
          jsonEncode({'text': 'We will ship the new build on Friday.'}),
          200,
        );
      });
      final store = SettingsStore(Directory('${tmp.path}/s'));
      final b = ImeBackend(
        assets: await AppAssets.load(),
        store: store,
        models: models,
        stt: FakeStt('we will ship the new build on friday'),
        ensureLoaded: () async {},
        unloadEngine: () async {},
        polish: _holder(Settings(), client),
      );
      var r = await b.dictate({'pcm': tone(), 'profileId': 'professional'});
      expect(r['status'], 'ok');
      expect(calls, 0, reason: 'default settings: no network');
      final s = await store.load();
      s
        ..cloudPolish = true
        ..cloudConsent = true;
      await store.save(s);
      r = await b.dictate({'pcm': tone(), 'profileId': 'professional'});
      expect(calls, 1);
      expect(r['polish'], isTrue);
    },
  );
}
