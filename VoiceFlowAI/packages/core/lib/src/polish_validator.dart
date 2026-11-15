import 'lang.dart';
import 'rule_validator.dart';

/// Rejects LLM output that breaks the invariants of spec §5.4 and spec section 14.
/// Returns null when valid, else a short reason. A rejected reply is never shown: the offline
/// result stands.
///
/// Checks: empty, far too long, a chatty preface, a number lost or invented, a glossary term lost,
/// a changed script, a lost negation, an apology or promise the speaker did not make, a banned
/// "official" phrase the speaker did not use, a lost or new masking placeholder, and a word
/// overlap floor that depends on the profile (85% in the same order for Casual, 40% of content
/// words for Business and Professional, none for AI prompting where the fact checks still apply).
class PolishValidator {
  final RuleValidator? _facts;
  final LangData? _lang;
  PolishValidator({LangData? lang})
      : _lang = lang,
        _facts = lang == null ? null : RuleValidator(lang);

  static final _prefaces = RegExp(
      r"^\s*(here is|here's|sure|certainly|of course|as an ai|i'm sorry|i cannot)\b",
      caseSensitive: false);
  static final _apology =
      RegExp(r'\b(sorry|apolog\w*|regrets?)\b', caseSensitive: false);
  static final _promise = RegExp(
      r'\b(will ensure|guarantee[sd]?|promise[sd]?|commit(?:ted|s|ment)?)\b',
      caseSensitive: false);
  static final _placeholder = RegExp(r'\[\[N\d+\]\]');
  static final _digits = RegExp(r'\d+(?:\.\d+)?');

  List<String> get _banned =>
      List<String>.from(_lang?.register['bannedWords'] as List? ?? const []);

  /// [input] is the rule-formatted text the model was given; [transcript] is the cleaned
  /// transcript that was sent with it (facts may come from either).
  String? validate(String input, String output,
      {List<String> glossary = const [],
      String profileId = 'business',
      String? transcript}) {
    final out = output.trim();
    if (out.isEmpty) return 'empty';
    if (out.length > 3 * input.length + 200) return 'too long';
    if (_prefaces.hasMatch(out)) return 'preface';
    // placeholders like [[N1]] are checked on their own below; their digits are not facts
    String bare(String s) => s.replaceAll(_placeholder, ' ');
    final outDigits = bare(out).replaceAll(RegExp(r'[,\s]'), '');
    for (final m in _digits.allMatches(bare(input))) {
      if (!outDigits.contains(m.group(0)!)) return 'digits';
    }
    final allIn = '$input ${transcript ?? ''}';
    final lowIn = allIn.toLowerCase();

    // a number in the output that nobody said
    final said = <String>{
      for (final m in _digits.allMatches(bare(allIn))) m.group(0)!,
      ...?_facts?.numbersIn(bare(allIn)),
    };
    for (final m in _digits
        .allMatches(bare(out).replaceAll(RegExp(r'(?<=\d),(?=\d{3})'), ''))) {
      if (!said.contains(m.group(0)!)) return 'invented number';
    }

    for (final g in glossary) {
      if (input.toLowerCase().contains(g.toLowerCase()) && !out.contains(g)) {
        return 'glossary';
      }
    }
    if (_nonLatinRatio(out) > _nonLatinRatio(input) + 0.3) return 'script';

    // negations survive ("not", "never", "can't" ...)
    if (RuleValidator.negationCount(out, countLimits: true) <
        RuleValidator.negationCount(transcript ?? input)) {
      return 'negation';
    }

    // nothing added the speaker did not say
    if (_apology.hasMatch(out) && !_apology.hasMatch(allIn)) return 'apology';
    if (_promise.hasMatch(out) && !_promise.hasMatch(allIn)) return 'promise';
    if (profileId == 'business' || profileId == 'professional') {
      final lo = out.toLowerCase();
      for (final b in _banned) {
        if (lo.contains(b) && !lowIn.contains(b)) return 'banned word';
      }
    }

    // masking placeholders: every one in the draft comes back, and none is new
    final inPh = _placeholder.allMatches(input).map((m) => m.group(0)!).toSet();
    final known =
        _placeholder.allMatches(allIn).map((m) => m.group(0)!).toSet();
    final outPh = _placeholder.allMatches(out).map((m) => m.group(0)!).toList();
    for (final p in inPh) {
      if (!outPh.contains(p)) return 'placeholder';
    }
    for (final p in outPh) {
      if (!known.contains(p)) return 'placeholder';
    }

    switch (profileId) {
      case 'ai_prompting':
        break; // a prompt is restructured on purpose; the fact checks above still apply
      case 'casual':
        if (_sameWordsInOrder(transcript ?? input, out) < 0.85) return 'drift';
      default:
        if (_overlap(input, out) < 0.4) return 'drift';
    }
    return null;
  }

  double _nonLatinRatio(String s) {
    final letters = RegExp(r'\p{L}', unicode: true).allMatches(s).length;
    if (letters == 0) return 0;
    final latin = RegExp(r'[A-Za-z\u00C0-\u024F]').allMatches(s).length;
    return 1 - latin / letters;
  }

  /// Share of input content words (len > 3) that survive in the output.
  /// Catches "followed the injected instruction" rewrites.
  double _overlap(String input, String output) {
    Set<String> w(String s) => RegExp(r"[a-z0-9']+")
        .allMatches(s.toLowerCase())
        .map((m) => m.group(0)!)
        .where((x) => x.length > 3)
        .toSet();
    final i = w(input);
    if (i.length < 3) return 1;
    final o = w(output);
    return i.where(o.contains).length / i.length;
  }

  /// Casual mode: at least about 85% of the output's words are the transcript's words in the same
  /// order (longest common subsequence over words, case and punctuation ignored).
  double _sameWordsInOrder(String transcript, String output) {
    List<String> w(String s) => RegExp(r"[a-z0-9]+(?:'[a-z]+)?")
        .allMatches(s.toLowerCase())
        .map((m) => m.group(0)!)
        .toList();
    final a = w(transcript), b = w(output);
    if (b.isEmpty) return 0;
    if (a.length < 4) return 1; // too short to judge
    // "about 85%": a short message may still have two words fixed ("i seen" -> "I saw"), so the
    // floor is whichever is lower: 85%, or all but two words.
    final floor = a.length >= 14 ? 0.85 : (b.length - 2) / b.length;
    var prev = List<int>.filled(b.length + 1, 0);
    for (var i = 1; i <= a.length; i++) {
      final cur = List<int>.filled(b.length + 1, 0);
      for (var j = 1; j <= b.length; j++) {
        cur[j] = a[i - 1] == b[j - 1]
            ? prev[j - 1] + 1
            : (prev[j] > cur[j - 1] ? prev[j] : cur[j - 1]);
      }
      prev = cur;
    }
    final ratio = prev[b.length] / b.length;
    return ratio >= floor ? 1 : ratio;
  }
}
