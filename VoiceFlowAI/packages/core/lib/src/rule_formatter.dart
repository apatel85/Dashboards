import 'app_defaults.dart';
import 'clock_time.dart';
import 'context_fixes.dart';
import 'lang.dart';
import 'number_words.dart';
import 'profile.dart';
import 'segmenter.dart';
import 'self_correction.dart';

/// Deterministic formatter (spec §5.3). Must be good without any LLM.
class RuleFormatter {
  final LangData lang;
  final NumberWords _nums;
  late final Segmenter _segmenter = Segmenter(lang);
  final DateTime Function() _clock;
  RuleFormatter(this.lang, {DateTime Function()? clock})
      : _nums = NumberWords(lang),
        _clock = clock ?? DateTime.now;

  static final _tokRe = RegExp(
      r"\d{1,2}:\d{2}|\d+(?:st|nd|rd|th)\b|\d+(?:\.\d+)?|[A-Za-z]+(?:['’][A-Za-z]+)*|[.,?!;:]|\n|[^\sA-Za-z0-9.,?!;:]");
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

  String format(String input, Profile p,
      {bool shorthandHundreds = false,
      PromptStyle promptStyle = const PromptStyle()}) {
    input = ContextFixes.apply(input); // "tax messages" -> "text messages"
    input = SelfCorrection.apply(input); // keeps only the corrected version
    input = _dropBareGreeting(input, p.register);
    input = _dropLeadingSo(input, p.register);
    input = ClockTime.apply(input, now: _clock());
    final out = _format(input, p, shorthandHundreds, p.register, promptStyle);
    // "thanks" alone, or a prompt that was only pleasantries: keep the plain text, not nothing.
    if (out.trim().isEmpty && p.register != 'business') {
      return _format(input, p, shorthandHundreds, 'business', promptStyle);
    }
    return out;
  }

  static final _leadingSo = RegExp(
      r'(^|[.?!]\s+|\n\s*)(?:(?:alright|all right|okay|ok|right|well|anyway)[,.]?\s+)?so,?\s+(?:(?:yeah|yep|yup),?\s+)?(?!(?:far|many|much|long|good|great|bad|big|little|called|that|as)\b)([A-Za-z])',
      caseSensitive: false);

  /// "So this is what we are going to do." -> "This is what we are going to do." The filler "So" at
  /// the start of a sentence is speech rhythm, not content, so Business and Professional drop it.
  /// ("So far", "So many", "So that" are real words and stay.)
  String _dropLeadingSo(String input, String register) {
    if (register != 'business' && register != 'professional') return input;
    return input.replaceAllMapped(
        _leadingSo, (m) => '${m.group(1)}${m.group(2)!.toUpperCase()}');
  }

  static final _bareGreeting = RegExp(
      r'^\s*(?:hi|hey|hello|hiya|yo|good (?:morning|afternoon|evening))(?:\s+(?:there|claude|chatgpt|gpt|gemini|copilot|assistant|ai|bot))?\s*[,.!]\s+',
      caseSensitive: false);

  /// An opening "Hi," / "Hello," with nobody named is usually just how the speaker starts talking,
  /// not part of the message, so Business, Professional and AI Prompting do not keep it. A greeting
  /// that names someone ("Hi John,") stays. Casual keeps what was said. Short messages stay as said.
  String _dropBareGreeting(String input, String register) {
    if (register == 'casual') return input;
    final m = _bareGreeting.firstMatch(input);
    if (m == null) return input;
    final rest = input.substring(m.end);
    if (register != 'prompt' && _wc(rest) < 6) return input;
    return _cap1(rest.trimLeft());
  }

  String _format(String input, Profile p, bool shorthandHundreds,
          String register, PromptStyle promptStyle) =>
      _fixArticles(
          _format0(input, p, shorthandHundreds, register, promptStyle));

  static final _article =
      RegExp(r'\b(an?)(\s+)([A-Za-z][A-Za-z]*)', caseSensitive: false);

