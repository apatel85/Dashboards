import 'pack.dart';

/// A pack file that was refused, with reasons a person can act on.
class PackLoadError {
  final String source;
  final List<String> messages;
  const PackLoadError(this.source, this.messages);
}

/// Every pack the app knows (bundled + user folder + imported), and which are active in what
/// priority order. Adding a pack needs no code change (spec §8.2). A bad pack is recorded in
/// [errors] and never crashes anything.
class PackRegistry {
  final Map<String, DomainPack> _all = {};
  final List<PackLoadError> errors = [];
  List<String> _activeIds = [];

  List<DomainPack> get all => List.unmodifiable(_all.values);
  DomainPack? byId(String id) => _all[id];

  /// Active ids, highest priority first. Unknown ids are dropped when read.
  List<String> get activeIds =>
      _activeIds.where(_all.containsKey).toList(growable: false);

  /// Active packs in priority order: earlier packs win a conflict.
  List<DomainPack> get active => [for (final id in activeIds) _all[id]!];

  /// Adds one pack from its JSON text. Same id replaces the older pack (a user copy overrides a
  /// bundled one). Returns the result so a caller can show the reasons.
  PackLoadResult add(String json, {String source = 'pack'}) {
    final r = DomainPack.load(json);
    if (r.ok) {
      _all[r.pack!.id] = r.pack!;
    } else {
      errors.add(PackLoadError(source, r.errors));
    }
    return r;
  }

  void setActive(Iterable<String> ids) {
    final seen = <String>{};
    _activeIds = [
      for (final id in ids)
        if (seen.add(id)) id
    ];
  }

  void activate(String id) {
    if (_all.containsKey(id) && !_activeIds.contains(id)) {
      _activeIds = [..._activeIds, id];
    }
  }

  void deactivate(String id) =>
      _activeIds = _activeIds.where((x) => x != id).toList();

  /// Moves [id] one place toward the front (higher priority) or back.
  void move(String id, int delta) {
    // Work on the visible list so ids of packs that are not loaded cannot absorb a move.
    final vis = [...activeIds];
    final i = vis.indexOf(id);
    if (i < 0) return;
    final j = (i + delta).clamp(0, vis.length - 1);
    vis.removeAt(i);
    vis.insert(j, id);
    _activeIds = vis;
  }

  void remove(String id) {
    _all.remove(id);
    deactivate(id);
  }
}
