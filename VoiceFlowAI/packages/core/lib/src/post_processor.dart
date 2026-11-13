import 'lang.dart';
import 'pack.dart';

/// Dictionary corrections, pack abbreviations (spec §5.2 step 8).
class PostProcessor {
  final LangData lang;
  late final Set<String> _common =
      lang.list('commonWords').map((e) => e.toLowerCase()).toSet();
  PostProcessor(this.lang);

  String process(String text,
      {List<String> dictionary = const [],
      Map<String, String> corrections = const {},
      List<DomainPack> packs = const []}) {
    var s = text;
    for (final p in packs) {
      for (final e in p.abbreviations.entries) {
        s = s.replaceAllMapped(
            RegExp('\\b${RegExp.escape(e.key)}\\b', caseSensitive: false),
            (_) => e.value);
      }
    }
    for (final e in corrections.entries) {
      s = s.replaceAllMapped(
          RegExp('\\b${RegExp.escape(e.key)}\\b', caseSensitive: false),
          (_) => e.value);
    }
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
        final d = _edit(lw, t.toLowerCase());
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