  /// "a excellent" -> "an excellent", "an dictation" -> "a dictation" (by sound: an hour, a user).
  String _fixArticles(String s) => s.replaceAllMapped(_article, (m) {
        final art = m.group(1)!;
        final should = _vowelSound(m.group(3)!) ? 'an' : 'a';
        if (art.toLowerCase() == should) return m[0]!;
        final fixed = art[0] == art[0].toUpperCase()
            ? (should == 'an' ? 'An' : 'A')
            : should;
        return '$fixed${m.group(2)}${m.group(3)}';
      });

  static bool _vowelSound(String w) {
    if (w.length >= 2 && w == w.toUpperCase()) {
      // spoken as letters: an SQL, an MBA, a UI, a CSS
      return 'AEFHILMNORSX'.contains(w[0]);
    }
    final l = w.toLowerCase();
    for (final p in const ['hour', 'honest', 'honor', 'honour', 'heir']) {
      if (l.startsWith(p)) return true;
    }
    for (final p in const [
      'uni',
      'use',
      'usu',
      'uti',
      'eu',
      'one',
      'once',
      'ubi'
    ]) {
      if (l.startsWith(p)) return false;
    }
    return 'aeiou'.contains(l[0]);
  }

  String _format0(String input, Profile p, bool shorthandHundreds,
      String register, PromptStyle promptStyle) {
    var t = _tokenize(input);
    t = _spokenPunct(t);
    t = _fillers(t, p.fullFillers);
    t = _repeats(t);
    t = _repairApostrophes(
        t); // before segmenting: "its going" -> "it's going" is a subject + verb
    t = _segmenter.apply(t, register: register);
    t = _register(t, register);
    if (p.expandSpokenForms && register == 'casual') {
      t = _swap(t, _reg('spokenForms'));
    }
    t = t.map(_contraction).toList();
    if (p.expandContractions) t = t.map(_expand).toList();
    t = t.map(_fixI).toList();
    var listed = false;
    if (p.lists) {
      final r = _lists(t);
      t = r.$1;
      listed = r.$2;
    }
    if (p.numbersAsDigits) {
      // "a few hundred", "several thousand" are loose amounts, not the numbers 100 / 1000
      const loose = {'few', 'several', 'couple', 'many', 'some', 'of'};
      const big = {
        'hundred',
        'hundreds',
        'thousand',
        'thousands',
        'million',
        'billion'
      };
      for (var i = 1; i < t.length; i++) {
        if (big.contains(t[i].toLowerCase()) &&
            loose.contains(t[i - 1].toLowerCase())) {
          t[i] = '\u0001${t[i]}';
        }
      }
      t = _nums.convert(t, shorthandHundreds: shorthandHundreds);
      t = [for (final w in t) w.replaceAll('\u0001', '')];
      t = _currency(t);
    }
    t = _tidyPunct(t);
    t = _streetNames(t);
    t = _capitalize(t);
    final s = _join(t, listed);
    if (register == 'prompt') {
      // a prompt is one flow of text: pasted line breaks must not stop it being structured
      return _structurePrompt(
          _promptRules(s.replaceAll(
              RegExp(r'[ \t]*\n+(?![ \t]*(?:\d+\.|-)\s)[ \t]*'), ' ')),
          promptStyle);
    }
    if (register == 'business' || register == 'professional') {
      return _paragraphs(s);
    }
    return s;
  }

  /// "20 dollars" / "200 bucks" -> "$20" / "$200" (whole amounts only).
  List<String> _currency(List<String> t) {
    const words = {'dollars', 'dollar', 'bucks', 'buck'};
    final out = <String>[];
    for (var i = 0; i < t.length; i++) {
      if (RegExp(r'^\d[\d,]*$').hasMatch(t[i]) &&
          i + 1 < t.length &&
          words.contains(t[i + 1].toLowerCase())) {
        out.add('\$${t[i]}');
        i++;
        continue;
      }
      out.add(t[i]);
    }
    return out;
  }

