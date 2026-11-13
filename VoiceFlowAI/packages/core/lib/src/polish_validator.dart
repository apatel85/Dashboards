/// Rejects LLM output that breaks the invariants of spec §5.4.
/// Returns null when valid, else a short reason.
class PolishValidator {
  static final _prefaces = RegExp(
      r"^\s*(here is|here's|sure|certainly|of course|as an ai|i'm sorry|i cannot)\b",
      caseSensitive: false);

  String? validate(String input, String output,
      {List<String> glossary = const []}) {
    final out = output.trim();
    if (out.isEmpty) return 'empty';
    if (out.length > 3 * input.length + 200) return 'too long';
    if (_prefaces.hasMatch(out)) return 'preface';
    final outDigits = out.replaceAll(RegExp(r'[,\s]'), '');
    for (final m in RegExp(r'\d+(?:\.\d+)?').allMatches(input)) {
      if (!outDigits.contains(m.group(0)!)) return 'digits';
    }
    final low = input.toLowerCase();
    for (final g in glossary) {
      if (low.contains(g.toLowerCase()) && !out.contains(g)) return 'glossary';
    }
    if (_nonLatinRatio(out) > _nonLatinRatio(input) + 0.3) return 'script';
    if (_overlap(input, out) < 0.4) return 'drift';
    return null;
  }

  double _nonLatinRatio(String s) {
    final letters = RegExp(r'\p{L}', unicode: true).allMatches(s).length;
    if (letters == 0) return 0;
    final latin = RegExp(r'[A-Za-zÀ-ɏ]').allMatches(s).length;
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
}
