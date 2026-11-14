import 'field_kind.dart';
import 'pack.dart';

/// What we know about where the user is about to dictate. All parts optional.
class DetectContext {
  final String? appId, windowTitle, text;
  final FieldKind? fieldKind;
  const DetectContext(
      {this.appId, this.windowTitle, this.text, this.fieldKind});
}

class PackSuggestion {
  final DomainPack pack;
  final int score;
  final List<String> reasons;
  const PackSuggestion(this.pack, this.score, this.reasons);
}

/// Rule-based relevance score per pack (spec §8.3). It only ever *suggests*: nothing here
/// switches a pack on. A suggestion is a chip the user accepts in one tap.
///
/// Weights: app match 3, each window-title keyword 2 (max 4), each content keyword 1 (max 3),
/// field kind 1. A pack is suggested at [threshold] or more, so an app match alone is enough but
/// one title word or one content word alone is not.
class PackDetector {
  const PackDetector({this.threshold = 3});
  final int threshold;

  List<PackSuggestion> suggest(
    Iterable<DomainPack> candidates,
    DetectContext ctx, {
    Set<String> exclude = const {},
  }) {
    final out = <PackSuggestion>[];
    for (final p in candidates) {
      if (exclude.contains(p.id)) continue;
      final s = _score(p, ctx);
      if (s.$1 >= threshold) out.add(PackSuggestion(p, s.$1, s.$2));
    }
    out.sort((a, b) => b.score.compareTo(a.score));
    return out;
  }

  (int, List<String>) _score(DomainPack p, DetectContext c) {
    var score = 0;
    final why = <String>[];
    final d = p.detectors;

    final app = (c.appId ?? '').toLowerCase().replaceAll(RegExp(r'\.exe$'), '');
    if (app.isNotEmpty &&
        d.apps.any((a) => app == a || (a.length >= 4 && app.contains(a)))) {
      score += 3;
      why.add('app');
    }

    final title = (c.windowTitle ?? '').toLowerCase();
    if (title.isNotEmpty) {
      final hits =
          d.windowTitleKeywords.where((k) => _hasWord(title, k)).length;
      if (hits > 0) {
        score += (hits * 2).clamp(0, 4);
        why.add('window title');
      }
    }

    final text = (c.text ?? '').toLowerCase();
    if (text.isNotEmpty) {
      final hits = d.contentKeywords.where((k) => _hasWord(text, k)).length;
      if (hits > 0) {
        score += hits.clamp(0, 3);
        why.add('words you said');
      }
    }

    if (c.fieldKind != null && d.fieldKinds.contains(c.fieldKind)) {
      score += 1;
      why.add('field type');
    }
    return (score, why);
  }

  static bool _hasWord(String hay, String needle) {
    if (needle.isEmpty) return false;
    return RegExp('(^|[^a-z0-9])${RegExp.escape(needle)}(\$|[^a-z0-9])')
        .hasMatch(hay);
  }
}
