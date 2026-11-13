import 'lang.dart';
import 'number_words.dart';
import 'profile.dart';

/// Deterministic formatter (spec §5.3). Must be good without any LLM.
class RuleFormatter {
  final LangData lang;
  final NumberWords _nums;
  RuleFormatter(this.lang) : _nums = NumberWords(lang);

  static final _tokRe = RegExp(
      r"\d+(?:\.\d+)?|[A-Za-z]+(?:['’][A-Za-z]+)*|[.,?!;:]|\n|[^\sA-Za-z0-9.,?!;:]");
  static const _terminal = {'.', '?', '!'};
  static const _punct = {'.', '?', '!', ',', ';', ':'};
  static const _whWords = {
    'what',
    'why',
    'how',
    'when',
    'where',
    'who',
    'which'
  };
  static const _noDedupe = {'had', 'that', 'is'};

  String format(String input, Profile p) {
    var t = _tokenize(input);
    t = _spokenPunct(t);
    t = _fillers(t, p.fullFillers);
    t = _repeats(t);
    t = t.map(_contraction).toList();
    if (p.expandContractions) t = t.map(_expand).toList();
    t = t.map(_fixI).toList();
    var listed = false;
    if (p.lists) {
      final r = _lists(t);
      t = r.$1;
      listed = r.$2;
    }
    if (p.numbersAsDigits) t = _nums.convert(t);
    t = _tidyPunct(t);
    t = _capitalize(t);
    return _join(t, listed);
  }

  List<String> _tokenize(String s) => _tokRe
      .allMatches(s.replaceAll('\r', ''))
      .map((m) => m.group(0)!)
      .toList();

  List<String> _spokenPunct(List<String> t) {
    final phrases = lang.spokenPunct.entries
        .map((e) => (e.key.split(' '), e.value))
        .toList();
    phrases.sort((a, b) => b.$1.length.compareTo(a.$1.length));
    final out = <String>[];
    for (var i = 0; i < t.length;) {
      var hit = false;
      for (final (words, sym) in phrases) {
        if (i + words.length <= t.length &&
            [for (var k = 0; k < words.length; k++) t[i + k].toLowerCase()]
                    .join(' ') ==
                words.join(' ')) {
          out.add(sym);
          i += words.length;
          hit = true;
          break;
        }
      }
      if (!hit) out.add(t[i++]);
    }
    return out;
  }

  List<String> _fillers(List<String> t, bool full) {
    final List<List<String>> multi =
        full ? lang.fillersFull.map((f) => f.split(' ')).toList() : [];
    final out = <String>[];
    for (var i = 0; i < t.length;) {
      final w = t[i].toLowerCase();
      if (lang.fillersPure.contains(w)) {
        i++;
        continue;
      }
      var hit = false;
      for (final m in multi) {
        if (i + m.length <= t.length &&
            [for (var k = 0; k < m.length; k++) t[i + k].toLowerCase()]
                    .join(' ') ==
                m.join(' ')) {
          i += m.length;
          hit = true;
          break;
        }
      }
      if (!hit) out.add(t[i++]);
    }
    return out;
  }

  List<String> _repeats(List<String> t) {
    var out = <String>[];
    for (final w in t) {
      final lw = w.toLowerCase();
      if (out.isNotEmpty &&
          out.last.toLowerCase() == lw &&
          RegExp(r'^[a-z]').hasMatch(lw) &&
          !_noDedupe.contains(lw) &&
          !_nums.units.containsKey(lw) &&
          !_nums.tens.containsKey(lw)) {
        continue;
      }
      out.add(w);
      // bigram: "i was i was" -> "i was"
      final n = out.length;
      if (n >= 4 &&
          RegExp(r'^[a-z]').hasMatch(lw) &&
          out[n - 1].toLowerCase() == out[n - 3].toLowerCase() &&
          out[n - 2].toLowerCase() == out[n - 4].toLowerCase() &&
          !_punct.contains(out[n - 2]) &&
          !_nums.units.containsKey(lw) &&
          !_nums.tens.containsKey(lw)) {
        out = out.sublist(0, n - 2);
      }
    }
    return out;
  }

  String _contraction(String w) =>
      lang.contractions[w.toLowerCase()] == null || w != w.toLowerCase()
          ? w
          : lang.contractions[w]!;

  String _fixI(String w) {
    if (w == 'i') return 'I';
    if (w.startsWith("i'") || w.startsWith('i’')) return 'I${w.substring(1)}';
    return w;
  }

  String _expand(String w) {
    final l = w.toLowerCase().replaceAll('’', "'");
    if (!l.contains("'")) return w;
    final direct = lang.expansions[l];
    if (direct != null) return direct == l ? w : direct;
    String res;
    if (l.endsWith("n't")) {
      res = '${l.substring(0, l.length - 3)} not';
    } else if (l.endsWith("'re")) {
      res = '${l.substring(0, l.length - 3)} are';
    } else if (l.endsWith("'ve")) {
      res = '${l.substring(0, l.length - 3)} have';
    } else if (l.endsWith("'ll")) {
      res = '${l.substring(0, l.length - 3)} will';
    } else if (l.endsWith("'m")) {
      res = '${l.substring(0, l.length - 2)} am';
    } else if (const {"that's", "it's", "there's", "what's", "here's"}
        .contains(l)) {
      res = '${l.substring(0, l.length - 2)} is';
    } else {
      return w;
    }
    return res == 'i am' || res.startsWith('i ') ? 'I${res.substring(1)}' : res;
  }

