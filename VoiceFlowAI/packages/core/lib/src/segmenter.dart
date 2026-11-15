import 'lang.dart';

/// Sentence breaks for unpunctuated speech (spec section 1A, change 1).
///
/// Speech models often return a long run of words with no full stops. This inserts breaks only
/// where the words before already form a complete clause, and does nothing when unsure:
///  * a comma after a greeting and the name ("hey john,"); a bare greeting is dropped in the
///    business tones, which do not want a "Hi" the speaker did not address to anyone;
///  * a break before and after a closer ("thanks a lot", "talk soon");
///  * a break before a discourse marker that starts a new point ("also", "by the way");
///  * a break before a subject and its verb ("we can't", "it's going", "I need").
/// All word lists live in `lang/en.json` under `segmentation`.
class Segmenter {
  final LangData lang;
  Segmenter(this.lang);

  Map<String, dynamic>? get _d =>
      lang.raw['segmentation'] as Map<String, dynamic>?;
  Set<String> _set(String k) =>
      List<String>.from(_d?[k] as List? ?? const []).toSet();
  List<List<String>> _phrases(String k) {
    final p = [
      for (final s in List<String>.from(_d?[k] as List? ?? const []))
        s.split(' ')
    ]..sort((a, b) => b.length.compareTo(a.length));
    return p;
  }

  late final Set<String> _addressees = _set('addressees');
  late final Set<String> _adjuncts = _set('adjunctLeads');
  late final Set<String> _longBreakers = _set('longBreakers');
  late final Set<String> _longStarts = _set('longSubjectStarts');
  late final int _longClause = (_d?['longClause'] as int?) ?? 14;
  late final Set<String> _subjects = _set('subjects');
  late final Set<String> _contracted = _set('contractedSubjects');
  late final Set<String> _verbs = _set('verbs');
  late final Set<String> _continuers = _set('continuers');
  late final Set<String> _subordinators = _set('subordinators');
  late final Set<String> _exclaim = _set('exclaimWords');
  late final Set<String> _qAux = _set('questionAux');
  late final Set<String> _qWh = _set('questionWh');
  late final Set<String> _qSubj = _set('questionSubjects');
  late final List<List<String>> _greetings = _phrases('greetings');
  late final List<List<String>> _closers = _phrases('closers');
  late final List<List<String>> _markers = _phrases('markers');
  late final List<List<String>> _tails = _phrases('tailParentheticals');

  static const _terminal = {'.', '?', '!', '\n'};
  static const _punct = {'.', '?', '!', ',', ';', ':'};
  static const _keepSo = {
    'far',
    'many',
    'much',
    'long',
    'good',
    'great',
    'bad',
    'big',
    'little',
    'called',
    'that',
    'as',
  };
  static final _word = RegExp(r"^[A-Za-z][A-Za-z']*$");

  bool _isWord(String w) => _word.hasMatch(w);

  bool _matches(List<String> t, int i, List<String> phrase) {
    if (i + phrase.length > t.length) return false;
    for (var k = 0; k < phrase.length; k++) {
      if (t[i + k].toLowerCase() != phrase[k]) return false;
    }
    return true;
  }

  List<String>? _phraseAt(List<String> t, int i, List<List<String>> set) {
    for (final p in set) {
      if (_matches(t, i, p)) return p;
    }
    return null;
  }

  /// Does token [i] begin a subject followed by its verb ("we can't", "it's going", "I need")?
  bool _subjectVerb(List<String> t, int i) {
    final w = t[i].toLowerCase();
    if (_contracted.contains(w)) return true;
    if (!_subjects.contains(w) || i + 1 >= t.length) return false;
    return _verbs.contains(t[i + 1].toLowerCase());
  }

  bool _isQuestionClause(List<String> words) {
    final w = [for (final x in words) x.toLowerCase()]
        .where((x) => _isWord(x))
        .toList();
    while (w.isNotEmpty &&
        const {'and', 'but', 'so', 'well', 'okay', 'ok', 'also', 'then', 'oh'}
            .contains(w.first)) {
      w.removeAt(0);
    }
    if (w.length < 2) return false;
    if (_qAux.contains(w[0]) && _qSubj.contains(w[1])) return true;
    return _qWh.contains(w[0]) && _qAux.contains(w[1]);
  }

