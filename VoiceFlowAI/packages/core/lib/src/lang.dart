import 'dart:convert';

/// Language data loaded from `lang/<code>.json`. Adding a language = a new file.
class LangData {
  final Map<String, dynamic> raw;
  LangData(this.raw);
  factory LangData.fromJsonString(String s) =>
      LangData(jsonDecode(s) as Map<String, dynamic>);

  List<String> list(String k) => List<String>.from(raw[k] as List);
  Map<String, String> map(String k) => Map<String, String>.from(raw[k] as Map);

  late final Set<String> fillersPure = list('fillersPure').toSet();
  late final List<String> fillersFull = list('fillersFull');
  late final Set<String> phantoms = list('phantoms').toSet();
  late final Map<String, String> spokenPunct = map('spokenPunctuation');
  late final Map<String, String> contractions = map('contractions');
  late final Map<String, String> expansions = map('expansions');
  late final Set<String> questionAux = list('questionAux').toSet();
  late final Set<String> questionFollow = list('questionFollow').toSet();
  late final Set<String> properNouns = list('properNouns').toSet();
  late final Set<String> names = list('names').toSet();
  late final Map<String, dynamic> numbers =
      Map<String, dynamic>.from(raw['numbers'] as Map);
  late final Map<String, List<String>> commands = {
    for (final e in (raw['commands'] as Map).entries)
      e.key as String: List<String>.from(e.value as List)
  };
  late final String needsPolishHint =
      (raw['hints'] as Map)['aiPromptingNeedsPolish'] as String;
}