  // ---- register (tone): what makes Casual, Business, Professional and AI Prompting differ
  static const _sentenceEnd = {'.', '?', '!', '\n'};

  Map<String, String> _reg(String k) => Map<String, String>.from(
      (lang.register[k] as Map?) ?? const <String, String>{});

  List<String> _register(List<String> t, String register) {
    if (lang.register.isEmpty || register == 'casual') return t;
    switch (register) {
      case 'business':
        t = _swap(t, _reg('slang'));
        t = _swap(t, _reg('businessWords'));
        return _swap(t, _reg('businessStart'), startOnly: true);
      case 'professional':
        t = _swap(t, _reg('slang'));
        t = _swap(t, _reg('professionalStart'), startOnly: true);
        t = _swap(t, _reg('businessWords'));
        t = _swap(t, _reg('professionalWords'));
        final drop = List<String>.from(
                lang.register['professionalDrop'] as List? ?? const [])
            .toSet();
        t = [
          for (final w in t)
            if (!drop.contains(w.toLowerCase())) w
        ];
        return [for (final w in t) w == '!' ? '.' : w];
      case 'prompt':
        t = _swap(t, _reg('promptPhrases'));
        t = _swap(t, _reg('promptStartPhrases'), startOnly: true);
        return _dropRequestModals(t);
    }
    return t;
  }

  /// "can you look at it" -> "look at it": a request modal before an instruction verb is only
  /// politeness. ("what can you do" is a question and is left alone: "do" is not in the list.)
  List<String> _dropRequestModals(List<String> t) {
    final verbs =
        List<String>.from(lang.register['promptVerbs'] as List? ?? const [])
            .toSet();
    const modals = {'can', 'could', 'would', 'will'};
    final out = <String>[];
    for (var i = 0; i < t.length; i++) {
      if (i + 2 < t.length &&
          modals.contains(t[i].toLowerCase()) &&
          t[i + 1].toLowerCase() == 'you' &&
          verbs.contains(t[i + 2].toLowerCase())) {
        i += 1; // skip "can" and "you"
        continue;
      }
      out.add(t[i]);
    }
    return out;
  }

  /// Longest-match phrase replacement over lower-cased tokens; "" deletes the phrase.
  List<String> _swap(List<String> t, Map<String, String> map,
      {bool startOnly = false}) {
    if (map.isEmpty) return t;
    final keys = map.keys.map((k) => (k.split(' '), map[k]!)).toList()
      ..sort((a, b) => b.$1.length.compareTo(a.$1.length));
    final out = <String>[];
    var i = 0;
    while (i < t.length) {
      var hit = false;
      final atStart =
          i == 0 || _sentenceEnd.contains(t[i - 1]) || (out.isEmpty);
      if (!startOnly || atStart) {
        for (final (words, rep) in keys) {
          if (i + words.length > t.length) continue;
          var ok = true;
          for (var k = 0; k < words.length; k++) {
            if (t[i + k].toLowerCase() != words[k]) {
              ok = false;
              break;
            }
          }
          if (!ok) continue;
          if (rep.isNotEmpty) out.addAll(rep.split(' '));
          i += words.length;
          hit = true;
          break;
        }
      }
      if (!hit) out.add(t[i++]);
    }
    return out;
  }

