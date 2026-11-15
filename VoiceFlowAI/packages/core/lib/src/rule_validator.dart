import 'lang.dart';
import 'number_words.dart';

/// Checks on rule-formatted text, against the cleaned input (spec section 14, checks 1, 2, 3, 5
/// and 7; spec section 1A, change 5). A failure means the rule path did something it must not -
/// lose or invent a number, drop a negation, leave filler or shouting behind, break a tag - and
/// the formatter falls back to minimal formatting in the selected profile.
///
/// This catches mistakes made by the tone and structure stages. It cannot catch a number that is
/// read wrongly the same way on both sides, because the input numbers come from the same reader.
class RuleValidator {
  final LangData lang;
  final NumberWords _nums;
  RuleValidator(this.lang) : _nums = NumberWords(lang);

  static const _negations = {
    'not', 'never', 'no', 'except', 'unless', 'without', 'only', 'cannot',
    'unable', 'nobody', 'nothing', 'none', 'neither', 'nor', 'avoid',
    'exclude', 'omit', 'skip', //
  };
  static final _nt = RegExp(
      r"^(?:can|don|doesn|didn|won|isn|aren|wasn|weren|haven|hasn|hadn|shouldn|wouldn|couldn|mustn|needn|shan|ain)['’]?t$");
  // Prompt rules turn "not more than three sentences" into "Max 3 sentences": same limit, no "not".
  static const _limitWords = {'max', 'under', 'least', 'within'};
  static final _numRe = RegExp(r'\d+(?:\.\d+)?');
  static const _filler = {'um', 'uh', 'er', 'ah', 'hmm', 'umm', 'uhh', 'erm'};

  /// The numbers a text says, as digit strings ("twenty five" and "25" both give 25).
  List<String> numbersIn(String s, {bool shorthandHundreds = false}) {
    final toks = RegExp(r"[A-Za-z]+(?:['’][A-Za-z]+)*|\d+(?:[.,]\d+)*|\S")
        .allMatches(s)
        .map((m) => m.group(0)!)
        .toList();
    final conv = _nums.convert(toks,
        shorthandHundreds: shorthandHundreds, keepSmallWords: false);
    final found = <String>[];
    for (final t in conv) {
      for (final m in _numRe.allMatches(t.replaceAll(',', ''))) {
        found.add(m.group(0)!);
      }
    }
    return found;
  }

  int _negCount(String s, {bool countLimits = false}) {
    var n = 0;
    for (final w in RegExp(r"[A-Za-z]+(?:['’][A-Za-z]+)*")
        .allMatches(s.toLowerCase())
        .map((m) => m.group(0)!)) {
      if (_negations.contains(w) || _nt.hasMatch(w)) n++;
      if (countLimits && _limitWords.contains(w)) n++;
    }
    return n;
  }

  /// Returns null when [output] is acceptable, otherwise a short reason.
  String? check(String cleaned, String output,
      {bool shorthandHundreds = false}) {
    if (output.trim().isEmpty && cleaned.trim().isNotEmpty) return 'empty';

    // 1 and 2: every number in, every number out (a numbered list comes from spoken "one ... two ...")
    final body = output;
    final inN = numbersIn(cleaned, shorthandHundreds: shorthandHundreds);
    final outN = numbersIn(body, shorthandHundreds: shorthandHundreds);
    final outBag = [...outN];
    for (final n in inN) {
      if (!outBag.remove(n)) return 'lost number $n';
    }
    final inBag = [...inN];
    for (final n in outN) {
      if (!inBag.remove(n)) return 'invented number $n';
    }

    // 3: negations survive
    if (_negCount(output, countLimits: true) < _negCount(cleaned)) {
      return 'lost a negation';
    }

    // 5: no always-delete filler, no new all-capitals emphasis
    final outWords =
        RegExp(r"[A-Za-z]+").allMatches(output).map((m) => m.group(0)!);
    for (final w in outWords) {
      if (_filler.contains(w.toLowerCase())) return 'filler left: $w';
    }
    final inCaps = RegExp(r'\b[A-Z]{4,}\b')
        .allMatches(cleaned)
        .map((m) => m.group(0)!)
        .toSet();
    final known = {
      ...((lang.register['techTerms'] as Map?)?.values.map((e) => '$e') ??
          const <String>[]),
    };
    for (final m in RegExp(r'\b[A-Z]{4,}\b').allMatches(output)) {
      final w = m.group(0)!;
      if (!inCaps.contains(w) && !known.contains(w)) return 'shouting: $w';
    }

    // 7: tags are balanced
    final open =
        RegExp(r'<([a-z_]+)>').allMatches(output).map((m) => m.group(1)!);
    final close =
        RegExp(r'</([a-z_]+)>').allMatches(output).map((m) => m.group(1)!);
    final o = open.toList()..sort();
    final c = close.toList()..sort();
    if (o.join(',') != c.join(',')) return 'unbalanced tags';
    return null;
  }
}
