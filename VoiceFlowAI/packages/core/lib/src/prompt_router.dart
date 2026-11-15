import 'lang.dart';

/// Keyword router for Prompt mode (spec section 5): what will the speaker hold when the work is
/// done? Decision order: REWRITE, FIX, ANALYZE, DO, BUILD, WRITE, RESEARCH, PLAN, then ASK.
/// A question that starts with a wh-word or "do/is/are" is about something, so it is ASK or PLAN,
/// never the action itself. Signals live in `lang/en.json` `promptRoutes`.
///
/// Not routed here: FOLLOWUP (needs the previous answer, which the app does not keep) and
/// CLARIFY (needs the field-filling stage).
class PromptRouter {
  final LangData lang;
  PromptRouter(this.lang);

  Map<String, dynamic> get _d =>
      Map<String, dynamic>.from((lang.raw['promptRoutes'] as Map?) ?? const {});

  late final List<(String, RegExp)> _order = [
    for (final r in (_d['order'] as List? ?? const []))
      (
        r['route'] as String,
        RegExp(r['pattern'] as String, caseSensitive: false)
      )
  ];
  late final RegExp? _question = _d['questionStart'] == null
      ? null
      : RegExp(_d['questionStart'] as String, caseSensitive: false);
  late final RegExp? _irreversible = _re('irreversible');
  late final RegExp? _waiver = _re('waiver');
  late final RegExp? _approved = _re('approved');
  late final List<String> _markers =
      List<String>.from(_d['splitMarkers'] as List? ?? const []);

  late final RegExp? _requestStart = _re('requestStart');

  RegExp? _re(String k) =>
      _d[k] == null ? null : RegExp(_d[k] as String, caseSensitive: false);

  String get approvalLine => (_d['approval'] as String?) ?? '';

  String route(String text) {
    final t = text.trim();
    final isQuestion = _question?.hasMatch(t) ?? false;
    for (final (name, re) in _order) {
      if (!re.hasMatch(t)) continue;
      // a question about a deliverable is ASK (or PLAN), not the deliverable itself
      if (isQuestion && (name == 'BUILD' || name == 'WRITE' || name == 'DO')) {
        continue;
      }
      return name;
    }
    return 'ASK';
  }

  /// A DO request that sends, deletes, pays or publishes needs an approval constraint unless the
  /// speaker waived it or already asked for a draft / a look first (spec checks 9).
  bool needsApproval(String text, String route) {
    if (route != 'DO') return false;
    final irreversible = _irreversible;
    if (irreversible == null || !irreversible.hasMatch(text)) return false;
    if (_waiver?.hasMatch(text) ?? false) return false;
    if (_approved?.hasMatch(text) ?? false) return false;
    return true;
  }

  /// Two unrelated requests joined by "also" / "oh and" / "another thing": returns the two texts,
  /// or null when it is one request. Only when both halves are real requests with different
  /// routes (steps that feed one deliverable stay in one prompt).
  (String, String)? split(String text) {
    final sentences = text.split(RegExp(r'(?<=[.?!])\s+'));
    if (sentences.length < 2) return null;
    for (var i = 1; i < sentences.length; i++) {
      final low = sentences[i].toLowerCase();
      final marker =
          _markers.where((m) => low.startsWith('$m ') || low.startsWith('$m,'));
      if (marker.isEmpty) continue;
      final m = marker.first;
      var tail =
          sentences[i].substring(m.length).replaceFirst(RegExp(r'^[,\s]+'), '');
      final head = sentences.sublist(0, i).join(' ');
      final rest = [tail, ...sentences.sublist(i + 1)].join(' ').trim();
      if (head.split(' ').length < 4 || rest.split(' ').length < 4) continue;
      // the second part must itself be a request ("also draft a note ..."), not more detail
      // about the first ("also it will save tokens")
      if (!(_requestStart?.hasMatch(rest) ?? false)) continue;
      if (route(head) == route(rest)) continue;
      return (head, rest[0].toUpperCase() + rest.substring(1));
    }
    return null;
  }
}
