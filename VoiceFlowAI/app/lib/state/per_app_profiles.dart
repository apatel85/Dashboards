/// "Per-app profile memory" (spec §9.3): the profile you last chose while an app was
/// focused is remembered for that app. User-set, so it never switches silently.
class PerAppProfiles {
  PerAppProfiles(
    Map<String, String> initial, {
    required this.onChanged,
    this.ignore = const {'voiceflow_app.exe'},
  }) : _map = Map.of(initial);

  final void Function(Map<String, String>) onChanged;

  /// Apps whose focus says nothing about where you will dictate (our own window).
  final Set<String> ignore;
  final Map<String, String> _map;

  Map<String, String> get all => Map.unmodifiable(_map);

  String? profileFor(String? appId) =>
      appId == null ? null : _map[appId.toLowerCase()];

  void remember(String? appId, String profileId) {
    if (appId == null) return;
    final k = appId.toLowerCase();
    if (ignore.contains(k) || _map[k] == profileId) return;
    _map[k] = profileId;
    onChanged(Map.of(_map));
  }
}
