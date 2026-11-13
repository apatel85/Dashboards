import 'lang.dart';

/// Converts runs of English number words in a token list to digits.
class NumberWords {
  final Map<String, int> units, tens, scales;
  final Set<String> unitWords;
  NumberWords(LangData l)
      : units = Map<String, int>.from(l.numbers['units'] as Map),
        tens = Map<String, int>.from(l.numbers['tens'] as Map),
        scales = Map<String, int>.from(l.numbers['scales'] as Map),
        unitWords = Set<String>.from(l.numbers['unitWords'] as List);

  bool _isNum(String t) {
    final w = t.toLowerCase();
    return units.containsKey(w) || tens.containsKey(w) || scales.containsKey(w);
  }

  /// Returns tokens with number runs replaced by digit tokens.
  List<String> convert(List<String> toks) {
    final out = <String>[];
    var i = 0;
    while (i < toks.length) {
      if (!_isNum(toks[i])) {
        out.add(toks[i++]);
        continue;
      }
      // Collect a run; split so "nineteen ninety nine" -> [19][99].
      final runs = <List<String>>[];
      var cur = <String>[];
      var j = i;
      while (j < toks.length) {
        final w = toks[j].toLowerCase();
        if (w == 'and' &&
            cur.isNotEmpty &&
            scales.containsKey(cur.last.toLowerCase()) &&
            j + 1 < toks.length &&
            _isNum(toks[j + 1])) {
          j++;
          continue;
        }
        if (!_isNum(w)) break;
        if (cur.isNotEmpty) {
          final p = cur.last.toLowerCase();
          final prevBig = (units[p] ?? 0) >= 10 || tens.containsKey(p);
          final startsNew = tens.containsKey(w) || (units[w] ?? 0) >= 10;
          if (prevBig && startsNew) {
            runs.add(cur);
            cur = <String>[];
          }
        }
        cur.add(toks[j]);
        j++;
      }
      if (cur.isNotEmpty) runs.add(cur);
      final vals = runs.map(_value).toList();
      final nextTok = j < toks.length ? toks[j].toLowerCase() : '';
      if (runs.length == 1 &&
          runs[0].length == 1 &&
          vals[0] < 10 &&
          !unitWords.contains(nextTok)) {
        out.add(toks[i]); // lone small number stays a word
      } else if (runs.length == 2 && vals.every((v) => v >= 10 && v < 100)) {
        out.add('${vals[0]}${vals[1].toString().padLeft(2, '0')}'); // year
      } else if (runs.length == 1 &&
          runs[0].length > 1 &&
          runs[0].every((w) =>
              units.containsKey(w.toLowerCase()) &&
              units[w.toLowerCase()]! < 10)) {
        // spoken digit-by-digit ("five five five one two") -> concatenate
        out.add(runs[0].map((w) => units[w.toLowerCase()]).join());
      } else {
        for (final v in vals) {
          out.add(_fmt(v));
        }
      }
      i = j;
    }
    return out;
  }

  /// Group thousands from 10,000 up; smaller values (e.g. 2500) stay plain.
  String _fmt(int v) => v < 10000
      ? '$v'
      : v
          .toString()
          .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

  int _value(List<String> run) {
    var total = 0, cur = 0;
    for (final t in run) {
      final w = t.toLowerCase();
      if (units.containsKey(w)) {
        cur += units[w]!;
      } else if (tens.containsKey(w)) {
        cur += tens[w]!;
      } else {
        final s = scales[w]!;
        if (s == 100) {
          cur = (cur == 0 ? 1 : cur) * 100;
        } else {
          total += (cur == 0 ? 1 : cur) * s;
          cur = 0;
        }
      }
    }
    return total + cur;
  }
}
