/// Spoken self-corrections ("Monday... actually it's Tuesday") are disfluencies: the final text
/// should only carry the corrected version. Deterministic and conservative: it only rewrites when
/// the correction clearly points at what it corrects, otherwise the text is left exactly as spoken.
class SelfCorrection {
  static final _lead = RegExp(
      r"^(?:(?:oh|no|wait|sorry|well|um|uh|hmm)[,.]?\s+)*(?:actually|i mean|or rather|correction|make that|let me correct that|no wait|wait no|sorry)\b[,:]?\s*",
      caseSensitive: false);
  static final _inline = RegExp(
      r"\s*[,;—-]\s*(?:no,?\s+wait|wait,?\s+no|i mean|or rather|sorry|actually)[,:]?\s+",
      caseSensitive: false);
  static const _preps = {
    'at',
    'on',
    'in',
    'by',
    'for',
    'to',
    'from',
    'until',
    'till',
    'before',
    'after'
  };
  static const _stop = {
    'the',
    'a',
    'an',
    'it',
    'is',
    'are',
    'was',
    'were',
    'to',
    'of',
    'and',
    'or',
    'for',
    'in',
    'on',
    'at',
    'i',
    'we',
    'you',
    'he',
    'she',
    'they',
    'this',
    'that',
    'my',
    'our',
    'be',
    'will',
    'not',
    'with',
    'so',
    'me',
    'us',
    'do',
    'have',
    'has'
  };
  static final _classes = <RegExp>[
    RegExp(r'\b\d{1,2}(?::\d{2})?\s?(?:AM|PM|a\.m\.|p\.m\.)(?=\W|$)',
        caseSensitive: false),
    RegExp(r'\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b',
        caseSensitive: false),
    RegExp(
        r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b',
        caseSensitive: false),
  ];

  static String apply(String input) {
    final sentences = input
        .trim()
        .split(RegExp(r'(?<=[.!?])\s+'))
        .where((s) => s.isNotEmpty)
        .toList();
    if (sentences.isEmpty) return input;
    final out = <String>[];
    for (final s in sentences) {
      final m = _lead.firstMatch(s);
      if (m != null && out.isNotEmpty) {
        final rest = s.substring(m.end).trim();
        final fixed = rest.isEmpty ? null : _repair(out.last, rest);
        if (fixed != null) {
          out[out.length - 1] = fixed;
          continue;
        }
      }
      out.add(_inlineFix(s));
    }
    return out.join(' ');
  }

  // ---- "X, I mean Y" inside one sentence
  static String _inlineFix(String s) {
    final m = _inline.firstMatch(s);
    if (m == null) return s;
    final left = s.substring(0, m.start);
    var right = s.substring(m.end);
    final term = RegExp(r'[.!?]$').firstMatch(right)?.group(0) ?? '';
    right = right.replaceAll(RegExp(r'[.!?]$'), '').trim();
    if (right.isEmpty || left.isEmpty) return s;
    final rw = right.split(RegExp(r'\s+'));
    final byClass = _replaceClasses(left, right);
    if (byClass != null) return byClass + term;
    if (rw.length <= 3) {
      final lw = left.split(RegExp(r'\s+'));
      if (lw.length > rw.length) {
        var keep = lw.sublist(0, lw.length - rw.length);
        return '${keep.join(' ')} $right$term';
      }
    }
    return s;
  }

  static String? _repair(String prev, String rest) {
    final term = RegExp(r'[.!?]$').firstMatch(prev)?.group(0) ?? '.';
    final p = prev.replaceAll(RegExp(r'[.!?]+$'), '').trim();
    final r = rest.replaceAll(RegExp(r'[.!?]+$'), '').trim();
    // 1. "it is not A, it is B" / "not A but B"
    final neg = RegExp(
            r"^(?:(?:it|that|this)(?:'s| is| was)\s+)?not\s+(.+?)\s*,\s*(?:but\s+)?(?:(?:it|that|this)(?:'s| is| was)\s+)?(.+)$|^(?:(?:it|that|this)(?:'s| is| was)\s+)?not\s+(.+?)\s+but\s+(.+)$",
            caseSensitive: false)
        .firstMatch(r);
    if (neg != null) {
      final a = (neg.group(1) ?? neg.group(3))!.trim();
      final b = (neg.group(2) ?? neg.group(4))!.trim();
      final x = _replaceSpan(p, a, b);
      if (x != null) return x + term;
    }
    final rw = r.split(RegExp(r'\s+'));
    // 2. a short correction naming a time / day / date
    if (rw.length <= 6) {
      final x = _replaceClasses(p, r);
      if (x != null) return x + term;
    }
    // 3. the whole sentence said again with a change
    if (rw.length >= 4) {
      final a = _content(p), b = _content(r);
      if (a.isNotEmpty && b.isNotEmpty) {
        final common = a.intersection(b).length;
        if (common / (a.length < b.length ? a.length : b.length) >= 0.5) {
          return r[0].toUpperCase() + r.substring(1) + term;
        }
      }
    }
    return null;
  }

  static Set<String> _content(String s) => RegExp(r"[A-Za-z0-9']+")
      .allMatches(s.toLowerCase())
      .map((m) => m.group(0)!)
      .where((w) => !_stop.contains(w))
      .toSet();

  /// Replaces the span of [prev] that says [a] with [b], including the preposition in front of it
  /// when [b] brings its own ("at 9 AM on Monday" + "on Tuesday at 9 AM").
  static String? _replaceSpan(String prev, String a, String b) {
    final aw = a.split(RegExp(r'\s+'));
    final core = (aw.isNotEmpty &&
            _preps.contains(aw.first.toLowerCase()) &&
            aw.length > 1)
        ? aw.sublist(1).join(' ')
        : a;
    final re =
        RegExp('\\b${RegExp.escape(core)}(?=\\W|\$)', caseSensitive: false);
    final ms = re.allMatches(prev).toList();
    if (ms.isEmpty) return null;
    final m = ms.last;
    var start = m.start;
    final bw = b.split(RegExp(r'\s+'));
    if (_preps.contains(bw.first.toLowerCase())) {
      final before = prev.substring(0, start).trimRight();
      final pm = RegExp(r'(\S+)$').firstMatch(before);
      if (pm != null && _preps.contains(pm.group(1)!.toLowerCase())) {
        start = before.length - pm.group(1)!.length;
      }
    }
    return '${prev.substring(0, start)}$b${prev.substring(m.end)}'.trim();
  }

  /// Replaces the last time / weekday / date in [prev] with the ones named in [r].
  static String? _replaceClasses(String prev, String r) {
    var out = prev;
    var changed = false;
    for (final c in _classes) {
      final rm = c.firstMatch(r);
      final pms = c.allMatches(out).toList();
      if (rm == null || pms.isEmpty) continue;
      final pm = pms.last;
      out = out.substring(0, pm.start) + rm.group(0)! + out.substring(pm.end);
      changed = true;
    }
    return changed ? out : null;
  }
}
