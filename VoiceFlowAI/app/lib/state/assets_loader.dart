import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

/// Loads the bundled language data, profiles and packs once at start-up.
class AppAssets {
  final LangData lang;
  final List<Profile> profiles;
  final List<DomainPack> packs;

  /// Raw JSON of each bundled pack, so a [PackRegistry] can load them like any other pack.
  final List<String> packSources;
  const AppAssets(
    this.lang,
    this.profiles,
    this.packs, [
    this.packSources = const [],
  ]);

  static const profileIds = [
    'casual',
    'business',
    'professional',
    'ai_prompting',
  ];
  static const packIds = ['general_business', 'healthcare_clinic'];

  static Future<AppAssets> load([AssetBundle? bundle]) async {
    final b = bundle ?? rootBundle;
    final lang = LangData.fromJsonString(
      await b.loadString('assets/lang/en.json'),
    );
    final profiles = [
      for (final id in profileIds)
        Profile.fromJson(
          jsonDecode(await b.loadString('assets/profiles/$id.json'))
              as Map<String, dynamic>,
        ),
    ];
    final sources = [
      for (final id in packIds)
        await b.loadString('assets/packs/$id/pack.json'),
    ];
    final packs = [for (final s in sources) DomainPack.fromJsonString(s)];
    return AppAssets(lang, profiles, packs, sources);
  }
}
