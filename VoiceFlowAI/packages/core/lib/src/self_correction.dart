/// Spoken self-corrections ("meeting on Monday... no, sorry, it's Tuesday") are disfluencies: the
/// final text should carry only the corrected version. Deterministic and conservative: it only
/// rewrites when the correction clearly points at what it corrects; anything else is left exactly
/// as spoken (with the retraction words removed when they were an explicit retraction).
///
/// Flow: find a retraction (its own sentence, leading a sentence, or inline after a comma), work out
/// what it corrects (a day, time, date, amount, percent, quantity, name or place, looking back up
/// to four sentences), put the new value in place and drop the retraction.
class SelfCorrection {
  // ---- retraction phrases. "strong" phrases always mean "take that back"; "weak" ones
  // (actually / I mean / or rather) can also introduce new information, so they act only when the
  // correction is short and clearly names a replacement.
  static const _strong =
      r"no,?\s+wait|wait,?\s+no|no,?\s+sorry(?=[,.!;:]|\s|$)|sorry(?=[,.!;:]|$)|oops|my bad|my mistake|"
      r"wait(?=[,.!;:])|hold on(?=[,.!;:])|hang on(?=[,.!;:])|that'?s (?:wrong|not right|incorrect)|"
      r"that is (?:wrong|not right|incorrect)|let me correct (?:that|myself)|scratch that|strike that|"
      r"never mind(?: that)?|forget (?:that|i said that)|ignore that|negate that|correction(?=[,.!;:])|"
      r"make that";
  static const _weak = r"actually|i mean|or rather";
  static const _filler = r"no|nope|oh|well|um|uh|hmm|so|okay|ok|right";

  static final _lead = RegExp(
      '^((?:(?:$_strong|$_weak|$_filler)[\\s,.!;:-]*)+)(.*)\$',
      caseSensitive: false,
      dotAll: true);
  static final _strongRe = RegExp('(?:$_strong)', caseSensitive: false);
  static final _weakRe = RegExp('(?:$_weak)', caseSensitive: false);

