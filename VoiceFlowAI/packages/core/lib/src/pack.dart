import 'dart:convert';

import 'field_kind.dart';

class PackTemplate {
  final String id, name, skeleton;
  final List<String> trigger;
  const PackTemplate(this.id, this.name, this.trigger, this.skeleton);
}

/// A regex clean-up applied to the final text. `$1`..`$9` in [replace] refer to groups;
/// a group that did not take part in the match counts as empty.
class PackRule {
  final RegExp pattern;
  final String replace;

  /// `"stage": "words"` in the pack file: the rule runs on the spoken words BEFORE numbers become
  /// digits, so it can see "four for twenty two". `{num}` in the pattern matches a spoken or
  /// written number and the captured numbers are handed to [replace] as digits.
  final bool beforeNumbers;

  /// The pattern text as written (needed to expand `{num}`).
  final String source;
  const PackRule(this.pattern, this.replace,
      {this.beforeNumbers = false, this.source = ''});

  String apply(String s) => s.replaceAllMapped(pattern, (m) {
        return replace.replaceAllMapped(RegExp(r'\$(\d)'), (g) {
          final i = int.parse(g.group(1)!);
          return i <= m.groupCount ? (m.group(i) ?? '') : '';
        });
      });
}

/// What makes a pack look relevant (spec §8.3). Scoring lives in `PackDetector`.
class PackDetectors {
  final List<String> apps, windowTitleKeywords, contentKeywords;
  final List<FieldKind> fieldKinds;
  const PackDetectors({
    this.apps = const [],
    this.windowTitleKeywords = const [],
    this.contentKeywords = const [],
    this.fieldKinds = const [],
  });
}

/// Outcome of loading one pack file: either a pack, or readable reasons it was refused.
class PackLoadResult {
  final DomainPack? pack;
  final List<String> errors;
  const PackLoadResult(this.pack, this.errors);
  bool get ok => pack != null;
}

/// Domain pack (spec §8).
class DomainPack {
  final String id, name, version, description, promptFragment;
  final List<String> vocabulary;
  final Map<String, String> abbreviations;
  final List<PackTemplate> templates;
  final PackDetectors detectors;
  final List<PackRule> rules;

  /// "one forty" means 140 (blood-pressure style) instead of 41.
  final bool shorthandHundreds;

  /// Polish must never touch text that contains digits while this pack is active.
  final bool preferRuleFormatterForNumbers;

  /// `false` blocks every engine that sends text off the device while the pack is active.
  final bool cloudAllowed;
  const DomainPack({
    required this.id,
    required this.name,
    this.version = '1.0.0',
    this.description = '',
    this.promptFragment = '',
    this.vocabulary = const [],
    this.abbreviations = const {},
    this.templates = const [],
    this.detectors = const PackDetectors(),
    this.rules = const [],
    this.shorthandHundreds = false,
    this.preferRuleFormatterForNumbers = false,
    this.cloudAllowed = true,
  });

  /// Throws on an invalid pack; use [load] to get readable errors instead.
  factory DomainPack.fromJson(Map<String, dynamic> j) {
    final errs = PackValidator.validate(j);
    if (errs.isNotEmpty) throw FormatException(errs.join('; '));
    List<String> strs(Object? v) => List<String>.from(v as List? ?? const []);
    final safety = (j['safety'] as Map?) ?? const {};
    final nums = (j['numbers'] as Map?) ?? const {};
    final det = (j['detectors'] as Map?) ?? const {};
    return DomainPack(
      id: j['id'] as String,
      name: j['name'] as String,
      version: (j['version'] as String?) ?? '1.0.0',
      description: (j['description'] as String?) ?? '',
      promptFragment: (j['promptFragment'] as String?) ?? '',
      vocabulary: strs(j['vocabulary']),
      abbreviations:
          Map<String, String>.from(j['abbreviations'] as Map? ?? const {}),
      templates: [
        for (final t in (j['templates'] as List? ?? const []))
          PackTemplate(t['id'] as String, t['name'] as String,
              strs(t['trigger']), t['skeleton'] as String)
      ],
      detectors: PackDetectors(
        apps: strs(det['apps']).map((e) => e.toLowerCase()).toList(),
        windowTitleKeywords: strs(det['windowTitleKeywords'])
            .map((e) => e.toLowerCase())
            .toList(),
        contentKeywords:
            strs(det['contentKeywords']).map((e) => e.toLowerCase()).toList(),
        fieldKinds: [
          for (final k in strs(det['fieldKinds']))
            FieldKind.values.firstWhere((f) => f.name == k)
        ],
      ),
      rules: [
        for (final r in (j['rules'] as List? ?? const []))
          PackRule(RegExp(r['pattern'] as String, caseSensitive: false),
              r['replace'] as String,
              beforeNumbers: r['stage'] == 'words',
              source: r['pattern'] as String)
      ],
      shorthandHundreds: (nums['shorthandHundreds'] as bool?) ?? false,
      preferRuleFormatterForNumbers:
          (safety['preferRuleFormatterForNumbers'] as bool?) ?? false,
      cloudAllowed: (safety['cloudAllowed'] as bool?) ?? true,
    );
  }

  factory DomainPack.fromJsonString(String s) =>
      DomainPack.fromJson(jsonDecode(s) as Map<String, dynamic>);