  /// Output-format and length phrases become compact (tokens cost money, and output costs more
  /// than input). Then the text is tidied: spacing, doubled punctuation, sentence capitals.
  String _promptRules(String s) {
    // "three sentences" -> "3 sentences" (only before a counted noun: "one of them" stays)
    final nouns =
        List<String>.from(lang.register['countNouns'] as List? ?? const []);
    if (nouns.isNotEmpty) {
      const digits = {
        'one': '1',
        'two': '2',
        'three': '3',
        'four': '4',
        'five': '5',
        'six': '6',
        'seven': '7',
        'eight': '8',
        'nine': '9'
      };
      s = s.replaceAllMapped(
          RegExp(
              '\\b(one|two|three|four|five|six|seven|eight|nine)(?= (?:${nouns.join('|')})\\b)',
              caseSensitive: false),
          (m) => digits[m.group(1)!.toLowerCase()]!);
    }
    final rules = (lang.register['promptRules'] as List?) ?? const [];
    for (final r in rules) {
      final re = RegExp(r['pattern'] as String, caseSensitive: false);
      final rep = r['replace'] as String;
      final directive = r['directive'] == true;
      s = s.replaceAllMapped(re, (m) {
        final text = rep.replaceAllMapped(RegExp(r'\$(\d)'), (g) {
          final i = int.parse(g.group(1)!);
          return i <= m.groupCount ? (m.group(i) ?? '') : '';
        });
        // A directive stands as its own short sentence ("No explanation.").
        return directive ? '. $text. ' : text;
      });
    }
    s = s
        .replaceAll(RegExp(r'[ \t]{2,}'), ' ')
        .replaceAllMapped(RegExp(r'\s+([.,?!;:])'), (m) => m.group(1)!)
        .replaceAllMapped(RegExp(r'([.?!])(\s*[.?!])+'), (m) => m.group(1)!)
        .replaceAllMapped(
            RegExp(r'([.?!])\s+(?:and|but|then|also)\s+', caseSensitive: false),
            (m) => '${m.group(1)} ')
        .replaceAll(RegExp(r'^[\s.,;:]+'), '')
        .replaceAll(RegExp(r',\s*\.'), '.')
        .trim();
    // capital at sentence starts, but not after abbreviations like "e.g." / "i.e." / "etc."
    final b = StringBuffer();
    var cap = true;
    final words = s.split(RegExp(r'(?<=\s)'));
    for (final w in words) {
      var x = w;
      if (cap && x.isNotEmpty) {
        final m = RegExp(r'^[a-z]').firstMatch(x);
        if (m != null) x = x[0].toUpperCase() + x.substring(1);
      }
      b.write(x);
      final tw = w.trim().toLowerCase();
      cap = RegExp(r'[.?!]$').hasMatch(tw) &&
          !RegExp(r'^(e\.g\.|i\.e\.|etc\.|vs\.)$').hasMatch(tw);
    }
    return b.toString().trim();
  }

  // ---- shared: sentence splitting that does not break on "e.g." / "Mr." / "No."
  static final _abbrev = RegExp(
      r'(?:^|\s)(?:e\.g|i\.e|etc|vs|mr|mrs|ms|dr|inc|no|approx|st)\.$',
      caseSensitive: false);

  List<String> _sentences(String s) {
    final raw = s.trim().split(RegExp(r'(?<=[.?!])\s+'));
    final out = <String>[];
    for (final x in raw) {
      if (x.isEmpty) continue;
      if (out.isNotEmpty && _abbrev.hasMatch(out.last)) {
        out[out.length - 1] = '${out.last} $x';
      } else {
        out.add(x);
      }
    }
    return out;
  }

  int _wc(String s) =>
      s.split(RegExp(r'\s+')).where((w) => w.isNotEmpty).length;

  String _cap1(String s) => s.isEmpty ? s : s[0].toUpperCase() + s.substring(1);

  // ---- business / professional: paragraphs so a longer dictation reads as sections
  static final _transition = RegExp(
      r'^(?:Additionally|However|Furthermore|Moreover|Next|Finally|Lastly|First|Second|Third|Separately|Regarding|In addition|Meanwhile|Otherwise|As for|On another note|In any case|Also|Another|And|But|Goal|The goal|Our goal|One of the|The key|The main)\b');
  static final _closing = RegExp(
      r'^(?:Thank you|Thanks|Best regards|Kind regards|Regards|Sincerely|Looking forward|Talk soon|Speak soon|Please let me know|Let me know)\b');

