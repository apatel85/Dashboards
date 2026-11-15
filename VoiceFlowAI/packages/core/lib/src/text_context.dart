/// The few characters on either side of the cursor, read on the device only to fit a dictation into
/// the sentence it is going into. Never stored, logged or sent anywhere (the optional cloud polish
/// only ever sees the words that were dictated).
class TextContext {
  final String before;
  final String after;
  const TextContext({this.before = '', this.after = ''});
  bool get isEmpty => before.isEmpty && after.isEmpty;
}

/// Fits dictated text into what is already there (the idea Wispr Flow documents as matching
/// "casing, spacing and punctuation to surrounding text"): inside a sentence the first word is not
/// capitalised, and a full stop is not added when more of the sentence follows the cursor.
class ContinuationFlow {
  static final _sentenceEnd = RegExp(r'[.!?]["”)\]]?\s*$');
  static final _lineStart = RegExp(r'(^|\n)[ \t]*$');
  static final _word = RegExp(r"^[A-Za-z][A-Za-z']*");

  static String adapt(String text, TextContext c, Set<String> commonWords) {
    if (text.isEmpty || c.isEmpty || text.contains('\n')) return text;
    var t = text;
    final b = c.before;
    final startsSentence =
        b.trim().isEmpty || _lineStart.hasMatch(b) || _sentenceEnd.hasMatch(b);
    if (!startsSentence) {
      final m = _word.firstMatch(t);
      if (m != null) {
        final w = m[0]!;
        final l = w.toLowerCase();
        final isI = l == 'i' || l.startsWith("i'");
        final acronym = w.length >= 2 && w == w.toUpperCase();
        if (!isI && !acronym && commonWords.contains(l)) {
          t = l[0] + t.substring(1);
        }
      }
    }
    final a = c.after;
    final more = RegExp(r'^[ \t]*(\S)').firstMatch(a);
    if (more != null && !a.startsWith(RegExp(r'[ \t]*\n'))) {
      final next = more.group(1)!;
      final continues = RegExp(r'[a-z,;)\]]').hasMatch(next);
      if (continues && t.endsWith('.') && !t.endsWith('..')) {
        t = t.substring(0, t.length - 1);
      }
    }
    return t;
  }
}
