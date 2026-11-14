import 'lang.dart';
import 'number_words.dart';

/// What kind of text box we are typing into (Android `EditorInfo` input type).
enum FieldKind { text, email, url, number, password }

/// Email / URL / number fields get literal text, not prose (spec §9.4: "skip
/// sentence punctuation and capitalization"). "john at example dot com" ->
/// "john@example.com"; "example dot com slash docs" -> "example.com/docs".
class FieldFormatter {
  FieldFormatter(this.lang) : _nums = NumberWords(lang);
  final LangData lang;
  final NumberWords _nums;

  static const _symbols = {
    'dot': '.',
    'slash': '/',
    'dash': '-',
    'hyphen': '-',
    'underscore': '_',
    'colon': ':',
    'plus': '+',
  };

  String format(String raw, FieldKind kind) {
    var words = raw
        .toLowerCase()
        // sentence punctuation the speech engine glued to a word ("com.") is not part of
        // the value; dots INSIDE a word ("example.com") are kept
        .replaceAll(RegExp(r'[.,?!;]+(?=\s|$)'), ' ')
        .replaceAll(RegExp(r'[,?!;]+'), ' ')
        .split(RegExp(r'\s+'))
        .where((w) => w.isNotEmpty && !lang.fillersPure.contains(w))
        .toList();
    // a spoken full stop at the very end is punctuation, not part of the value
    while (words.isNotEmpty && (words.last == 'period' || words.last == '.')) {
      words.removeLast();
    }
    if (kind == FieldKind.number) {
      return _nums.convert(words).join().replaceAll(RegExp(r'[^0-9.,\-+]'), '');
    }
    final out = StringBuffer();
    for (final w in words) {
      if (kind == FieldKind.email && w == 'at') {
        out.write('@');
      } else if (_symbols.containsKey(w)) {
        out.write(_symbols[w]);
      } else {
        out.write(w.replaceAll(RegExp(r'[^a-z0-9._@\-+/:%~#=&]'), ''));
      }
    }
    return out.toString();
  }
}
