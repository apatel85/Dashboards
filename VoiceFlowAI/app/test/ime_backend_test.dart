import 'dart:io';

import 'package:flutter/services.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/ime/ime_backend.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/state/settings_store.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'dictation_service_test.dart' show FakeStt, tone;

const spec = ModelSpec(
  id: 'm',
  lang: 'en',
  url: 'http://x',
  sha256: 'abc',
  sizeMb: 1,
  license: 'MIT',
  files: ['a.bin'],
);

void main() {
  late Directory tmp;
  late FakeStt stt;
  late ImeBackend b;
  late SettingsStore store;
  int loads = 0, unloads = 0;

  Future<void> install() async {
    final m = ModelManager(spec, Directory('${tmp.path}/models'));
    m.dir.createSync(recursive: true);
    File(m.path('a.bin')).writeAsStringSync('x');
    File('${m.dir.path}/.verified').writeAsStringSync('abc');
  }

  setUp(() async {
    TestWidgetsFlutterBinding.ensureInitialized();
    tmp = await Directory.systemTemp.createTemp('imeb');
    stt = FakeStt('hello world');
    loads = unloads = 0;
    store = SettingsStore(Directory('${tmp.path}/s'));
    b = ImeBackend(
      assets: (await AppAssets.load()),
      store: store,
      models: ModelManager(spec, Directory('${tmp.path}/models')),
      stt: stt,
      ensureLoaded: () async => loads++,
      unloadEngine: () async => unloads++,
    );
  });
  tearDown(() => tmp.deleteSync(recursive: true));

  test('ping and unknown method', () async {
    expect(await b.handle(const MethodCall('ping')), 'pong');
    expect(
      () => b.handle(const MethodCall('nope')),
      throwsA(isA<MissingPluginException>()),
    );
  });

  test('status reports model, profile list, cloud', () async {
    var s = await b.status();
    expect(s['modelReady'], false);
    expect((s['profiles'] as List).length, 4);
    await install();
    s = await b.status();
    expect(s['modelReady'], true);
    expect(s['cloud'], false);
  });

  test('dictate: model missing, password, ok, field kinds', () async {
    expect((await b.dictate({'pcm': tone()}))['status'], 'modelMissing');
    expect(
      (await b.dictate({'pcm': tone(), 'fieldKind': 'password'}))['status'],
      'passwordField',
    );
    expect(stt.calls, 0);
    await install();
    final r = await b.dictate({'pcm': tone(), 'profileId': 'casual'});
    expect(r['status'], 'ok');
    expect(r['text'], isNotEmpty);
    expect(loads, 1);
    stt.text = 'john at example dot com';
    final e = await b.dictate({'pcm': tone(), 'fieldKind': 'email'});
    expect(e['text'], 'john@example.com');
  });

  test(
    'streaming dictation: chunks in, one result out; password and cancel',
    () async {
      await install();
      final pcm = tone();
      // Same audio, delivered through the channel the floating button uses.
      await b.handle(const MethodCall('streamStart', {'fieldKind': 'text'}));
      const step = 3200;
      for (var i = 0; i < pcm.length; i += step) {
        final end = i + step > pcm.length ? pcm.length : i + step;
        await b.handle(MethodCall('streamChunk', {'pcm': pcm.sublist(i, end)}));
      }
      final r = await b.handle(const MethodCall('streamEnd')) as Map;
      expect(r['status'], 'ok');
      expect(r['text'], isNotEmpty);

      await b.handle(
        const MethodCall('streamStart', {'fieldKind': 'password'}),
      );
      await b.handle(MethodCall('streamChunk', {'pcm': pcm}));
      final p = await b.handle(const MethodCall('streamEnd')) as Map;
      expect(p['status'], 'passwordField');

      final calls = stt.calls;
      await b.handle(const MethodCall('streamStart', {'fieldKind': 'text'}));
      await b.handle(MethodCall('streamChunk', {'pcm': pcm}));
      await b.handle(const MethodCall('streamCancel'));
      expect(
        ((await b.handle(const MethodCall('streamEnd'))) as Map)['status'],
        'error',
        reason: 'a cancelled stream has nothing to finish',
      );
      expect(stt.calls, calls, reason: 'nothing was transcribed after cancel');
    },
  );

  test('well-known apps get their own style and prompt layout', () async {
    await install();
    stt.text = 'hello team please see the budget attached';
    // Gmail: Professional by default (nothing was chosen for it)
    final g = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.google.android.gm',
    });
    expect((g['profile'] as Map)['id'], 'professional');
    final w = await b.dictate({'pcm': tone(), 'packageName': 'com.whatsapp'});
    expect((w['profile'] as Map)['id'], 'casual');
    // the user's own choice wins over the built-in one
    await b.setProfile('business', 'com.google.android.gm');
    final g2 = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.google.android.gm',
    });
    expect((g2['profile'] as Map)['id'], 'business');
    // Claude: AI Prompting, laid out with XML tags when the prompt has several parts
    stt.text = 'Act as a travel planner. I am visiting Lisbon for four days in March with two kids. Explain what to see and where to eat. Do not include museums. Include one rainy day option.';
    final c = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.anthropic.claude',
    });
    expect((c['profile'] as Map)['id'], 'ai_prompting');
    expect(c['text'], contains('<role>travel planner</role>'));
    expect(c['text'], contains('<avoid>museums</avoid>'));
    // ChatGPT: ### sections
    final o = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.openai.chatgpt',
    });
    expect(o['text'], contains('### Task'));
    // the person can force one layout everywhere, and turn the length hint off
    final s = await store.load();
    s.promptFormat = 'labels';
    s.aiLength = 'as_said';
    await store.save(s);
    final l = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.anthropic.claude',
    });
    expect(l['text'], contains('Role: travel planner'));
    expect(l['text'], isNot(contains('Start concise')));
  });

  test('a dictation fits the sentence around the cursor', () async {
    await install();
    stt.text = 'we should go now';
    Future<String?> say(Map<String, Object?> ctx) async {
      await b.handle(MethodCall('streamStart', {'fieldKind': 'text', ...ctx}));
      await b.handle(MethodCall('streamChunk', {'pcm': tone()}));
      return ((await b.handle(const MethodCall('streamEnd'))) as Map)['text']
          as String?;
    }

    expect(await say({'before': 'I think '}), 'we should go now.');
    expect(await say({'before': 'Hello. '}), 'We should go now.');
    expect(await say({}), 'We should go now.');
    expect(
      await say({'before': 'We could ', 'after': ' and then eat'}),
      'we should go now',
    );
  });

  test('setProfile remembers per app and is used next time', () async {
    await install();
    await b.setProfile('ai_prompting', 'com.example.chat');
    stt.text = 'write a poem';
    final r = await b.dictate({
      'pcm': tone(),
      'packageName': 'com.example.chat',
    });
    expect((r['profile'] as Map)['id'], 'ai_prompting');
    final other = await b.dictate({'pcm': tone(), 'packageName': 'com.other'});
    expect((other['profile'] as Map)['id'], 'business');
    await b.setProfile('casual', null);
    expect(((await b.status())['profile'] as Map)['id'], 'casual');
  });

  test('unload calls through', () async {
    await b.handle(const MethodCall('unload'));
    expect(unloads, 1);
  });
}