  /// Four or more sentences become short paragraphs: a named greeting on its own line, a new
  /// paragraph at a transition ("However", "Goal is...") or after about four sentences, the closing
  /// last. Paragraph breaks the speaker made ("new paragraph") are kept and each part is tidied on
  /// its own; single line breaks (bullets, "new line") leave the text alone.
  String _paragraphs(String s) {
    final text = s.trim();
    if (RegExp(r'[^\n]\n(?!\n)|(?<!\n)\n[^\n]').hasMatch(text)) return s;
    final blocks = text.split(RegExp(r'\n{2,}'));
    if (blocks.length == 1) return _groupBlock(text, edges: true);
    return [
      for (var i = 0; i < blocks.length; i++)
        _groupBlock(blocks[i],
            edges: false, first: i == 0, last: i == blocks.length - 1)
    ].join('\n\n');
  }

  String _groupBlock(String text,
      {required bool edges, bool first = true, bool last = true}) {
    final sents = _sentences(text);
    // 4+ sentences, or 3 when the third opens a new point ("Goal is...", "And one of...")
    if (sents.length < 3 ||
        (sents.length == 3 && !_transition.hasMatch(sents[2]))) {
      return text;
    }
    var greeting = '';
    if (edges || first) {
      final g = RegExp(
              r"^((?:Hi|Hello|Dear|Hey)\s+[A-Z][\w.'-]*(?:\s+[A-Z][\w.'-]*)?,)\s+(.+)$")
          .firstMatch(sents.first);
      if (g != null) {
        greeting = g.group(1)!;
        sents[0] = _cap1(g.group(2)!);
      }
    }
    final closing = <String>[];
    if (edges || last) {
      while (sents.length > 2 && _closing.hasMatch(sents.last)) {
        closing.insert(0, sents.removeLast());
      }
    }
    final paras = <List<String>>[];
    var cur = <String>[];
    var words = 0;
    void flush() {
      if (cur.isNotEmpty) paras.add(cur);
      cur = [];
      words = 0;
    }

    for (final x in sents) {
      if (cur.isNotEmpty &&
          ((_transition.hasMatch(x) && cur.length >= 2) ||
              cur.length >= 4 ||
              words >= 70)) {
        flush();
      }
      cur.add(x);
      words += _wc(x);
    }
    flush();
    // never leave a lone sentence at the end if it can join the paragraph before it
    if (paras.length >= 2 &&
        paras.last.length == 1 &&
        !_transition.hasMatch(paras.last.first) &&
        paras[paras.length - 2].length < 4) {
      paras[paras.length - 2].addAll(paras.removeLast());
    }
    return [
      if (greeting.isNotEmpty) greeting,
      ...paras.map((p) => p.join(' ')),
      if (closing.isNotEmpty) closing.join(' '),
    ].join('\n\n');
  }

  // ---- AI prompting: lay a longer dictation out as labelled parts a model can use directly
  static final _outputSpec = RegExp(
      r'^(?:max|under|at most|at least|exactly|about)\s+\d|^output\b|^no explanation|^(?:code|json|yaml|csv|markdown|xml|html)\s+only|^be (?:concise|brief)|^\d+\s+(?:bullets|sentences|words|lines|paragraphs|examples|items|steps|options|characters)\b|\b(?:in|as)\s+(?:a\s+)?(?:table|list|bullets?|bullet points|json|markdown|csv|steps?)\b|\b(?:tone|format|style)\b',
      caseSensitive: false);

  static final _buildWords = RegExp(
      r'\b(?:app|application|feature|bugs?|errors?|crash\w*|fix|refactor\w*|implement\w*|migrat\w+|deploy\w*|debug\w*|integrat\w+|api|database|function|script|endpoint|component|module|pipeline|workflow|dashboard|website|code|codebase|repo|repository|build|redesign\w*|architecture|logic)\b',
      caseSensitive: false);

