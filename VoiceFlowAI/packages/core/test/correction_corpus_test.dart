import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';
import 'support/correction_corpus.dart';

/// 48 generated dictations (50-300 words, fillers, rambling) that state a fact, retract it in
/// one of eight ways and give the right value. Every tone must keep the right value, drop the
/// wrong one and the retraction words, and still read as clean text.
void main() {
  final corpus = buildCorpus();
  final f = RuleFormatter(loadLang());
  final markers = RegExp(
      r"\b(?:sorry|negate|scratch that|strike that|never mind|that'?s wrong|my bad)\b|\bno,? sorry\b",
      caseSensitive: false);

  List<String> check(CorpusCase c, String tone, String o) {
    final bad = <String>[];
    final inWords = c.words;
    final outWords = o.split(RegExp(r'\s+')).length;
    for (final v in c.mustHave) {
      if (!o.toLowerCase().contains(v.toLowerCase())) bad.add('missing "$v"');
    }
    for (final v in c.mustNot) {
      if (o.toLowerCase().contains(v.toLowerCase())) {
        bad.add('kept retracted "$v"');
      }
    }
    if (markers.hasMatch(o)) {
      bad.add('retraction words left: "${markers.firstMatch(o)![0]}"');
    }
    if (RegExp(r'\b(?:um|uh)\b', caseSensitive: false).hasMatch(o)) {
      bad.add('um/uh left');
    }
    if (o.contains('  ')) bad.add('double space');
    if (RegExp(r' [,.?!;:]').hasMatch(o)) bad.add('space before punctuation');
    if (o.contains(' - ')) bad.add('stray " - "');
    if (!RegExp(r'^[A-Z<#]').hasMatch(o)) {
      bad.add('does not start with a capital');
    }
    if (!RegExp(r'[.?!>]$').hasMatch(o)) {
      bad.add('does not end with punctuation');
    }
    if (tone == 'business' || tone == 'professional') {
      if (RegExp(r'(^|[.?!]\s+|\n)So\s').hasMatch(o)) {
        bad.add('sentence starts with "So"');
      }
    }
    // words the speech model heard wrong, fixed from context
    final low = c.text.toLowerCase();
    if (low.contains('tax messages') && !o.contains('text messages')) {
      bad.add('"tax messages" not fixed to "text messages"');
    }
    if (low.contains('buck fixing') && !o.contains('bug fixing')) {
      bad.add('"buck fixing" not fixed to "bug fixing"');
    }
    if (low.contains('get hub') && !o.contains('GitHub')) {
      bad.add('"get hub" not fixed');
    }
    if (low.contains('java script') && !o.contains('JavaScript')) {
      bad.add('"java script" not fixed');
    }
    if (low.contains('chat gpt') && !o.contains('ChatGPT')) {
      bad.add('"chat gpt" not fixed');
    }
    // article agreement
    final wrongA = RegExp(r'\ba (?=(?:[aeiou]\w*))', caseSensitive: false);
    for (final m in wrongA.allMatches(o)) {
      final w =
          RegExp(r'^\w+').firstMatch(o.substring(m.end))![0]!.toLowerCase();
      final okA = ['uni', 'use', 'usu', 'uti', 'eu', 'one', 'once', 'ubi']
          .any(w.startsWith);
      if (!okA) bad.add('wrong article "a $w"');
    }
    if (RegExp(r'\ban (?=[b-df-hj-np-tv-z])', caseSensitive: false)
        .allMatches(o)
        .any((m) {
      final w =
          RegExp(r'^\w+').firstMatch(o.substring(m.end))![0]!.toLowerCase();
      return !['hour', 'honest', 'honor', 'heir'].any(w.startsWith) &&
          w != w.toUpperCase();
    })) {
      bad.add('wrong article "an <consonant>"');
    }
    if (RegExp(r'just so you know', caseSensitive: false).hasMatch(c.text)) {
      // kept whole, or (AI prompts) dropped whole - never left as a dangling "Just so,"
      if (RegExp(r'just so\b(?! you know)', caseSensitive: false).hasMatch(o)) {
        bad.add('dangling "just so"');
      }
      if (tone != 'ai_prompting' &&
          !o.toLowerCase().contains('just so you know')) {
        bad.add('"just so you know" lost its "you know"');
      }
    }
    if (RegExp(r'a few hundred').hasMatch(c.text) && o.contains('few 100')) {
      bad.add('"a few hundred" became "a few 100"');
    }
    if (outWords < inWords * 0.25) {
      bad.add('too short ($outWords of $inWords words)');
    }
    if (outWords > inWords * 1.2 + 12) {
      bad.add('too long ($outWords of $inWords words)');
    }
    return bad;
  }

  for (final tone in ['casual', 'business', 'professional', 'ai_prompting']) {
    test('corpus of ${corpus.length} dictations stays sound in $tone', () {
      final failures = <String>[];
      for (final c in corpus) {
        final o = f.format(c.text, loadProfile(tone),
            promptStyle: const PromptStyle(conciseFirst: true));
        final bad = check(c, tone, o);
        if (bad.isNotEmpty) {
          failures.add(
              '#${c.id} [${c.slot} / ${c.form}, ${c.words}w]: ${bad.join('; ')}');
        }
      }
      expect(failures, isEmpty,
          reason:
              '${failures.length}/${corpus.length} failed:\n${failures.join('\n')}');
    });
  }

  test('the corpus covers 6 lengths, 9 kinds of fact and 8 retraction styles',
      () {
    expect(corpus.length, 48);
    expect(corpus.map((c) => c.slot).toSet().length, 9);
    expect(corpus.map((c) => c.form).toSet().length, 8);
    expect(
        corpus.map((c) => (c.words / 50).round()).toSet().length >= 4, isTrue);
    expect(corpus.every((c) => c.words >= 42 && c.words <= 330), isTrue,
        reason: corpus.map((c) => c.words).toString());
  });
}
