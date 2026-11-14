import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

String _run(String s, DomainPack p, {List<DomainPack>? packs}) {
  final lang = loadLang();
  final all = packs ?? [p];
  final t = RuleFormatter(lang).format(s, loadProfile('business'),
      shorthandHundreds: all.any((x) => x.shorthandHundreds));
  return PostProcessor(lang).process(t, packs: all);
}

Map<String, dynamic> _minimal([Map<String, dynamic>? extra]) =>
    {'id': 'x', 'name': 'X', ...?extra};

List<String> _errs(Object? j) => PackValidator.validate(j);

void main() {
  // ---- pack goldens (>= 10 per pack)
  for (final id in ['healthcare_clinic', 'general_business']) {
    final pack = loadPack(id);
    final cases = jsonDecode(
        File('test_fixtures/packs/$id/cases.json').readAsStringSync()) as List;
    test(
        '$id has >= 10 golden cases', () => expect(cases.length >= 10, isTrue));
    for (final c in cases) {
      test('$id: ${c['in']}', () => expect(_run(c['in'], pack), c['out']));
    }
  }

  test('the spec example: "bp one forty over ninety" -> BP 140/90', () {
    expect(_run('bp one forty over ninety', loadPack('healthcare_clinic')),
        'BP 140/90.');
  });

  test('shorthand hundreds only applies while a pack asks for it', () {
    final f = RuleFormatter(loadLang());
    final p = loadProfile('business');
    expect(f.format('one forty', p), isNot(contains('140')));
    expect(f.format('one forty', p, shorthandHundreds: true), '140.');
    expect(f.format('seventy two', p, shorthandHundreds: true), '72.');
    expect(f.format('one hundred forty', p, shorthandHundreds: true), '140.');
  });

  test('spoken decimals become digits; a bare "point" stays a word', () {
    final f = RuleFormatter(loadLang());
    final p = loadProfile('business');
    expect(f.format('two point five', p), '2.5.');
    expect(f.format('three point one four', p), '3.14.');
    expect(f.format('that is a good point', p), 'That is a good point.');
    expect(f.format('point five', p), isNot(contains('0.5')));
  });

  // ---- validation: malformed packs never crash and say what is wrong
  group('validator', () {
    test('both bundled packs are valid', () {
      for (final id in ['healthcare_clinic', 'general_business']) {
        final j = jsonDecode(
            File('../../app/assets/packs/$id/pack.json').readAsStringSync());
        expect(_errs(j), isEmpty, reason: id);
      }
    });
    test('a minimal pack is valid', () => expect(_errs(_minimal()), isEmpty));
    test('unknown keys are allowed (forward compatible)',
        () => expect(_errs(_minimal({'futureThing': 1})), isEmpty));

    final bad = <String, Object?>{
      'not an object': [1, 2],
      'missing id': {'name': 'X'},
      'bad id characters': {'id': 'Has Space', 'name': 'X'},
      'missing name': {'id': 'x'},
      'vocabulary not a list': _minimal({'vocabulary': 'metformin'}),
      'vocabulary with numbers': _minimal({
        'vocabulary': [1]
      }),
      'abbreviations wrong shape': _minimal({
        'abbreviations': {'a': 1}
      }),
      'abbreviation empty key': _minimal({
        'abbreviations': {' ': 'x'}
      }),
      'template without trigger': _minimal({
        'templates': [
          {'id': 'a', 'name': 'A', 'skeleton': 's'}
        ]
      }),
      'template not object': _minimal({
        'templates': ['x']
      }),
      'detectors wrong type': _minimal({'detectors': 'x'}),
      'detectors unknown field kind': _minimal({
        'detectors': {
          'fieldKinds': ['telepathy']
        }
      }),
      'safety not booleans': _minimal({
        'safety': {'cloudAllowed': 'no'}
      }),
      'rule missing replace': _minimal({
        'rules': [
          {'pattern': 'a'}
        ]
      }),
      'rule invalid regex': _minimal({
        'rules': [
          {'pattern': '(', 'replace': 'x'}
        ]
      }),
      'rule catastrophic regex': _minimal({
        'rules': [
          {'pattern': '(a+)+b', 'replace': 'x'}
        ]
      }),
      'rule too long': _minimal({
        'rules': [
          {'pattern': 'a' * 201, 'replace': 'x'}
        ]
      }),
      'too many rules': _minimal({
        'rules': [
          for (var i = 0; i < 51; i++) {'pattern': 'a$i', 'replace': 'x'}
        ]
      }),
    };
    for (final e in bad.entries) {
      test('refuses: ${e.key}', () {
        final errs = _errs(e.value);
        expect(errs, isNotEmpty);
        // readable: short sentences, no stack traces or type names
        for (final m in errs) {
          expect(m.length < 160, isTrue, reason: m);
          expect(m, isNot(contains('Exception')));
          expect(m, isNot(contains('type \'')));
        }
      });
    }

    test('load() never throws on garbage, and explains', () {
      for (final s in [
        '',
        'not json',
        '{',
        'null',
        '[]',
        '{"id":5}',
        '"x"',
        '\u0000',
        '{"id":"x","name":"X","rules":7}'
      ]) {
        late PackLoadResult r;
        expect(() => r = DomainPack.load(s), returnsNormally, reason: s);
        expect(r.ok, isFalse, reason: s);
        expect(r.errors, isNotEmpty, reason: s);
      }
    });

    test(
        'a refused pack cannot reach the pipeline (fromJson throws, load does not)',
        () {
      expect(() => DomainPack.fromJson({'name': 'X'}), throwsFormatException);
      expect(DomainPack.load('{"name":"X"}').pack, isNull);
    });
  });

  // ---- detector scoring
  group('detector', () {
    final health = loadPack('healthcare_clinic');
    final biz = loadPack('general_business');
    const det = PackDetector();
    List<String> ids(DetectContext c, {Set<String> exclude = const {}}) => det
        .suggest([health, biz], c, exclude: exclude)
        .map((s) => s.pack.id)
        .toList();

    test('an app match alone suggests the pack', () {
      expect(
          ids(const DetectContext(appId: 'epic.exe')), ['healthcare_clinic']);
      expect(
          ids(const DetectContext(appId: 'OUTLOOK.EXE')), ['general_business']);
    });
    test('one weak signal is not enough', () {
      expect(ids(const DetectContext(windowTitle: 'Patient list')), isEmpty);
      expect(ids(const DetectContext(text: 'she takes 20 mg daily')), isEmpty);
    });
    test('two signals together are enough', () {
      expect(ids(const DetectContext(windowTitle: 'Patient chart', text: 'x')),
          ['healthcare_clinic']);
      expect(
          ids(const DetectContext(
              windowTitle: 'Patient list', text: 'blood pressure and dose')),
          ['healthcare_clinic']);
    });
    test('whole words only: "mg" does not match "amgen"', () {
      expect(
          ids(const DetectContext(
              windowTitle: 'Patient list', text: 'amgen amgen')),
          isEmpty);
    });
    test('higher score sorts first', () {
      final r = det.suggest(
          [biz, health],
          const DetectContext(
              appId: 'epic', windowTitle: 'patient chart', text: 'mg'));
      expect(r.first.pack.id, 'healthcare_clinic');
      expect(r.first.score >= 3, isTrue);
      expect(r.first.reasons, contains('app'));
    });
    test('already-active and dismissed packs are not suggested', () {
      expect(
          ids(const DetectContext(appId: 'epic'),
              exclude: {'healthcare_clinic'}),
          isEmpty);
    });
    test(
        'empty context suggests nothing; the detector never activates anything',
        () {
      expect(ids(const DetectContext()), isEmpty);
      final reg = PackRegistry()
        ..add(jsonEncode(jsonDecode(
            File('../../app/assets/packs/healthcare_clinic/pack.json')
                .readAsStringSync())));
      det.suggest(reg.all, const DetectContext(appId: 'epic'));
      expect(reg.active, isEmpty);
    });
    test('field kind adds a point', () {
      final p = DomainPack(
          id: 'f',
          name: 'F',
          detectors: const PackDetectors(
              apps: ['fooapp'], fieldKinds: [FieldKind.email]));
      expect(det.suggest([p], const DetectContext(fieldKind: FieldKind.email)),
          isEmpty);
      expect(
          det.suggest([p], const DetectContext(appId: 'fooapp')).single.score,
          3);
      expect(
          det
              .suggest(
                  [p],
                  const DetectContext(
                      appId: 'fooapp', fieldKind: FieldKind.email))
              .single
              .score,
          4);
    });
  });

  // ---- registry: bundled, user-dropped and runtime packs; priority
  group('registry', () {
    String src(String id) =>
        File('../../app/assets/packs/$id/pack.json').readAsStringSync();

    test('a third pack is added at runtime with no code change and works',
        () async {
      final reg = PackRegistry()
        ..add(src('general_business'))
        ..add(src('healthcare_clinic'));
      expect(reg.all.length, 2);
      final r = reg.add(jsonEncode({
        'id': 'legal_firm',
        'name': 'Legal (Firm)',
        'vocabulary': ['subpoena', 'affidavit'],
        'abbreviations': {'nda': 'NDA'},
        'templates': [
          {
            'id': 'memo',
            'name': 'Memo',
            'trigger': ['legal memo'],
            'skeleton': 'To:\nRe:\n'
          }
        ],
        'detectors': {
          'apps': ['clio'],
          'windowTitleKeywords': ['matter']
        },
      }));
      expect(r.ok, isTrue);
      expect(reg.all.length, 3);
      reg.setActive(['legal_firm']);
      final sink = FakeSink();
      final p = DictationPipeline(loadLang(), FakeStt('sign the nda'), sink);
      await p.run(speechPcm(),
          DictationOptions(loadProfile('business'), packs: reg.active));
      expect(sink.inserted.single, 'Sign the NDA.');
      final sink2 = FakeSink();
      await DictationPipeline(loadLang(), FakeStt('legal memo'), sink2).run(
          speechPcm(),
          DictationOptions(loadProfile('business'), packs: reg.active));
      expect(sink2.inserted.single, 'To:\nRe:\n');
      expect(
          const PackDetector()
              .suggest(reg.all, const DetectContext(appId: 'clio'))
              .single
              .pack
              .id,
          'legal_firm');
    });

    test('a bad pack is recorded with reasons and the rest keep working', () {
      final reg = PackRegistry()..add(src('general_business'));
      final r = reg.add('{"id":"BAD ID","name":"x"}', source: 'my_pack.json');
      expect(r.ok, isFalse);
      expect(reg.errors.single.source, 'my_pack.json');
      expect(reg.errors.single.messages, isNotEmpty);
      expect(reg.all.map((p) => p.id), ['general_business']);
    });

    test('same id replaces the older pack (user copy overrides bundled)', () {
      final reg = PackRegistry()..add(src('general_business'));
      reg.add(jsonEncode(
          {'id': 'general_business', 'name': 'Mine', 'version': '9.0.0'}));
      expect(reg.all.single.name, 'Mine');
    });

    test('priority: earlier pack wins a conflicting abbreviation', () {
      final a = DomainPack(
          id: 'a', name: 'A', abbreviations: const {'hr': 'human resources'});
      final b = DomainPack(
          id: 'b', name: 'B', abbreviations: const {'hr': 'heart rate'});
      final lang = loadLang();
      String out(List<DomainPack> ps) =>
          PostProcessor(lang).process('call hr now', packs: ps);
      expect(out([a, b]), 'call human resources now');
      expect(out([b, a]), 'call heart rate now');
    });

    test(
        'activate / deactivate / move keep a stable order; unknown ids ignored',
        () {
      final reg = PackRegistry()
        ..add(src('general_business'))
        ..add(src('healthcare_clinic'));
      reg.setActive([
        'healthcare_clinic',
        'ghost',
        'general_business',
        'healthcare_clinic'
      ]);
      expect(reg.activeIds, ['healthcare_clinic', 'general_business']);
      reg.move('general_business', -1);
      expect(reg.activeIds, ['general_business', 'healthcare_clinic']);
      reg.move('general_business', -5);
      expect(reg.activeIds.first, 'general_business');
      reg.deactivate('general_business');
      expect(reg.activeIds, ['healthcare_clinic']);
      reg.activate('general_business');
      reg.activate('general_business');
      expect(reg.activeIds, ['healthcare_clinic', 'general_business']);
      reg.remove('healthcare_clinic');
      expect(reg.activeIds, ['general_business']);
    });
  });

  // ---- safety: cloudAllowed:false and exact numbers (real healthcare pack)
  group('safety', () {
    final health = loadPack('healthcare_clinic');
    test('the healthcare pack sets cloudAllowed:false and exact numbers', () {
      expect(health.cloudAllowed, isFalse);
      expect(health.preferRuleFormatterForNumbers, isTrue);
    });

    test('with the healthcare pack active, no cloud engine is ever called',
        () async {
      final cloud = FakePolish((t) => 'Cloud rewrite of the note here.');
      final r = await DictationPipeline(
              loadLang(),
              FakeStt('the patient came in for a follow up visit today'),
              FakeSink(),
              polish: PolishChain([cloud]))
          .run(speechPcm(),
              DictationOptions(loadProfile('professional'), packs: [health]));
      expect(cloud.calls, 0);
      expect(r.polishUsed, isFalse);
    });

    test('a loopback engine is still allowed', () async {
      final local = FakePolish(
          (t) => 'The patient came in for a follow up visit today.',
          cloud: false,
          name: 'local');
      final r = await DictationPipeline(
              loadLang(),
              FakeStt('the patient came in for a follow up visit today'),
              FakeSink(),
              polish: PolishChain([local]))
          .run(speechPcm(),
              DictationOptions(loadProfile('professional'), packs: [health]));
      expect(local.calls, 1);
      expect(r.polishUsed, isTrue);
    });

    test('text with numbers skips polish entirely while the pack is active',
        () async {
      final local =
          FakePolish((t) => 'BP is 150/90 now.', cloud: false, name: 'local');
      final sink = FakeSink();
      await DictationPipeline(
              loadLang(), FakeStt('bp one forty over ninety'), sink,
              polish: PolishChain([local]))
          .run(speechPcm(),
              DictationOptions(loadProfile('professional'), packs: [health]));
      expect(local.calls, 0);
      expect(sink.inserted.single, 'BP 140/90.');
    });

    test('the same dictation without the pack is not rewritten as 140/90',
        () async {
      final sink = FakeSink();
      await DictationPipeline(
              loadLang(), FakeStt('bp one forty over ninety'), sink)
          .run(speechPcm(), DictationOptions(loadProfile('business')));
      expect(sink.inserted.single, isNot(contains('140')));
    });
  });
}
