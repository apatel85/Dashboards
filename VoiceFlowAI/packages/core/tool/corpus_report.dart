// Prints a markdown sample of the generated correction corpus and what each tone makes of it.
// Run:  dart run tool/corpus_report.dart > /tmp/sample.md   (from packages/core)
import 'dart:io';
import 'package:voiceflow_core/voiceflow_core.dart';
import '../test/support/correction_corpus.dart';

void main() {
  final lang = LangData.fromJsonString(
      File('../../app/assets/lang/en.json').readAsStringSync());
  Profile prof(String id) => Profile.fromJsonString(
      File('../../app/assets/profiles/$id.json').readAsStringSync());
  final f = RuleFormatter(lang);
  final corpus = buildCorpus();
  final lens = corpus.map((c) => c.words).toList()..sort();
  stdout.writeln('Cases: ${corpus.length}, words ${lens.first}-${lens.last} '
      '(median ${lens[lens.length ~/ 2]}).');
  for (final i in [0, 17, 29]) {
    final c = corpus[i];
    stdout.writeln('\n### Case #$i - ${c.slot}, ${c.form}, ${c.words} words\n');
    stdout.writeln('**Typed:** ${c.text}\n');
    for (final t in ['business', 'professional', 'ai_prompting']) {
      stdout.writeln(
          '**$t:**\n\n```\n${f.format(c.text, prof(t), promptStyle: const PromptStyle(conciseFirst: true))}\n```\n');
    }
  }
}