  /// Role / Goal / Context / Task / Include / Avoid / Output. Short, single-purpose prompts stay one
  /// plain line (labels cost tokens); labels appear when the dictation has several parts.
  String _structurePrompt(String s, PromptStyle style) {
    if (s.contains('\n')) return s;
    final sents = <String>[];
    for (final x in _sentences(s)) {
      // "include X, and do not use Y" is two instructions
      sents.addAll(x
          .split(RegExp(
              r",?\s+and\s+(?=(?:do not|don't|never|avoid|include|make sure|ensure|keep)\b)",
              caseSensitive: false))
          .map((y) => _cap1(y.trim()))
          .map((y) => RegExp(r'[.?!]$').hasMatch(y) ? y : '$y.'));
    }
    if (sents.isEmpty) return s;
    final verbs =
        List<String>.from(lang.register['promptVerbs'] as List? ?? const [])
            .toSet();
    final role = <String>[], goal = <String>[], ctx = <String>[];
    final task = <String>[],
        inc = <String>[],
        avoid = <String>[],
        out = <String>[];
    String bare(String x) => x.replaceAll(RegExp(r'[.]+$'), '').trim();
    for (var x in sents) {
      final low = x.toLowerCase();
      RegExp r;
      RegExpMatch? m;
      if (low.startsWith('goal:')) {
        goal.add(bare(x.substring(5).trim()));
        continue;
      }
      m = RegExp(r'^act as (?:an? )?(.+)$', caseSensitive: false).firstMatch(x);
      if (m != null) {
        final body = bare(m.group(1)!);
        final cut = RegExp(r'\s+and\s+(\w+)\s', caseSensitive: false)
            .allMatches('$body ')
            .where((c) => verbs.contains(c.group(1)!.toLowerCase()))
            .toList();
        if (cut.isNotEmpty) {
          role.add(body.substring(0, cut.first.start));
          final rest = body
              .substring(cut.first.start)
              .replaceFirst(RegExp(r'^\s+and\s+', caseSensitive: false), '');
          task.add('${_cap1(rest)}.');
        } else {
          role.add(body);
        }
        continue;
      }
      if (_outputSpec.hasMatch(x) && _wc(x) <= 12) {
        out.add(x);
        continue;
      }
      r = RegExp(
          r"^(?:do not|don't|never|avoid)\s+(?:use|include|add|mention|say|put|show)?\s*(.+)$",
          caseSensitive: false);
      m = r.firstMatch(x) ??
          RegExp(r'^(?:without|no)\s+(.+)$', caseSensitive: false)
              .firstMatch(x);
      if (m != null) {
        avoid.add(bare(m.group(1)!));
        continue;
      }
      m = RegExp(
              r'^(?:(?:include|cover|mention)\s+(.+)|(?:make sure|ensure)(?: that)?(?: it| you| the \w+)?\s+(?:includes?|covers?|mentions?|contains?|has|have)\s+(.+)|(?:it|this|you|the \w+)\s+(?:should|must)\s+(?:include|cover|mention|contain|have)\s+(.+))$',
              caseSensitive: false)
          .firstMatch(x);
      if (m != null) {
        inc.add(bare(m.group(1) ?? m.group(2) ?? m.group(3)!));
        continue;
      }
      final first =
          RegExp(r'^[A-Za-z]+').firstMatch(x)?.group(0)?.toLowerCase();
      if (x.trimRight().endsWith('?') ||
          (first != null && verbs.contains(first))) {
        task.add(x);
      } else {
        ctx.add(x);
      }
    }
    // Open-ended request with no spoken length: start concise, offer to expand (a design choice,
    // switchable in Settings; a length the speaker gave is always kept as said).
    String? hint;
    if (style.conciseFirst) {
      final spoken = out.any((o) =>
          RegExp(r'\d').hasMatch(o) ||
          o.toLowerCase().startsWith('be concise'));
      final open = List<String>.from(
              lang.register['openEndedVerbs'] as List? ?? const [])
          .toSet();
      final t0 = task.isEmpty ? '' : task.first;
      final v0 = RegExp(r'^[A-Za-z]+').firstMatch(t0)?.group(0)?.toLowerCase();
      final isOpen = (v0 != null && open.contains(v0)) ||
          (t0.endsWith('?') &&
              _wc(t0) >= 6 &&
              RegExp(r'^(?:what|why|how|which|should|explain)\b',
                      caseSensitive: false)
                  .hasMatch(t0));
      if (!spoken && isOpen) {
        hint = 'Start concise (about 200 words); offer more detail if needed.';
      }
    }
    final parts = (role.isNotEmpty ? 1 : 0) +
        (goal.isNotEmpty ? 1 : 0) +
        (ctx.isNotEmpty ? 1 : 0) +
        (task.isNotEmpty ? 1 : 0) +
        (inc.isNotEmpty ? 1 : 0) +
        (avoid.isNotEmpty ? 1 : 0) +
        (out.isNotEmpty ? 1 : 0);
    final words = _wc(s);
    // Static route choice: a plain short line for a general question, labelled parts for a real
    // brief. Points: length, several asks, build/bug vocabulary, explicit constraints, a role.
    var score = 0;
    if (words >= 80) {
      score += 2;
    } else if (words >= 35) {
      score += 1;
    }
    if (task.length >= 2) score += 1;
    if (_buildWords.hasMatch(s)) score += 2;
    final constraints = inc.length + avoid.length + out.length;
    score += constraints > 2 ? 2 : constraints;
    if (role.isNotEmpty) score += 1;
    // a very short prompt stays one line however technical it sounds (labels cost tokens)
    final tooShort = words < 20 && parts < 4;
    if ((task.isEmpty && goal.isEmpty) || parts < 2 || score < 3 || tooShort) {
      return hint == null ? s : '$s $hint';
    }
    if (hint != null) out.add(hint);
    // Task first (instructions lead), background after it, format and limits last as a recap.
    final sections = <(String, String, String)>[
      if (role.isNotEmpty) ('role', 'Role', role.join('; ')),
      if (task.isNotEmpty) ('task', 'Task', task.join(' ')),
      if (goal.isNotEmpty) ('goal', 'Goal', '${goal.join('; ')}.'),
      if (ctx.isNotEmpty) ('context', 'Context', ctx.join(' ')),
      if (inc.isNotEmpty) ('include', 'Include', inc.join('; ')),
      if (avoid.isNotEmpty) ('avoid', 'Avoid', avoid.join('; ')),
      if (out.isNotEmpty) ('output', 'Output', out.join(' ')),
    ];
    return switch (style.format) {
      'xml' => sections.map((e) => '<${e.$1}>${e.$3}</${e.$1}>').join('\n'),
      'markdown' => sections.map((e) => '### ${e.$2}\n${e.$3}').join('\n\n'),
      _ => sections.map((e) => '${e.$2}: ${e.$3}').join('\n'),
    };
  }

