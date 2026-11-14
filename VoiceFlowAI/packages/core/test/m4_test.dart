import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

Settings _ok(Settings cur, Map<String, dynamic> file) {
  final r = SettingsImporter.importFrom(jsonEncode(file), cur);
  expect(r.errors, isEmpty);
  return r.settings!;
}

void main() {
  group('settings import', () {
    test('a full export imports back to the same settings', () {
      final a = Settings()
        ..defaultProfileId = 'professional'
        ..perAppProfiles = {'slack.exe': 'casual'}
        ..dictionary = ['Kubernetes']
        ..corrections = {'teh': 'the'}
        ..activePacks = ['healthcare_clinic', 'general_business']
        ..retentionDays = 30;
      final b = SettingsImporter.importFrom(a.export(), Settings());
      expect(b.ok, isTrue);
      expect(b.settings!.toJson()['dictionary'], ['Kubernetes']);
      expect(b.settings!.defaultProfileId, 'professional');
      expect(b.settings!.perAppProfiles, {'slack.exe': 'casual'});
      expect(
          b.settings!.activePacks, ['healthcare_clinic', 'general_business']);
      expect(b.settings!.retentionDays, 30);
    });

    test('a file can never switch cloud polish on or grant consent', () {
      final cur = Settings();
      final s = _ok(cur, {'cloudPolish': true, 'cloudConsent': true});
      expect(s.cloudPolish, isFalse);
      expect(s.cloudConsent, isFalse);
      // and it does not take them away either
      final on = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      final t = _ok(on, {'cloudPolish': false, 'cloudConsent': false});
      expect(t.cloudActive, isTrue);
    });

    test('onboarding state and microphone choice stay on this device', () {
      final cur = Settings()
        ..onboardingDone = true
        ..micDeviceId = 'my-mic';
      final s = _ok(cur, {'onboardingDone': false, 'micDeviceId': 'other'});
      expect(s.onboardingDone, isTrue);
      expect(s.micDeviceId, 'my-mic');
    });

    test('unknown keys are ignored; an old v0 file migrates', () {
      expect(_ok(Settings(), {'futureThing': 1}).hotkey, 'F9');
      expect(_ok(Settings(), {'profile': 'casual'}).defaultProfileId, 'casual');
    });

    test('an API key in a file is dropped, never stored', () {
      final s = _ok(Settings(), {'apiKey': 'sk-secret', 'geminiKey': 'x'});
      expect(s.export(), isNot(contains('sk-secret')));
    });

    final bad = <String, String>{
      'not JSON': '{ nope',
      'a list': '[1]',
      'newer version': jsonEncode({'version': 99}),
      'wrong type': jsonEncode({'soundsOn': 'yes'}),
      'dictionary of numbers': jsonEncode({
        'dictionary': [1, 2]
      }),
      'too many words': jsonEncode({'dictionary': List.filled(5001, 'a')}),
      'bad preset': jsonEncode({'cloudPreset': 'evil'}),
      'remote server address':
          jsonEncode({'ollamaUrl': 'https://evil.example.com/v1'}),
      'retention as text': jsonEncode({'retentionDays': 'week'}),
    };
    for (final e in bad.entries) {
      test('refuses: ${e.key}, changes nothing, says why', () {
        final r = SettingsImporter.importFrom(e.value, Settings());
        expect(r.ok, isFalse);
        expect(r.errors, isNotEmpty);
        expect(r.errors.every((m) => m.length < 120), isTrue);
      });
    }

    test('retention is clamped, not trusted', () {
      expect(_ok(Settings(), {'retentionDays': 100000}).retentionDays, 365);
      expect(_ok(Settings(), {'retentionDays': 0}).retentionDays, 1);
    });

    test(
        'the importing device is not mutated until the caller applies the result',
        () {
      final cur = Settings()..dictionary = ['keep'];
      SettingsImporter.importFrom(
          jsonEncode({
            'dictionary': ['new']
          }),
          cur);
      expect(cur.dictionary, ['keep']);
    });
  });

  group('polish setup follows settings and consent', () {
    final client = MockClient((_) async => http.Response('{}', 200));
    PolishChain? chain(Settings s) => polishChainFor(s,
        client: client, proxyUrl: 'https://x.test/fn', proxyAnonKey: 'anon');

    test('default settings: no polish at all',
        () => expect(chain(Settings()), isNull));
    test('switch on but no consent: still nothing leaves the device', () {
      expect(chain(Settings()..cloudPolish = true), isNull);
    });
    test('switch on + consent: the hosted proxy', () {
      final c = chain(Settings()
        ..cloudPolish = true
        ..cloudConsent = true)!;
      expect(c.engines.single.name, 'voiceflow-proxy');
      expect(c.engines.single.leavesDevice, isTrue);
    });
    test('consent without the switch: still nothing', () {
      expect(chain(Settings()..cloudConsent = true), isNull);
    });
    test('local server needs a model but no consent', () {
      final s = Settings()
        ..cloudPolish = true
        ..cloudPreset = 'ollama';
      expect(chain(s), isNull);
      s.ollamaModel = 'llama3.2';
      final c = chain(s)!;
      expect(c.engines.single.leavesDevice, isFalse);
    });
    test('a local-server setting that is not local needs consent', () {
      final s = Settings()
        ..cloudPolish = true
        ..cloudPreset = 'ollama'
        ..ollamaModel = 'm'
        ..ollamaUrl = 'https://example.com/v1';
      expect(chain(s), isNull);
      s.cloudConsent = true;
      expect(chain(s), isNotNull);
    });
    test('missing proxy address or key: off, not a crash', () {
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      expect(polishChainFor(s, client: client, proxyUrl: '', proxyAnonKey: 'a'),
          isNull);
      expect(polishChainFor(s, client: client, proxyUrl: 'u', proxyAnonKey: ''),
          isNull);
    });
    test('fingerprint changes only when polish-relevant settings change', () {
      final s = Settings();
      final f0 = polishFingerprint(s);
      s.soundsOn = false;
      s.dictionary = ['x'];
      expect(polishFingerprint(s), f0);
      s.cloudPolish = true;
      expect(polishFingerprint(s), isNot(f0));
    });
  });

  group('privacy guarantees (spec §11)', () {
    DictationPipeline pipe(Settings s, http.Client client, FakeSink sink,
            {String say = 'we will ship the new build on friday'}) =>
        DictationPipeline(loadLang(), FakeStt(say), sink,
            polishProvider: () => polishChainFor(s,
                client: client,
                proxyUrl: 'https://x.test/fn',
                proxyAnonKey: 'anon'));

    test('NO-NETWORK: default settings never touch the network', () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      });
      final sink = FakeSink();
      final r = await pipe(Settings(), client, sink)
          .run(speechPcm(), DictationOptions(loadProfile('professional')));
      expect(r.status, DictationStatus.ok);
      expect(sink.inserted, isNotEmpty);
      expect(calls, 0);
    });

    test('...and the guard has teeth: with polish + consent a call IS made',
        () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response(
            jsonEncode({'text': 'We will ship the new build on Friday.'}), 200);
      });
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      await pipe(s, client, FakeSink())
          .run(speechPcm(), DictationOptions(loadProfile('professional')));
      expect(calls, 1);
    });

    test('the live switch: turning polish off mid-session stops calls at once',
        () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response(
            jsonEncode({'text': 'We will ship the new build on Friday.'}), 200);
      });
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      final p = pipe(s, client, FakeSink());
      await p.run(speechPcm(), DictationOptions(loadProfile('professional')));
      expect(calls, 1);
      s.cloudPolish = false;
      await p.run(speechPcm(), DictationOptions(loadProfile('professional')));
      expect(calls, 1);
    });

    test('a pack with cloudAllowed:false overrides consent', () async {
      var calls = 0;
      final client = MockClient((_) async {
        calls++;
        return http.Response('{}', 200);
      });
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      await pipe(s, client, FakeSink()).run(
          speechPcm(),
          DictationOptions(loadProfile('professional'),
              packs: [loadPack('healthcare_clinic')]));
      expect(calls, 0);
    });

    test(
        'only the text is sent: no audio, no key other than the public anon key',
        () async {
      late http.Request seen;
      final client = MockClient((req) async {
        seen = req;
        return http.Response(
            jsonEncode({'text': 'We will ship the new build on Friday.'}), 200);
      });
      final s = Settings()
        ..cloudPolish = true
        ..cloudConsent = true;
      await pipe(s, client, FakeSink())
          .run(speechPcm(), DictationOptions(loadProfile('professional')));
      final body = jsonDecode(seen.body) as Map;
      expect(body.keys.toSet(), {'system', 'text', 'maxTokens'});
      expect(seen.bodyBytes.length < 8000, isTrue);
      expect(seen.headers['authorization'], 'Bearer anon');
    });

    test('dictated text is never printed (no transcript in logs)', () async {
      const secret = 'zebra quokka confidential merger';
      final logs = <String>[];
      final sink = FakeSink();
      await runZoned(() async {
        // success path, STT failure path and insert-failure path
        await DictationPipeline(loadLang(), FakeStt(secret), sink)
            .run(speechPcm(), DictationOptions(loadProfile('professional')));
        await DictationPipeline(loadLang(),
                FakeStt(secret, throwError: StateError(secret)), FakeSink())
            .run(speechPcm(), DictationOptions(loadProfile('professional')));
        final failing = FakeSink()..result = InsertResult.failed;
        await DictationPipeline(loadLang(), FakeStt(secret), failing)
            .run(speechPcm(), DictationOptions(loadProfile('professional')));
      },
          zoneSpecification: ZoneSpecification(
              print: (self, parent, zone, line) => logs.add(line)));
      expect(logs.where((l) => l.toLowerCase().contains('quokka')), isEmpty);
      expect(sink.inserted.single.toLowerCase(), contains('quokka'));
    });
  });

  group('resilience', () {
    test('the sink throwing is a recoverable failure, not a crash', () async {
      final sink = _ThrowingSink();
      final p =
          DictationPipeline(loadLang(), FakeStt('hello there everyone'), sink);
      final r =
          await p.run(speechPcm(), DictationOptions(loadProfile('business')));
      expect(r.status, DictationStatus.insertFailed);
      expect(p.recover.take(), 'Hello there everyone.');
    });

    test('a locked clipboard result keeps the text for the user', () async {
      final sink = FakeSink()..result = InsertResult.failed;
      final p =
          DictationPipeline(loadLang(), FakeStt('please keep this text'), sink);
      final r =
          await p.run(speechPcm(), DictationOptions(loadProfile('business')));
      expect(r.status, DictationStatus.insertFailed);
      expect(p.recover.take(), 'Please keep this text.');
    });

    test('many dictations at once all finish and none is lost', () async {
      final sink = FakeSink();
      final p = DictationPipeline(loadLang(), FakeStt('count me in'), sink);
      await Future.wait([
        for (var i = 0; i < 25; i++)
          p.run(speechPcm(), DictationOptions(loadProfile('business')))
      ]);
      expect(sink.inserted.length, 25);
    });

    test('a 5-minute recording does not crash and stays fast', () async {
      final sw = Stopwatch()..start();
      final p = DictationPipeline(
          loadLang(), FakeStt('a very long dictation'), FakeSink());
      final r = await p.run(
          speechPcm(seconds: 300), DictationOptions(loadProfile('business')));
      expect(r.status, DictationStatus.ok);
      expect(sw.elapsedMilliseconds < 5000, isTrue,
          reason: '${sw.elapsedMilliseconds} ms');
    });

    test('garbage settings, pack and transcript inputs never throw', () {
      for (final s in [
        '',
        'null',
        '[]',
        '{"version":"x"}',
        '\u0000',
        '{"dictionary":{"a":1}}'
      ]) {
        expect(
            () => SettingsImporter.importFrom(s, Settings()), returnsNormally,
            reason: s);
        expect(() => DomainPack.load(s), returnsNormally, reason: s);
      }
    });
  });
}

class _ThrowingSink implements TextSink {
  @override
  Future<InsertResult> insert(String text) async => throw StateError('boom');
  @override
  Future<void> undoLast() async {}
}
