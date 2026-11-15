import 'dart:convert';

class FewShot {
  final String input, output;
  const FewShot(this.input, this.output);
}

class Profile {
  final String id, name, styleInstructions;
  final bool useLlm;
  final bool expandContractions;
  final bool numbersAsDigits;
  final bool lists;
  final bool fullFillers;

  /// "gonna" -> "going to", "wanna" -> "want to" (a setting; on by default in Casual).
  final bool expandSpokenForms;

  /// Tone: casual | business | professional | prompt (token-lean text for AI tools).
  final String register;
  final List<FewShot> fewShot;
  const Profile({
    required this.id,
    required this.name,
    required this.styleInstructions,
    this.useLlm = true,
    this.expandContractions = false,
    this.numbersAsDigits = true,
    this.lists = true,
    this.fullFillers = false,
    this.expandSpokenForms = false,
    this.register = 'business',
    this.fewShot = const [],
  });

  factory Profile.fromJson(Map<String, dynamic> j) {
    final r = (j['rules'] as Map?) ?? const {};
    return Profile(
      id: j['id'] as String,
      name: j['name'] as String,
      styleInstructions: (j['styleInstructions'] as String?) ?? '',
      useLlm: (j['useLlm'] as bool?) ?? true,
      expandContractions: r['contractions'] == 'expand',
      numbersAsDigits: r['numbers'] != 'words',
      lists: (r['lists'] as bool?) ?? true,
      fullFillers: r['fillers'] == 'full',
      expandSpokenForms: r['spokenForms'] == 'expand',
      register: (r['register'] as String?) ?? 'business',
      fewShot: [
        for (final f in (j['fewShot'] as List? ?? const []))
          FewShot(f['in'] as String, f['out'] as String)
      ],
    );
  }

  factory Profile.fromJsonString(String s) =>
      Profile.fromJson(jsonDecode(s) as Map<String, dynamic>);
}