  /// An introductory time phrase ("starting Monday ...") in the last few words: the subject that
  /// follows belongs to the same sentence.
  bool _recentAdjunct(List<String> out, int clauseStart) {
    var seen = 0;
    for (var k = out.length - 1; k >= clauseStart && k >= 0 && seen < 4; k--) {
      if (!_isWord(out[k])) continue;
      if (_adjuncts.contains(out[k].toLowerCase())) return true;
      seen++;
    }
    return false;
  }

  List<String> apply(List<String> t, {required String register}) {
    if (_d == null || t.isEmpty) return t;
    final business = register == 'business' || register == 'professional';
    // Prompt mode deletes greetings too (spec section 4, "steps that differ by mode")
    final dropsGreeting = business || register == 'prompt';
    final casual = register == 'casual';
    final out = <String>[];
    var clauseStart = 0;
    var clauseWords = 0;
    var subordinate = false;
    var runWords =
        0; // words since ANY punctuation: breaks only happen in unpunctuated runs
    var sinceComma =
        -1; // words since the last comma in this clause (-1: no comma yet)
    var closerOnly = false; // the clause so far is nothing but sign-off phrases

    void reset() {
      clauseStart = out.length;
      runWords = 0;
      clauseWords = 0;
      subordinate = false;
      sinceComma = -1;
      closerOnly = false;
    }

    String terminator() {
      final clause = out.sublist(clauseStart);
      if (_isQuestionClause(clause)) return '?';
      final last = clause.lastWhere(_isWord, orElse: () => '').toLowerCase();
      if (casual && _exclaim.contains(last)) return '!';
      return '.';
    }

    void breakHere() {
      final tm = register == 'prompt' ? '.' : terminator();
      if (out.isNotEmpty && out.last == ',') {
        out.last = tm;
      } else {
        out.add(tm);
      }
      reset();
    }

    String prevWord() {
      for (var k = out.length - 1; k >= clauseStart && k >= 0; k--) {
        if (_isWord(out[k])) return out[k].toLowerCase();
        if (out[k] != ',') return '';
      }
      return '';
    }

    var i = 0;
    while (i < t.length) {
      final w = t[i];
      final lw = w.toLowerCase();
      if (_terminal.contains(w)) {
        out.add(w);
        reset();
        i++;
        continue;
      }
      if (_punct.contains(w) || !_isWord(w)) {
        out.add(w);
        if (w == ',') sinceComma = 0;
        runWords = 0; // the recogniser already punctuated here: trust it
        i++;
        continue;
      }
      final atStart =
          clauseWords == 0 && (out.isEmpty || _terminal.contains(out.last));

      // greeting at the very start of the text
      if (out.isEmpty) {
        final g = _phraseAt(t, i, _greetings);
        if (g != null) {
          final ni = i + g.length;
          final next = ni < t.length ? t[ni] : '';
          if (next.isNotEmpty && !_punct.contains(next) && _isWord(next)) {
            final named = lang.names.contains(next.toLowerCase()) ||
                _addressees.contains(next.toLowerCase());
            var rest = 0;
            for (var k = ni + (named ? 1 : 0); k < t.length; k++) {
              if (_terminal.contains(t[k])) break;
              if (_isWord(t[k])) rest++;
            }
            if (named) {
              out.addAll(t.sublist(i, ni + 1));
              if (ni + 1 < t.length && !_punct.contains(t[ni + 1])) {
                out.add(',');
              }
              i = ni + 1;
              reset();
              continue;
            }
            if (dropsGreeting && rest >= 6) {
              // nobody is addressed: "hey" is how the speaker started talking, not part of the message
              i = ni;
              if (i < t.length &&
                  t[i].toLowerCase() == 'so' &&
                  i + 1 < t.length &&
                  !_keepSo.contains(t[i + 1].toLowerCase())) {
                i++;
              }
              continue;
            }
            out.addAll(t.sublist(i, ni));
            if (rest >= 3) out.add(',');
            i = ni;
            reset();
            continue;
          }
        }
        // an interjection opening: "oh my god that was ..." -> "Oh my god, that was ..."
        if (casual) {
          for (final ph in const [
            ['oh', 'my', 'god'],
            ['oh', 'my', 'gosh'],
            ['oh', 'wow'],
            ['oh', 'no'],
          ]) {
            if (_matches(t, i, ph) && i + ph.length < t.length) {
              final next = t[i + ph.length];
              if (_isWord(next)) {
                out.addAll(t.sublist(i, i + ph.length));
                out.add(',');
                i += ph.length;
                reset();
                break;
              }
            }
          }
          if (out.isNotEmpty) continue;
        }
      }

      // "so" opening a clause is speech rhythm in the business tones
      if (business &&
          lw == 'so' &&
          (atStart || out.isEmpty) &&
          i + 1 < t.length &&
          _isWord(t[i + 1]) &&
          !_keepSo.contains(t[i + 1].toLowerCase())) {
        i++;
        continue;
      }

      // "I think" / "you know" closing the sentence: a comma before it
      final tail = _phraseAt(t, i, _tails);
      if (tail != null) {
        final after = i + tail.length;
        final atEnd = after >= t.length || _terminal.contains(t[after]);
        if (atEnd &&
            runWords >= 3 &&
            out.isNotEmpty &&
            !_punct.contains(out.last)) {
          out.add(',');
        }
        out.addAll(t.sublist(i, i + tail.length));
        clauseWords += tail.length;
        runWords += tail.length;
        i += tail.length;
        continue;
      }

      final pw = prevWord();
      final canBreak = pw.isNotEmpty ? !_continuers.contains(pw) : false;

      // closers: break before, copy the phrase, break after when a new sentence follows
      final closer = _phraseAt(t, i, _closers);
      if (closer != null) {
        final stay = closerOnly; // "thanks a lot, talk soon" is one sign-off
        if (stay && out.isNotEmpty && !_punct.contains(out.last)) out.add(',');
        if (runWords >= 3 && canBreak && !stay) breakHere();
        final onlyClosers = clauseWords == 0 || stay;
        out.addAll(t.sublist(i, i + closer.length));
        final after = i + closer.length;
        i = after;
        if (after < t.length &&
            _isWord(t[after]) &&
            (_subjectVerb(t, after) || _phraseAt(t, after, _markers) != null)) {
          out.add('.');
          reset();
        } else {
          clauseWords += closer.length;
          runWords += closer.length;
          closerOnly = onlyClosers;
          if (sinceComma >= 0) sinceComma += closer.length;
        }
        continue;
      }

      // A very long clause with no break: a conjunction that opens a new clause ("... and I don't
      // see ...", "... because the size is ...") starts a new sentence.
      if (runWords >= _longClause &&
          _longBreakers.contains(lw) &&
          i + 1 < t.length &&
          (_subjectVerb(t, i + 1) ||
              (_longStarts.contains(t[i + 1].toLowerCase()) &&
                  i + 2 < t.length &&
                  _isWord(t[i + 2]))) &&
          pw.isNotEmpty &&
          !const {'and', 'but', 'or', 'so', 'because', 'if', 'that', 'than'}
              .contains(pw)) {
        breakHere();
      }

      // a discourse marker starting a new point, or a new subject and verb
      final marker = _phraseAt(t, i, _markers);
      if (marker != null && runWords >= 3 && canBreak) {
        breakHere();
      } else if (runWords >= 4 &&
          canBreak &&
          // "heads up everyone, starting Monday we're closing": the subject belongs with the
          // short lead-in after a comma, not with a sentence of its own
          !(sinceComma >= 0 && sinceComma <= 3) &&
          !_recentAdjunct(out, clauseStart) &&
          _subjectVerb(t, i)) {
        if (subordinate) {
          subordinate =
              false; // the main clause of "if ..., we ..." starts here
        } else {
          breakHere();
        }
      }

      if (clauseWords == 0 && _subordinators.contains(lw)) subordinate = true;
      out.add(w);
      clauseWords++;
      runWords++;
      closerOnly = false;
      if (sinceComma >= 0) sinceComma++;
      i++;
    }

    // a question that closes the text ("hey sarah, are you free tonight"): the greeting in front
    // would otherwise hide it from the final-punctuation check
    if (register != 'prompt' &&
        out.isNotEmpty &&
        !_terminal.contains(out.last) &&
        clauseStart > 0 &&
        _isQuestionClause(out.sublist(clauseStart))) {
      out.add('?');
    }

    // a lone "thanks" ending a casual message: "Thanks!"
    if (casual && out.length - clauseStart > 0 && clauseStart > 0) {
      final last =
          [for (final x in out.sublist(clauseStart)) x.toLowerCase()].join(' ');
      if (const {'thanks', 'thank you', 'thanks a lot', 'thank you so much'}
          .contains(last)) {
        out.add('!');
      }
    }
    return out;
  }
}