  /// Never throws: a malformed pack yields readable errors (spec §8.2).
  static PackLoadResult load(String source) {
    Object? j;
    try {
      j = jsonDecode(source);
    } catch (_) {
      return const PackLoadResult(null, ['This file is not valid JSON.']);
    }
    final errs = PackValidator.validate(j);
    if (errs.isNotEmpty) return PackLoadResult(null, errs);
    try {
      return PackLoadResult(
          DomainPack.fromJson(j as Map<String, dynamic>), const []);
    } catch (e) {
      return PackLoadResult(null, ['Could not read this pack ($e).']);
    }
  }
}

/// Checks a decoded pack against the format in spec §8.1. Unknown keys are allowed so newer
/// packs still load; every problem is a short sentence a person can act on.
class PackValidator {
  static const maxVocabulary = 5000;
  static const maxRules = 50;
  static final _id = RegExp(r'^[a-z0-9_]{1,40}$');
  // (a+)+ style nesting: catastrophic backtracking, refused outright.
  static final _nested = RegExp(r'\([^)]*[+*][^)]*\)[+*{]');

  static List<String> validate(Object? j) {
    final e = <String>[];
    if (j is! Map) return ['A pack must be a JSON object.'];

    final id = j['id'];
    if (id is! String || !_id.hasMatch(id)) {
      e.add(
          '"id" must be 1-40 characters: lowercase letters, digits or underscore.');
    }
    final name = j['name'];
    if (name is! String || name.trim().isEmpty) {
      e.add('"name" must be a non-empty text.');
    }
    if (j.containsKey('version') && j['version'] is! String) {
      e.add('"version" must be text such as "1.0.0".');
    }
    if (j.containsKey('description') && j['description'] is! String) {
      e.add('"description" must be text.');
    }
    if (j.containsKey('promptFragment') && j['promptFragment'] is! String) {
      e.add('"promptFragment" must be text.');
    }

    void stringList(String where, Object? v, {int max = maxVocabulary}) {
      if (v == null) return;
      if (v is! List || v.any((x) => x is! String)) {
        e.add('"$where" must be a list of text items.');
      } else if (v.length > max) {
        e.add('"$where" has too many entries (limit $max).');
      }
    }

    stringList('vocabulary', j['vocabulary']);

    final abbr = j['abbreviations'];
    if (abbr != null) {
      if (abbr is! Map || abbr.entries.any((x) => x.value is! String)) {
        e.add(
            '"abbreviations" must map short words to text, like {"eod": "end of day"}.');
      } else if (abbr.keys.any((k) => (k as String).trim().isEmpty)) {
        e.add('"abbreviations" cannot have an empty key.');
      }
    }

    final tpl = j['templates'];
    if (tpl != null) {
      if (tpl is! List) {
        e.add('"templates" must be a list.');
      } else {
        for (var i = 0; i < tpl.length; i++) {
          final t = tpl[i];
          final at = 'templates[$i]';
          if (t is! Map) {
            e.add('$at must be an object.');
            continue;
          }
          if (t['id'] is! String || t['name'] is! String) {
            e.add('$at needs text "id" and "name".');
          }
          final tr = t['trigger'];
          if (tr is! List ||
              tr.isEmpty ||
              tr.any((x) => x is! String || x.trim().isEmpty)) {
            e.add('$at.trigger must be a non-empty list of phrases.');
          }
          if (t['skeleton'] is! String) e.add('$at.skeleton must be text.');
        }
      }
    }

    final det = j['detectors'];
    if (det != null) {
      if (det is! Map) {
        e.add('"detectors" must be an object.');
      } else {
        for (final k in ['apps', 'windowTitleKeywords', 'contentKeywords']) {
          stringList('detectors.$k', det[k], max: 200);
        }
        final fk = det['fieldKinds'];
        if (fk != null &&
            (fk is! List ||
                fk.any((x) => !FieldKind.values.any((f) => f.name == x)))) {
          e.add(
              '"detectors.fieldKinds" may only contain: ${FieldKind.values.map((f) => f.name).join(', ')}.');
        }
      }
    }

    for (final key in ['safety', 'numbers']) {
      final m = j[key];
      if (m == null) continue;
      if (m is! Map || m.values.any((x) => x is! bool)) {
        e.add('"$key" must be an object of true/false switches.');
      }
    }

    final rules = j['rules'];
    if (rules != null) {
      if (rules is! List) {
        e.add('"rules" must be a list.');
      } else {
        if (rules.length > maxRules) {
          e.add('"rules" has too many entries (limit $maxRules).');
        }
        for (var i = 0; i < rules.length && i < maxRules; i++) {
          final r = rules[i];
          final at = 'rules[$i]';
          if (r is! Map || r['pattern'] is! String || r['replace'] is! String) {
            e.add('$at needs text "pattern" and "replace".');
            continue;
          }
          final stage = r['stage'];
          if (stage != null && stage != 'words') {
            e.add('$at.stage can only be "words" (or left out).');
          }
          final p = r['pattern'] as String;
          if (p.isEmpty || p.length > 200) {
            e.add('$at.pattern must be 1-200 characters.');
          } else if (_nested.hasMatch(p)) {
            e.add(
                '$at.pattern repeats a repeated group, which can hang the app. Simplify it.');
          } else {
            try {
              RegExp(p);
            } catch (_) {
              e.add('$at.pattern is not a valid pattern.');
            }
          }
        }
      }
    }
    return e;
  }
}
