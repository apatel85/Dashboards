import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

void main() {
  final lang = loadLang();

  group('voice commands', () {
    final c = VoiceCommandParser(lang);
    test('new line / paragraph', () {
      final s = c.parse('hello new line world new paragraph bye');
      expect(s.length, 5);
      expect((s[1] as CommandSegment).kind, CommandKind.newLine);
      expect((s[3] as CommandSegment).kind, CommandKind.newParagraph);
    });
    test('scratch that alone = undo previous', () {
      final s = c.parse('scratch that');
      expect((s.single as CommandSegment).kind, CommandKind.undoPrevious);
    });
    test('scratch that at end = discard', () {
      final s = c.parse('send the report scratch that');
      expect((s.single as CommandSegment).kind, CommandKind.discardUtterance);
    });
    test('literal inserts command phrase as text', () {
      final s = c.parse('type literal new line here');
      expect(s.whereType<CommandSegment>(), isEmpty);
      expect((s.single as TextSegment).text, 'type new line here');
    });
    test('bullet list until end list', () {
      final s = c.parse('groceries bullet list milk eggs end list thanks');
      expect(s.whereType<BulletSegment>().length, 1);
      expect(s.last, isA<TextSegment>());
    });
  });

  group('validator', () {
    final v = PolishValidator();
    test('accepts clean output', () {
      expect(
          v.validate('hello team the launch is in 2 weeks',
              'Hello team, the launch is in 2 weeks.'),
          isNull);
    });
    test('rejects empty, preface, long, digits, glossary, script, drift', () {
      expect(v.validate('hi', ''), 'empty');
      expect(v.validate('hi there', 'Sure! Hi there.'), 'preface');
      expect(v.validate('hi', 'x' * 300), 'too long');
      expect(v.validate('we owe 4500 dollars today', 'We owe money today.'),
          'digits');
      expect(
          v.validate('prescribe metformin daily please',
              'Prescribe metaformin daily please.',
              glossary: ['metformin']),
          'glossary');
      expect(
          v.validate('hello there my friend', 'привет там мой друг'), 'script');
      expect(
          v.validate('please summarize the quarterly revenue numbers now',
              'Roses are red violets are blue poetry is nice.'),
          'drift');
    });
  });

  group('post processor', () {
    final pp = PostProcessor(lang);
    test('fuzzy dictionary correction', () {
      expect(pp.process('Take metphormin daily.', dictionary: ['metformin']),
          'Take metformin daily.');
    });
    test('never alters common words', () {
      expect(pp.process('There are three of them.', dictionary: ['Therese']),
          'There are three of them.');
    });
    test('pack abbreviations', () {
      final p = loadPack('general_business');
      expect(pp.process('Send it eod.', packs: [p]), 'Send it end of day.');
    });
  });

  group('settings & history', () {
    test('migrates v0 and strips stored keys', () {
      final s = Settings.fromJson({'profile': 'casual', 'geminiKey': 'SECRET'});
      expect(s.defaultProfileId, 'casual');
      expect(s.export().contains('SECRET'), isFalse);
      expect(s.cloudPolish, isFalse); // off by default
      expect(s.cloudActive, isFalse);
    });
    test('onboarding + mic device survive a save/load round trip', () {
      final s = Settings()
        ..onboardingDone = true
        ..micDeviceId = 'dev-7';
      final back =
          Settings.fromJson(jsonDecode(s.export()) as Map<String, dynamic>);
      expect(back.onboardingDone, isTrue);
      expect(back.micDeviceId, 'dev-7');
      expect(Settings.fromJson({}).onboardingDone, isFalse);
    });
    test('cloud needs consent', () {
      final s = Settings()..cloudPolish = true;
      expect(s.cloudActive, isFalse);
      s.cloudConsent = true;
      expect(s.cloudActive, isTrue);
    });
    test('history purge, search, disable, corrupt file', () async {
      var t = DateTime(2026, 1, 1);
      final st = MemoryHistoryStorage();
      final h = HistoryStore(st, now: () => t);
      await h.add('hello world', 'casual');
      t = t.add(const Duration(days: 8));
      await h.add('fresh note', 'casual');
      expect(h.items.map((e) => e.text), ['fresh note']);
      expect(h.search('FRESH').length, 1);
      h.enabled = false;
      await h.add('ignored', 'casual');
      expect(h.items.length, 1);
      st.data = '{not json';
      await h.load();
      expect(h.items, isEmpty);
    });
  });

  group('adapters (mock http)', () {
    test('gemini request shape + parse', () async {
      late http.Request seen;
      final c = MockClient((r) async {
        seen = r;
        return http.Response(
            jsonEncode({
              'candidates': [
                {
                  'content': {
                    'parts': [
                      {'text': ' Hi. '}
                    ]
                  }
                }
              ]
            }),
            200);
      });
      final a = GeminiAdapter(c, apiKey: 'k', model: 'gemini-x');
      expect(await a.complete('sys', 'hi'), 'Hi.');
      expect(seen.headers['x-goog-api-key'], 'k');
      expect(seen.url.path, '/v1beta/models/gemini-x:generateContent');
      expect(jsonDecode(seen.body)['generationConfig']['temperature'], 0);
    });
    test('pickFlashLite chooses newest', () async {
      final c = MockClient((r) async => http.Response(
          jsonEncode({
            'models': [
              {'name': 'models/gemini-2.5-flash-lite'},
              {'name': 'models/gemini-3.5-flash-lite'},
              {'name': 'models/gemini-3.5-pro'},
            ]
          }),
          200));
      expect(
          await GeminiAdapter.pickFlashLite(c, 'k'), 'gemini-3.5-flash-lite');
    });
    test('429 / 500 / timeout / malformed', () async {
      for (final (code, body, rl) in [
        (429, '', true),
        (500, '', false),
        (200, '{}', false)
      ]) {
        final a = ProxyPolishAdapter(
            MockClient((_) async => http.Response(body, code)),
            functionUrl: 'https://x.test/fn',
            anonKey: 'a');
        try {
          await a.complete('s', 't');
          fail('should throw');
        } on PolishException catch (e) {
          expect(e.rateLimited, rl);
        }
      }
      final slow = ProxyPolishAdapter(MockClient((_) async {
        await Future.delayed(const Duration(milliseconds: 200));
        return http.Response('{}', 200);
      }), functionUrl: 'https://x.test/fn', anonKey: 'a');
      expect(
          () => slow.complete('s', 't',
              timeout: const Duration(milliseconds: 20)),
          throwsA(isA<PolishException>()));
    });
    test('proxy sends only anon key, no provider key', () async {
      late http.Request seen;
      final a = ProxyPolishAdapter(MockClient((r) async {
        seen = r;
        return http.Response('{"text":"ok"}', 200);
      }), functionUrl: 'https://x.test/fn', anonKey: 'anon');
      expect(await a.complete('s', 't'), 'ok');
      expect(seen.headers['x-goog-api-key'], isNull);
      expect(seen.headers['apikey'], 'anon');
    });
    test('openai-compatible loopback does not leave device', () {
      final c = MockClient((_) async => http.Response('', 200));
      expect(
          OpenAiCompatAdapter(c,
                  baseUrl: 'http://localhost:11434/v1', model: 'm')
              .leavesDevice,
          isFalse);
      expect(
          OpenAiCompatAdapter(c,
                  baseUrl: 'https://api.groq.com/openai/v1', model: 'm')
              .leavesDevice,
          isTrue);
    });
    test('chain: 429 skips engine for 60s, falls through, counts', () async {
      var now = DateTime(2026, 1, 1);
      final a = FakePolish((t) => t,
          error: const PolishException('rl', rateLimited: true), name: 'a');
      final b = FakePolish((t) => 'B:$t', name: 'b');
      final chain = PolishChain([a, b], now: () => now);
      expect(await chain.complete('s', 'x'), 'B:x');
      expect(await chain.complete('s', 'x'), 'B:x');
      expect(a.calls, 1); // skipped second time
      now = now.add(const Duration(seconds: 61));
      await chain.complete('s', 'x');
      expect(a.calls, 2);
      expect(chain.todayCounts['b'], 3);
    });
    test('chain returns null when all fail', () async {
      final chain = PolishChain(
          [FakePolish((t) => t, error: const PolishException('x'))]);
      expect(await chain.complete('s', 'x'), isNull);
    });
  });
}
