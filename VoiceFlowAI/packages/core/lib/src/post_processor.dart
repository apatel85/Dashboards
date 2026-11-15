import 'lang.dart';
import 'number_words.dart';
import 'pack.dart';

/// Dictionary corrections, pack abbreviations (spec §5.2 step 8).
class PostProcessor {
  final LangData lang;
  late final Set<String> _common =
      lang.list('commonWords').map((e) => e.toLowerCase()).toSet();
  PostProcessor(this.lang);

  /// Pack rules marked `"stage": "words"` (spec section 1A, change 4): they run on the spoken
  /// words, before numbers become digits, so a pattern can see "four for twenty two".
  String beforeNumbers(String text, List<DomainPack> packs) {
    final withRules = [
      for (final p in packs)
        if (p.rules.any((r) => r.beforeNumbers)) p
    ];
    if (withRules.isEmpty) return text;
    final nw = NumberWords(lang);
    final w = [
      ...nw.units.keys,
      ...nw.tens.keys,
      ...nw.scales.keys,
    ].join('|');
    final one = '(?:$w|\\d+(?:\\.\\d+)?)';
    final num = '$one(?:[ -]+(?:and[ -]+)?$one){0,5}';
    final isNumber =
        RegExp('^(?:$one)(?:[ -]+(?:and[ -]+)?$one)*\$', caseSensitive: false);
    var s = text;
    for (final p in withRules) {
      for (final r in p.rules.where((r) => r.beforeNumbers)) {
        final re =
            RegExp(r.source.replaceAll('{num}', num), caseSensitive: false);
        s = s.replaceAllMapped(re, (m) {
          return r.replace.replaceAllMapped(RegExp(r'\$(\d)'), (g) {
            final i = int.parse(g.group(1)!);
            if (i > m.groupCount) return '';
            final v = m.group(i) ?? '';
            if (!isNumber.hasMatch(v) || RegExp(r'^\d').hasMatch(v)) return v;
            final toks = v
                .split(RegExp(r'[ -]+'))
                .where((x) => x.toLowerCase() != 'and')
                .toList();
            return nw
                .convert(toks,
                    shorthandHundreds: p.shorthandHundreds,
                    keepSmallWords: false)
                .join(' ');
          });
        });
      }
    }
    return s;
  }

  /// Heard-as -> correct fixes: the user's own corrections and the dictionary. These run at the
  /// START of the pipeline (spec section 1A, change 3) so the formatter, the polish model and
  /// the validator all see the right names.
  String fixHeard(String text,
      {List<String> dictionary = const [],
      Map<String, String> corrections = const {},
      List<DomainPack> packs = const []}) {
    var s = text;
    for (final e in corrections.entries) {
      s = s.replaceAllMapped(
          RegExp('\\b${RegExp.escape(e.key)}\\b', caseSensitive: false),
          (_) => e.value);
    }
    return _dictionary(s, dictionary, packs);
  }

  /// Pack abbreviations and output rules: these stay at the END of the pipeline.
  String finish(String text, {List<DomainPack> packs = const []}) =>
      _abbreviationsAndRules(text, packs);

  String _abbreviationsAndRules(String text, List<DomainPack> packs) {
    var s = text;
    for (final p in packs) {
      for (final e in p.abbreviations.entries) {
        s = s.replaceAllMapped(
            RegExp('\\b${RegExp.escape(e.key)}\\b', caseSensitive: false),
            (_) => e.value);
      }
    }
    for (final p in packs) {
      for (final r in p.rules) {
        if (!r.beforeNumbers) s = r.apply(s);
      }
    }
    return s;
  }

  /// Everything in one go, in the original order (kept for callers and tests that want it).
  String process(String text,
      {List<String> dictionary = const [],
      Map<String, String> corrections = const {},
      List<DomainPack> packs = const []}) {
    var s = _abbreviationsAndRules(text, packs);
    for (final e in corrections.entries) {
      s = s.replaceAllMapped(
          RegExp('\\b${RegExp.escape(e.key)}\\b', caseSensitive: false),
          (_) => e.value);
    }
    return _dictionary(s, dictionary, packs);
  }

  String _dictionary(
      String s, List<String> dictionary, List<DomainPack> packs) {
    final terms = {
      ...dictionary,
      for (final p in packs) ...p.vocabulary,
    }.where((t) => t.isNotEmpty).toList();
    if (terms.isEmpty) return s;
    return s.replaceAllMapped(RegExp(r"[A-Za-z][A-Za-z0-9']*"), (m) {
      final w = m.group(0)!;
      final lw = w.toLowerCase();
      if (_common.contains(lw) || lang.contractions.containsKey(lw)) return w;
      String? best;
      var bestD = 3;
      for (final t in terms) {
        if (t.contains(' ')) continue;
        if (t == w) return w;
        // Already spelled right, only capitalised at the start of a sentence: keep it.
        if (t.length > 1 &&
            t[0] == t[0].toLowerCase() &&
            w[0] != w[0].toLowerCase() &&
            w.substring(1) == t.substring(1)) {
          return w;
        }
        final lt = t.toLowerCase();
        // "quarter" vs "quarterly": one is the other plus an ending. Both are real words, so
        // this is a different word, not a mishearing. Leave it alone.
        if ((lt.startsWith(lw) || lw.startsWith(lt)) &&
            (lt.length - lw.length).abs() >= 2) {
          continue;
        }
        final d = _edit(lw, lt);
        final limit = w.length >= 7 ? 2 : (w.length >= 5 ? 1 : 0);
        if (d <= limit && d < bestD) {
          best = t;
          bestD = d;
        }
      }
      return best ?? w;
    });
  }

  static int _edit(String a, String b) {
    if (a == b) return 0;
    var prev = List<int>.generate(b.length + 1, (i) => i);
    for (var i = 1; i <= a.length; i++) {
      final cur = <int>[i];
      for (var j = 1; j <= b.length; j++) {
        final c = a[i - 1] == b[j - 1] ? 0 : 1;
        cur.add([prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + c]
            .reduce((x, y) => x < y ? x : y));
      }
      prev = cur;
    }
    return prev.last;
  }
}