  static const _tensWords = {
    'twenty',
    'thirty',
    'forty',
    'fifty',
    'sixty',
    'seventy',
    'eighty',
    'ninety'
  };
  static const _unitWords = {
    'one',
    'two',
    'three',
    'four',
    'five',
    'six',
    'seven',
    'eight',
    'nine'
  };
  static final _alpha = RegExp(r"^[A-Za-z]+(?:['\u2019][A-Za-z]+)*$");

  /// Words and punctuation. A hyphen between two words ("per-app", "well-known") stays inside the
  /// word; "twenty-five" becomes "twenty five" so the number conversion reads it.
  List<String> _tokenize(String s) {
    final raw = _tokRe
        .allMatches(s.replaceAll('\r', ''))
        .map((m) => m.group(0)!)
        .toList();
    final out = <String>[];
    for (var i = 0; i < raw.length; i++) {
      final between = raw[i] == '-' &&
          out.isNotEmpty &&
          i + 1 < raw.length &&
          _alpha.hasMatch(out.last) &&
          _alpha.hasMatch(raw[i + 1]);
      if (between) {
        if (_tensWords.contains(out.last.toLowerCase()) &&
            _unitWords.contains(raw[i + 1].toLowerCase())) {
          continue; // "twenty-five" -> "twenty five" (the number conversion reads it)
        }
        out[out.length - 1] = '${out.last}-${raw[i + 1]}';
        i++;
      } else {
        out.add(raw[i]);
      }
    }
    return out;
  }

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
        // "just so you know" is a phrase, not a filler "you know"
        if (m.join(' ') == 'you know' &&
            out.isNotEmpty &&
            out.last.toLowerCase() == 'so') {
          continue;
        }
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