  /// "one ... two ... three ..." -> numbered list. Returns (tokens, isList).
  (List<String>, bool) _lists(List<String> t) {
    int find(String w, int from) {
      for (var i = from; i < t.length; i++) {
        if (t[i].toLowerCase() == w) return i;
      }
      return -1;
    }

    final one = find('one', 0);
    if (one < 0) return (t, false);
    final intro = lang.list('listIntro');
    final atStart = one == 0 ||
        t[one - 1] == ':' ||
        t[one - 1] == '.' ||
        intro.contains(t[one - 1].toLowerCase());
    if (!atStart) return (t, false);
    final marks = <int>[one];
    var n = 2;
    while (true) {
      const names = ['', '', 'two', 'three', 'four', 'five', 'six'];
      if (n >= names.length) break;
      final i = find(names[n], marks.last + 2); // >=1 body word between markers
      if (i < 0) break;
      marks.add(i);
      n++;
    }
    if (marks.length < 3) return (t, false);
    final out = <String>[...t.sublist(0, one)];
    if (out.isNotEmpty && !_punct.contains(out.last)) out.add(':');
    if (out.isNotEmpty && out.last == '.') out.last = ':';
    for (var k = 0; k < marks.length; k++) {
      final end = k + 1 < marks.length ? marks[k + 1] : t.length;
      var body = t.sublist(marks[k] + 1, end);
      while (body.isNotEmpty && _punct.contains(body.last)) {
        body = body.sublist(0, body.length - 1);
      }
      if (body.isNotEmpty && body.first.toLowerCase() == 'and' && k > 0) {
        body = body.sublist(1);
      }
      if (body.isNotEmpty && body.last.toLowerCase() == 'and') {
        body = body.sublist(0, body.length - 1);
      }
      out
        ..add('\n')
        ..add('${k + 1}.LIST')
        ..addAll(body);
    }
    return (out, true);
  }

  List<String> _tidyPunct(List<String> t) {
    final out = <String>[];
    for (final w in t) {
      if (_punct.contains(w)) {
        if (out.isEmpty || out.last == '\n') continue;
        if (_punct.contains(out.last)) {
          if (out.last == ',' && _terminal.contains(w)) out.last = w;
          continue;
        }
      }
      out.add(w);
    }
    return out;
  }

  List<String> _capitalize(List<String> t) {
    var start = true;
    final out = <String>[];
    for (final w in t) {
      if (w == '\n' || _terminal.contains(w)) {
        start = true;
        out.add(w);
        continue;
      }
      if (w.endsWith('.LIST') || _punct.contains(w)) {
        out.add(w);
        continue;
      }
      var x = w;
      final lw = w.toLowerCase();
      if (w == lw &&
          (lang.properNouns.contains(lw) || lang.names.contains(lw))) {
        x = _cap(w);
      }
      if (start && RegExp(r'^[a-z]').hasMatch(x)) x = _cap(x);
      if (RegExp(r'[A-Za-z0-9]').hasMatch(x)) start = false;
      out.add(x);
    }
    // Capitalize list items (token after "N.LIST").
    for (var i = 0; i < out.length - 1; i++) {
      if (out[i].endsWith('.LIST')) out[i + 1] = _cap(out[i + 1]);
    }
    return out;
  }

  String _cap(String w) => w.isEmpty ? w : w[0].toUpperCase() + w.substring(1);

  String _join(List<String> t, bool listed) {
    final sb = StringBuffer();
    String? prev;
    for (final w in t) {
      if (w == '\n') {
        sb.write('\n');
        prev = '\n';
        continue;
      }
      if (w.endsWith('.LIST')) {
        sb.write(w.substring(0, w.length - 4));
        prev = w;
        continue;
      }
      final noSpaceBefore = _punct.contains(w) || w == '%' || w == '/';
      final noSpaceAfterPrev = prev == null ||
          prev == '\n' ||
          prev == '/' ||
          prev == r'$' ||
          prev == '(' ||
          prev == '"' && false;
      if (!noSpaceBefore && !noSpaceAfterPrev) sb.write(' ');
      if (prev != null && prev.endsWith('.LIST') && !noSpaceBefore) {
        // space after "1." already added above unless suppressed
      }
      sb.write(w);
      prev = w;
    }
    var s = sb.toString().replaceAll(RegExp(r'[ \t]+\n'), '\n').trim();
    s = s.replaceAllMapped(
        RegExp(r'^(\d+\.)(\S)', multiLine: true), (m) => '${m[1]} ${m[2]}');
    if (s.isEmpty) return s;
    if (listed) return s;
    if (!_terminal.contains(s[s.length - 1]) &&
        !RegExp(r'[:;,]$').hasMatch(s)) {
      s += _isQuestion(s) ? '?' : '.';
    } else if (RegExp(r'[:;,]$').hasMatch(s)) {
      s = '${s.substring(0, s.length - 1)}.';
    }
    return s;
  }

  bool _isQuestion(String s) {
    final i = s.lastIndexOf(RegExp(r'[.?!]\s|\n'));
    final last = (i < 0 ? s : s.substring(i + 1)).trim().toLowerCase();
    final w = last.split(RegExp(r'\s+'));
    if (w.length < 2) return false;
    if (lang.questionAux.contains(w[0]) && lang.questionFollow.contains(w[1])) {
      return true;
    }
    return _whWords.contains(w[0]) && lang.questionAux.contains(w[1]);
  }
}
