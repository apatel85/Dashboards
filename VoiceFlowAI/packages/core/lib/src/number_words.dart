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
  ///
  /// With [shorthandHundreds], a single digit word followed by a tens word is read the way
  /// clinicians say it: "one forty" = 140, "one twenty five" = 125 (not 41 / 46).
  List<String> convert(List<String> toks, {bool shorthandHundreds = false}) {
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
          // "forty two fifty" is two numbers, never 40 + 2 + 50 = 92: a tens word can only
          // continue a run after a scale word ("two hundred fifty"). Clinician shorthand
          // ("one forty") is the one exception and is handled in _value.
          final afterScale = scales.containsKey(p);
          final shorthandPair = shorthandHundreds &&
              cur.length == 1 &&
              (units[p] ?? 99) >= 1 &&
              (units[p] ?? 99) <= 9;
          if (startsNew && !afterScale && !shorthandPair ||
              prevBig && startsNew) {
            runs.add(cur);
            cur = <String>[];
          }
        }
        cur.add(toks[j]);
        j++;
      }
      if (cur.isNotEmpty) runs.add(cur);
      final vals =
          runs.map((r) => _value(r, shorthand: shorthandHundreds)).toList();
      // "two point five" -> 2.5 (digits only after "point"; a bare "point" stays a word).
      if (j + 1 < toks.length && toks[j].toLowerCase() == 'point') {
        var k = j + 1;
        final ds = <String>[];
        while (k < toks.length && (units[toks[k].toLowerCase()] ?? 99) < 10) {
          ds.add('${units[toks[k].toLowerCase()]}');
          k++;
        }
        if (ds.isNotEmpty) {
          for (var r = 0; r < vals.length - 1; r++) {
            out.add(_fmt(vals[r]));
          }
          out.add('${_fmt(vals.last)}.${ds.join()}');
          i = k;
          continue;
        }
      }
      final nextTok = j < toks.length ? toks[j].toLowerCase() : '';
      if (runs.length == 1 &&
          runs[0].length == 1 &&
          vals[0] < 10 &&
          !unitWords.contains(nextTok) &&
          !_timeContext(toks, i)) {
        out.add(toks[i]); // lone small number stays a word
      } else if (runs.length == 2 && vals.every((v) => v >= 10 && v < 100)) {
        // "nineteen ninety nine" -> 1999 (a year); "total should be forty two fifty" -> 4,250
        final joined = '${vals[0]}${vals[1].toString().padLeft(2, '0')}';
        out.add(_amountContext(toks, i) ? _comma(int.parse(joined)) : joined);
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

  static const _amountWords = {
    'total',
    'price',
    'cost',
    'costs',
    'amount',
    'invoice',
    'balance',
    'fee',
    'fees',
    'owe',
    'owes',
    'charge',
    'charged',
    'bill',
    'budget',
    'worth',
    'pay',
    'paid',
    'salary',
    'revenue',
    'refund',
    'quote',
    'payment',
  };

  /// Money was being talked about just before this number ("the total should be ...").
  bool _amountContext(List<String> toks, int i) {
    for (var k = i - 1; k >= 0 && k >= i - 8; k--) {
      if (_amountWords.contains(toks[k].toLowerCase())) return true;
    }
    return false;
  }

  static const _timePreps = {
    'at',
    'around',
    'by',
    'until',
    'till',
    'before',
    'after'
  };

  /// "around seven", "at six", "instead of seven": a time or a value, so digits ("one of" stays).
  bool _timeContext(List<String> toks, int i) {
    if (i == 0) return false;
    final p = toks[i - 1].toLowerCase();
    if (_timePreps.contains(p)) return true;
    return p == 'of' && i >= 2 && toks[i - 2].toLowerCase() == 'instead';
  }

  String _comma(int v) => v
      .toString()
      .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

  /// Group thousands from 10,000 up; smaller values (e.g. 2500) stay plain.
  String _fmt(int v) => v < 10000
      ? '$v'
      : v
          .toString()
          .replaceAllMapped(RegExp(r'\B(?=(\d{3})+(?!\d))'), (_) => ',');

  int _value(List<String> run, {bool shorthand = false}) {
    if (shorthand && run.length >= 2) {
      final first = units[run[0].toLowerCase()] ?? 0;
      if (first >= 1 &&
          first <= 9 &&
          tens.containsKey(run[1].toLowerCase()) &&
          run.skip(1).every((w) => !scales.containsKey(w.toLowerCase()))) {
        return first * 100 + _value(run.sublist(1));
      }
    }
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