  static final _inline = RegExp(
      '\\s*[,;\u2014-]\\s*(?:no,?\\s+)?(?:$_strong|i mean|or rather)[,.:]?\\s+',
      caseSensitive: false);
  static final _inlineActually =
      RegExp(r'\s*,\s*actually,\s+', caseSensitive: false);

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
    'has',
    'its',
    "it's",
    'scheduled',
    'starts',
    'start',
    'ends',
    'end',
    'going',
    'should',
    'would',
    'make',
    'now',
    'instead',
    'rather',
    'moved',
    'move',
    'changed',
    'change',
    'than'
  };

  static final _changeWords = RegExp(
      r"\b(?:not|instead|rather|make it|changed?|moved?|push(?:ed)?|reschedul\w*|should be|now)\b",
      caseSensitive: false);

  /// Kinds of value a correction can replace. Order matters only for reporting.
  static final _classes = <RegExp>[
    RegExp(r'\b\d{1,2}(?::\d{2})?\s?(?:AM|PM|a\.m\.|p\.m\.)(?=\W|$)',
        caseSensitive: false),
    RegExp(r'\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\b',
        caseSensitive: false),
    RegExp(
        r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:st|nd|rd|th)?\b',
        caseSensitive: false),
    RegExp(
        r'(?:[$\u20ac\u00a3]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:k|m|million|thousand))?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars?|bucks|usd|euros?|pounds?)\b)',
        caseSensitive: false),
    RegExp(r'\b\d+(?:\.\d+)?\s?(?:%|percent)(?!\w)', caseSensitive: false),
    RegExp(
        r'\b\d[\d,]*\s?(?:people|attendees|guests|users|customers|clients|employees|units|items|licenses|seats|hours|minutes|days|weeks|months|years|participants|members|candidates)\b',
        caseSensitive: false),
  ];

  static String apply(String input) {
    final text = input.trim();
    if (text.isEmpty) return input;
    // Sentences with the whitespace that followed each one, so paragraph breaks survive.
    final sents = <String>[];
    final seps = <String>[];
    var from = 0;
    for (final m in RegExp(r'(?<=[.!?])(\s+)').allMatches(text)) {
      sents.add(text.substring(from, m.start));
      seps.add(m.group(1)!);
      from = m.end;
    }
    sents.add(text.substring(from));
    seps.add('');

    final out = <String>[];
    final outSeps = <String>[];
    var pending =
        false; // a bare "No, sorry." was said: the next sentence is the correction
    void add(String s, String sep) {
      out.add(s);
      outSeps.add(sep);
    }

    for (var i = 0; i < sents.length; i++) {
      final s = sents[i];
      final lead = _lead.firstMatch(s);
      var strong = false, weak = false;
      var rest = s;
      if (lead != null) {
        final marker = lead.group(1)!;
        strong = _strongRe.hasMatch(marker);
        weak = !strong && _weakRe.hasMatch(marker);
        if (strong || weak) {
          rest = lead.group(2)!.trim();
        } else {
          rest = s; // only filler ("Well, ...", "No problem"): not a retraction
        }
      }
      final isMarker = strong || weak;
      if (isMarker && rest.isEmpty) {
        pending = pending ||
            strong; // drop the marker; a retraction applies to the next sentence
        continue;
      }
      if (isMarker && out.isNotEmpty) {
        if (_apply(out, rest, strong: strong)) continue;
        // Not applied: an explicit retraction loses only its own words; "actually" stays as said.
        add(strong ? _cap(rest) : _inlineFix(s), seps[i]);
        pending = false;
        continue;
      }
      if (pending && out.isNotEmpty) {
        pending = false;
        if (_apply(out, s, strong: true)) continue;
      }
      // no retraction words at all (the speech model may have dropped "no, sorry"): a very short
      // "It's on Tuesday at 10 am." right after a sentence stating the same kind of fact replaces it
      if (out.isNotEmpty && _implicit(out, s)) continue;
      add(_inlineFix(s), seps[i]);
    }

    final b = StringBuffer();
    for (var k = 0; k < out.length; k++) {
      b.write(out[k]);
      if (k < out.length - 1) b.write(outSeps[k]);
    }
    return b.toString();
  }

  static final _pronounClause = RegExp(
      r"^(?:it|that|this|they)(?:'s| is| was| will be| starts| begins)\b",
      caseSensitive: false);

  /// Conservative: the sentence is only "it is" plus values (day, time, date, amount...) and small
  /// words, and the sentence just before it states every one of those kinds of value.
  static bool _implicit(List<String> out, String s) {
    final rt = _noTerm(s);
    if (!_pronounClause.hasMatch(rt)) return false;
    if (rt.split(RegExp(r'\s+')).length > 8) return false;
    final kinds = [
      for (final c in _classes)
        if (c.hasMatch(rt)) c
    ];
    if (kinds.isEmpty) return false;
    var residual = _content(rt);
    for (final c in kinds) {
      for (final m in c.allMatches(rt)) {
        for (final w
            in RegExp(r"[A-Za-z0-9']+").allMatches(m.group(0)!.toLowerCase())) {
          residual.remove(w.group(0));
        }
      }
    }
    if (residual.isNotEmpty) return false;
    final prev = out.last;
    if (!kinds.every((c) => c.hasMatch(prev))) return false;
    final one = [prev];
    if (!_replaceClassesBack(one, rt)) return false;
    out[out.length - 1] = one.first;
    return true;
  }

  static String _cap(String s) =>
      s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  static String _noTerm(String s) =>
      s.replaceAll(RegExp(r'[.!?]+$'), '').trim();

  // ---- applying a correction to what was said before it
  /// True when [r] was folded into the earlier sentences in [out] (so [r] itself is dropped).
  static bool _apply(List<String> out, String r, {required bool strong}) {
    final rt = _noTerm(r);
    if (rt.isEmpty) return true;
    final n = rt.split(RegExp(r'\s+')).length;
    final term = _term(out.last);
    final p = _noTerm(out.last);

    // 1. "it is not A, it is B" / "not A but B": replace A by B
    final neg = RegExp(
            r"^(?:(?:it|that|this)(?:'s| is| was)\s+)?not\s+(.+?)\s*,\s*(?:but\s+)?(?:(?:it|that|this)(?:'s| is| was)\s+)?(.+)$|^(?:(?:it|that|this)(?:'s| is| was)\s+)?not\s+(.+?)\s+but\s+(.+)$",
            caseSensitive: false)
        .firstMatch(rt);
    if (neg != null) {
      final a = (neg.group(1) ?? neg.group(3))!.trim();
      final b = (neg.group(2) ?? neg.group(4))!.trim();
      for (final k in _back(out)) {
        final x = _replaceSpan(_noTerm(out[k]), a, b);
        if (x != null) {
          out[k] = x + _term(out[k]);
          return true;
        }
      }
    }

    // 2. the correction names a new day / time / date / amount / percent / quantity
    if (_hasClass(rt) && _classCorrection(rt, n, strong)) {
      if (_replaceClassesBack(out, rt)) return true;
    }

    // 3. an explicit retraction followed by a name or place ("No, sorry, Priya.")
    if (strong && n <= 4) {
      for (final k in _back(out)) {
        final x = _replaceCapitalised(_noTerm(out[k]), rt);
        if (x != null) {
          out[k] = x + _term(out[k]);
          return true;
        }
      }
    }

    // 4. the whole sentence said again with a change
    if (n >= 4) {
      final b = _content(rt);
      for (final k in _back(out)) {
        final a = _content(_noTerm(out[k]));
        if (a.isEmpty || b.isEmpty) continue;
        final common = a.intersection(b).length;
        if (common / (a.length < b.length ? a.length : b.length) >= 0.5) {
          out[k] = _cap(rt) + _term(out[k]);
          return true;
        }
      }
    }

    // 5. an explicit retraction followed by a few plain words replaces the last few words
    if (strong && n <= 3) {
      final pw = p.split(RegExp(r'\s+'));
      if (pw.length > n + 2) {
        out[out.length - 1] =
            '${pw.sublist(0, pw.length - n).join(' ')} $rt$term';
        return true;
      }
    }
    return false;
  }

  static String _term(String s) =>
      RegExp(r'[.!?]$').firstMatch(s)?.group(0) ?? '.';

  /// Indexes of the last four sentences, nearest first.
  static Iterable<int> _back(List<String> out) sync* {
    for (var k = out.length - 1; k >= 0 && k >= out.length - 4; k--) {
      yield k;
    }
  }

  static bool _hasClass(String s) => _classes.any((c) => c.hasMatch(s));

  /// Strong retractions may carry a longer correction; "actually"/"I mean" only a short one that
  /// is little more than the new value (otherwise it is probably new information).
  static bool _classCorrection(String rt, int n, bool strong) {
    if (strong) return n <= 14;
    var residual = _content(rt);
    for (final c in _classes) {
      for (final m in c.allMatches(rt)) {
        for (final w
            in RegExp(r"[A-Za-z0-9']+").allMatches(m.group(0)!.toLowerCase())) {
          residual.remove(w.group(0));
        }
      }
    }
    return (n <= 8 && residual.length <= 2) ||
        (n <= 16 && _changeWords.hasMatch(rt));
  }

  /// Puts each day/time/date/amount named in [r] in place of the nearest earlier one of the same
  /// kind (looking back up to four sentences). Works even when the old value was misheard.
  static bool _replaceClassesBack(List<String> out, String r) {
    var changed = false;
    for (final c in _classes) {
      final rm = c.firstMatch(r);
      if (rm == null) continue;
      for (var k = out.length - 1; k >= 0 && k >= out.length - 4; k--) {
        final pms = c.allMatches(out[k]).toList();
        if (pms.isEmpty) continue;
        final pm = pms.last;
        out[k] = out[k].substring(0, pm.start) +
            rm.group(0)! +
            out[k].substring(pm.end);
        changed = true;
        break;
      }
    }
    return changed;
  }

  /// Same, inside a single piece of text (the left side of an inline correction).
  static String? _replaceClasses(String text, String r) {
    final one = [text];
    return _replaceClassesBack(one, r) ? one.first : null;
  }

  /// "send it to John" + "Priya" -> "send it to Priya"; "Boston office" + "Chicago office" ->
  /// "Chicago office". Replaces the last capitalised word that is not the sentence start.
  static String? _replaceCapitalised(String text, String frag) {
    final fw = frag.split(RegExp(r'\s+'));
    if (fw.isEmpty || !RegExp(r'^[A-Z]').hasMatch(fw.first)) return null;
    final words = text.split(RegExp(r'\s+'));
    var idx = -1;
    for (var i = words.length - 1; i >= 1; i--) {
      final w = words[i].replaceAll(RegExp(r'[^A-Za-z]'), '');
      if (w.isNotEmpty &&
          RegExp(r'^[A-Z][a-z]+$').hasMatch(w) &&
          !_isDayOrMonth(w)) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return null;
    final tail = fw.sublist(1);
    final after = words.sublist(idx + 1);
    final tailMatches = tail.isEmpty ||
        (after.length >= tail.length &&
            [for (var i = 0; i < tail.length; i++) after[i].toLowerCase()]
                    .join(' ') ==
                tail.map((e) => e.toLowerCase()).join(' '));
    final end = tailMatches ? idx + 1 : idx + 1 + tail.length;
    if (end > words.length) return null;
    return [
      ...words.sublist(0, idx),
      ...fw,
      ...words.sublist(tailMatches ? idx + 1 + tail.length : end)
    ].join(' ');
  }

  static bool _isDayOrMonth(String w) => RegExp(
          r'^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|January|February|March|April|May|June|July|August|September|October|November|December|I)$')
      .hasMatch(w);

  // ---- "X, no sorry, Y" / "X, I mean Y" inside one sentence
  static String _inlineFix(String s) {
    final m = _inline.firstMatch(s) ?? _inlineActually.firstMatch(s);
    if (m == null) return s;
    final left = s.substring(0, m.start);
    var right = s.substring(m.end);
    final term = RegExp(r'[.!?]$').firstMatch(right)?.group(0) ?? '';
    right = _noTerm(right);
    if (right.isEmpty || left.isEmpty) return s;
    final rw = right.split(RegExp(r'\s+'));
    final byClass = _hasClass(right) ? _replaceClasses(left, right) : null;
    if (byClass != null) return byClass + term;
    final byName = _replaceCapitalised(left, right);
    if (byName != null && rw.length <= 3) return byName + term;
    // A restart: "meet at the, no wait, at the coffee place" - the speaker backs up and says the
    // lead-in again, so the first copy of it (and the marker) goes.
    final restart = _restart(left, rw);
    if (restart != null) {
      return '$restart ${right.trimLeft()}$term'.trim();
    }
    if (rw.length <= 3) {
      final lw = left.split(RegExp(r'\s+'));
      if (lw.length > rw.length + 1) {
        return '${lw.sublist(0, lw.length - rw.length).join(' ')} $right$term';
      }
    }
    return s;
  }

  /// If the right side begins with the last 1-3 words of [left], returns [left] without them.
  /// Needs at least two words of real lead-in left over and one new word on the right.
  static String? _restart(String left, List<String> rw) {
    String norm(String w) =>
        w.toLowerCase().replaceAll(RegExp(r"[^a-z0-9']"), '');
    final lw = left.trim().split(RegExp(r'\s+'));
    for (var k = 3; k >= 1; k--) {
      if (lw.length < k + 1 || rw.length <= k) continue;
      var same = true;
      for (var i = 0; i < k; i++) {
        if (norm(lw[lw.length - k + i]) != norm(rw[i])) {
          same = false;
          break;
        }
      }
      if (same) return lw.sublist(0, lw.length - k).join(' ');
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
}
