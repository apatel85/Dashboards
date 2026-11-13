import 'dart:convert';

class PackTemplate {
  final String id, name, skeleton;
  final List<String> trigger;
  const PackTemplate(this.id, this.name, this.trigger, this.skeleton);
}

/// Domain pack (spec §8). Validation/detectors arrive in M3.
class DomainPack {
  final String id, name, version, promptFragment;
  final List<String> vocabulary;
  final Map<String, String> abbreviations;
  final List<PackTemplate> templates;
  final bool cloudAllowed;
  const DomainPack({
    required this.id,
    required this.name,
    this.version = '1.0.0',
    this.promptFragment = '',
    this.vocabulary = const [],
    this.abbreviations = const {},
    this.templates = const [],
    this.cloudAllowed = true,
  });

  factory DomainPack.fromJson(Map<String, dynamic> j) {
    final safety = (j['safety'] as Map?) ?? const {};
    return DomainPack(
      id: j['id'] as String,
      name: j['name'] as String,
      version: (j['version'] as String?) ?? '1.0.0',
      promptFragment: (j['promptFragment'] as String?) ?? '',
      vocabulary: List<String>.from(j['vocabulary'] as List? ?? const []),
      abbreviations:
          Map<String, String>.from(j['abbreviations'] as Map? ?? const {}),
      templates: [
        for (final t in (j['templates'] as List? ?? const []))
          PackTemplate(t['id'] as String, t['name'] as String,
              List<String>.from(t['trigger'] as List), t['skeleton'] as String)
      ],
      cloudAllowed: (safety['cloudAllowed'] as bool?) ?? true,
    );
  }

  factory DomainPack.fromJsonString(String s) =>
      DomainPack.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
