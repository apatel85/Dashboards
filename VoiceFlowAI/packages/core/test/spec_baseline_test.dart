import 'dart:convert';
import 'dart:io';
import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

/// Baseline for the "Dictation App Conversion Spec (Final)": the spec's own worked examples run
/// through the current rule formatter. Each case lists the spec's expected text. `status` is
/// "pass" (must match exactly) or "pending" (known gap, scheduled in spec section 15 order).
/// A pending case that starts passing fails this test until it is promoted to "pass", so the
/// list can only move forward. Fact checks run on every case regardless of status.
void main() {
  final statusFile = File('test_fixtures/spec/status.json');
  final writing = Platform.environment['SPEC_BASELINE_WRITE'] == '1';
  final cases = jsonDecode(
      (writing ? File('test_fixtures/spec/cases.json') : statusFile)
          .readAsStringSync()) as List;
  final lang = loadLang();
  final f = RuleFormatter(lang);

  String run(Map c) {
    final p = loadProfile(c['profile'] as String);
    final packs = [if (c['pack'] != null) loadPack(c['pack'] as String)];
    final post = PostProcessor(lang);
    final raw = post.beforeNumbers(
        post.fixHeard(c['raw'] as String, packs: packs), packs);
    return post.finish(
        f.format(raw, p,
            shorthandHundreds: packs.any((x) => x.shorthandHundreds)),
        packs: packs);
  }

  if (writing) {
    test('write baseline', () {
      final out = [
        for (final c in cases.cast<Map>())
          {
            ...c,
            'status': run(c) == c['expected'] ? 'pass' : 'pending',
            'baseline': run(c)
          }
      ];
      statusFile.writeAsStringSync(
          '${const JsonEncoder.withIndent('  ').convert(out)}\n');
    });
    return;
  }

  for (final c in cases.cast<Map>()) {
    test('${c['id']} (${c['status']})', () {
      final out = run(c);
      final ok = out == c['expected'];
      if (c['status'] == 'pass') {
        expect(out, c['expected']);
      } else {
        expect(ok, isFalse,
            reason:
                '${c['id']} now matches the spec: set its status to "pass"');
        // ignore: avoid_print
        print('PENDING ${c['id']}\n  got:  $out\n  want: ${c['expected']}');
      }
    });
  }
}
