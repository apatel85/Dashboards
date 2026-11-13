import 'dart:convert';

class HistoryEntry {
  final DateTime at;
  final String text, profileId;
  const HistoryEntry(this.at, this.text, this.profileId);
  Map<String, dynamic> toJson() =>
      {'at': at.toIso8601String(), 'text': text, 'profile': profileId};
  factory HistoryEntry.fromJson(Map<String, dynamic> j) => HistoryEntry(
      DateTime.parse(j['at'] as String),
      j['text'] as String,
      j['profile'] as String);
}

/// Platform adapters implement this with encrypted storage (DPAPI / Keystore).
abstract class HistoryStorage {
  Future<String?> read();
  Future<void> write(String data);
}

class MemoryHistoryStorage implements HistoryStorage {
  String? data;
  @override
  Future<String?> read() async => data;
  @override
  Future<void> write(String d) async => data = d;
}

class HistoryStore {
  final HistoryStorage storage;
  final DateTime Function() now;
  bool enabled;
  int retentionDays;
  final List<HistoryEntry> _items = [];
  HistoryStore(this.storage,
      {this.enabled = true, this.retentionDays = 7, DateTime Function()? now})
      : now = now ?? DateTime.now;

  List<HistoryEntry> get items => List.unmodifiable(_items.reversed);

  Future<void> load() async {
    final s = await storage.read();
    _items.clear();
    if (s != null && s.isNotEmpty) {
      try {
        for (final j in (jsonDecode(s)['items'] as List)) {
          _items.add(HistoryEntry.fromJson(j as Map<String, dynamic>));
        }
      } catch (_) {
        // corrupt file: start empty rather than crash
      }
    }
    await purge();
  }

  Future<void> add(String text, String profileId) async {
    if (!enabled) return;
    _items.add(HistoryEntry(now(), text, profileId));
    await purge();
  }

  Future<void> purge() async {
    final cutoff = now().subtract(Duration(days: retentionDays));
    _items.removeWhere((e) => e.at.isBefore(cutoff));
    await _save();
  }

  List<HistoryEntry> search(String q) => items
      .where((e) => e.text.toLowerCase().contains(q.toLowerCase()))
      .toList();

  Future<void> delete(HistoryEntry e) async {
    _items.remove(e);
    await _save();
  }

  Future<void> clear() async {
    _items.clear();
    await _save();
  }

  Future<void> _save() => storage.write(
      jsonEncode({'v': 1, 'items': _items.map((e) => e.toJson()).toList()}));
}
