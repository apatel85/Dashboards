import 'lang.dart';

/// Result of [Masker.mask]: the text with placeholders, and what each placeholder stands for.
class MaskResult {
  final String text;
  final Map<String, String> values;
  const MaskResult(this.text, this.values);
}

/// The masking option for cloud polish (spec section 13): before text leaves the device, every
/// name, number, amount, date, e-mail address and phone number becomes a placeholder such as
/// `[[N1]]`; the placeholders are put back on the device after the reply. The cloud model never
/// sees the specifics, and cannot change a fact it cannot see.
class Masker {
  final LangData lang;
  Masker(this.lang);

  static const _months = 'january|february|march|april|may|june|july|august|'
      'september|october|november|december';
  static const _days =
      'monday|tuesday|wednesday|thursday|friday|saturday|sunday';

  late final String _numWord = () {
    final n = lang.numbers;
    final words = [
      ...(n['units'] as Map).keys,
      ...(n['tens'] as Map).keys,
      ...(n['scales'] as Map).keys,
    ].join('|');
    return '(?:$words)(?:[ -]+(?:and[ -]+)?(?:$words)){0,5}';
  }();

  // case-insensitive: e-mail, address, phone, amount, time, date, weekday, digits, number words
  late final RegExp _re = RegExp(
    [
      r'[\w.+-]+@[\w-]+(?:\.[\w-]+)+', // e-mail
      r'(?:https?://|www\.)\S+', // address
      r'\+?\d[\d\s().-]{7,}\d', // phone number
      r'[$£€]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|billion|thousand))?', // amount
      r'\b\d{1,2}:\d{2}(?:\s?[ap]\.?m\.?)?', // time
      r'\b(?:' +
          _months +
          r')(?:\s+\d{1,2}(?:st|nd|rd|th)?)?\b', // month / date
      r'\b(?:' + _days + r')\b', // weekday
      r'\b\d[\d,]*(?:\.\d+)?(?:st|nd|rd|th|%)?', // other numbers
      '\\b$_numWord\\b', // numbers said in words
    ].join('|'),
    caseSensitive: false,
  );

  // case-sensitive: a capitalised word in the middle of a sentence is a name
  static final _midName =
      RegExp(r'(?<=[a-z,;:] )[A-Z][a-z]+(?:\s[A-Z][a-z]+)?\b');
  late final Set<String> _names = lang.names;

  MaskResult mask(String text, {Map<String, String>? into}) {
    final values = into ?? <String, String>{};
    final byValue = {for (final e in values.entries) e.value: e.key};
    String put(String v) {
      return byValue.putIfAbsent(v, () {
        final k = '[[N${values.length + 1}]]';
        values[k] = v;
        return k;
      });
    }

    // names first (they are case-sensitive), then the rest
    var out = text.replaceAllMapped(_midName, (m) {
      final v = m.group(0)!;
      return RegExp('^(?:$_months|$_days)\$', caseSensitive: false).hasMatch(v)
          ? v
          : put(v);
    });
    out = out.replaceAllMapped(_re, (m) => put(m.group(0)!));
    // known first names at the start of a sentence ("Raj, can you ...")
    out = out.replaceAllMapped(RegExp(r"(^|[.!?]\s+)([A-Z][a-z]+)(?=[,\s])"),
        (m) {
      final w = m.group(2)!;
      return _names.contains(w.toLowerCase())
          ? '${m.group(1)}${put(w)}'
          : m[0]!;
    });
    return MaskResult(out, values);
  }

  /// Replaces every value already known (from masking the draft) wherever it also appears in
  /// [text], so the transcript and the draft use the same placeholders. Lower-case spellings
  /// of a masked name ("priya" for "Priya") are caught too.
  String maskKnown(String text, Map<String, String> values) {
    var out = text;
    final longestFirst = values.entries.toList()
      ..sort((a, b) => b.value.length.compareTo(a.value.length));
    for (final e in longestFirst) {
      out = out.replaceAll(
          RegExp('(?<![A-Za-z0-9])${RegExp.escape(e.value)}(?![A-Za-z0-9])',
              caseSensitive: false),
          e.key);
    }
    return out;
  }

  /// Puts the original values back. Unknown placeholders are left as they are (the validator
  /// rejects such a reply before this is called).
  String unmask(String text, Map<String, String> values) =>
      text.replaceAllMapped(
          RegExp(r'\[\[N\d+\]\]'), (m) => values[m.group(0)!] ?? m.group(0)!);
}