  Map<String, dynamic> get _apos =>
      Map<String, dynamic>.from((lang.raw['apostrophe'] as Map?) ?? const {});
  Set<String> _aposSet(String k) =>
      List<String>.from(_apos[k] as List? ?? const []).toSet();

  /// Speech models often drop apostrophes. Most are fixed by the contractions table; this adds the
  /// ones that need the next word to decide: "its gonna be" -> "it's", "id like" -> "I'd".
  /// ("its" before a noun stays "its"; "were" and "well" are real words and are never touched.)
  List<String> _repairApostrophes(List<String> t) {
    final itsBefore = _aposSet('itsBefore');
    final idBefore = _aposSet('idBefore');
    final idNotAfter = _aposSet('idNotAfter');
    final out = [...t];
    for (var i = 0; i < out.length; i++) {
      final w = out[i];
      if (w != w.toLowerCase()) continue;
      final next = i + 1 < out.length ? out[i + 1].toLowerCase() : '';
      if (w == 'its' && next.isNotEmpty) {
        // an -ing word after "its" is a verb ("its going"), but a few nouns end in -ing too
        final ing = next.length > 4 &&
            next.endsWith('ing') &&
            !const {
              'building',
              'ceiling',
              'training',
              'meeting',
              'pricing',
              'funding',
              'branding'
            }.contains(next);
        if (itsBefore.contains(next) || ing) out[i] = "it's";
      } else if (w == 'id' && idBefore.contains(next)) {
        final prev = i > 0 ? out[i - 1].toLowerCase() : '';
        if (!idNotAfter.contains(prev)) out[i] = "I'd";
      }
    }
    return out;
  }

  /// "main street" -> "Main Street" (after a preposition-free lead word).
  List<String> _streetNames(List<String> t) {
    final suffix = _aposSet('streetSuffix');
    final notAfter = _aposSet('streetNotAfter');
    final out = [...t];
    for (var i = 1; i < out.length; i++) {
      final w = out[i];
      if (!suffix.contains(w.toLowerCase()) || w != w.toLowerCase()) continue;
      final prev = out[i - 1];
      if (!RegExp(r'^[a-z]+$').hasMatch(prev) || notAfter.contains(prev)) {
        continue;
      }
      // needs a preposition one word earlier: "on main street", "at oak avenue"
      if (i < 2 ||
          !const {
            'on',
            'at',
            'to',
            'from',
            'near',
            'down',
            'along',
            'off',
            'of'
          }.contains(out[i - 2].toLowerCase())) {
        continue;
      }
      out[i - 1] = prev[0].toUpperCase() + prev.substring(1);
      out[i] = w[0].toUpperCase() + w.substring(1);
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
      final tech = (lang.register['techTerms'] as Map?)?[lw];
      if (w == lw && tech != null) x = tech as String;
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
    // List numbering only: a decimal at the start of a line ("2.5 mg") must stay intact.
    if (listed) {
      s = s.replaceAllMapped(
          RegExp(r'^(\d+\.)(\S)', multiLine: true), (m) => '${m[1]} ${m[2]}');
    }
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
