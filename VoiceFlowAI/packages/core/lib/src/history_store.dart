import 'dart:convert';

/// One dictation, kept so the conversion can be checked later: what the speech engine heard
/// ([raw]) next to what was typed ([text]), and how it got there.
class HistoryEntry {
  final DateTime at;

  /// The converted text that was typed.
  final String text;
  final String profileId;

  /// What the speech engine returned, before any conversion ('' for entries saved before this
  /// field existed).
  final String raw;
  final bool polished;

  /// Prompt route (ASK, BUILD, SPLIT ...) when the AI-prompting mode ran; null otherwise.
  final String? route;

  /// Why the rule path fell back to minimal formatting; null when it did not.
  final String? fallback;

  /// The app being typed into (package name or program), when known.
  final String? app;
  const HistoryEntry(
    this.at,
    this.text,
    this.profileId, {
    this.raw = '',
    this.polished = false,
    this.route,
    this.fallback,
    this.app,
  });

  Map<String, dynamic> toJson() => {
        'at': at.toIso8601String(),
        'text': text,
        'profile': profileId,
        if (raw.isNotEmpty) 'raw': raw,
        if (polished) 'polished': true,
        if (route != null) 'route': route,
        if (fallback != null) 'fallback': fallback,
        if (app != null) 'app': app,
      };

  factory HistoryEntry.fromJson(Map<String, dynamic> j) => HistoryEntry(
        DateTime.parse(j['at'] as String),
        j['text'] as String,
        j['profile'] as String,
        raw: (j['raw'] as String?) ?? '',
        polished: (j['polished'] as bool?) ?? false,
        route: j['route'] as String?,
        fallback: j['fallback'] as String?,
        app: j['app'] as String?,
      );
}

/// Platform adapters implement this (a private file today; encrypted storage is a later step).
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

/// A plain-text report of entries, newest first, for pasting into a bug report: for each
/// dictation the raw transcript and the converted text, with the details of how.
String historyReport(Iterable<HistoryEntry> entries,
    {String Function(String profileId)? profileName}) {
  final sb = StringBuffer('VoiceFlow history report\n');
  var n = 0;
  for (final e in entries) {
    n++;
    final when = e.at.toLocal().toString().split('.').first;
    final tags = [
      profileName?.call(e.profileId) ?? e.profileId,
      if (e.app != null) 'app: ${e.app}',
      if (e.route != null) 'route: ${e.route}',
      if (e.polished) 'polished',
      if (e.fallback != null) 'fell back: ${e.fallback}',
    ].join(' | ');
    sb
      ..writeln('\n--- #$n  $when  $tags')
      ..writeln('HEARD: ${e.raw.isEmpty ? '(not saved)' : e.raw}')
      ..writeln('TYPED: ${e.text}');
  }
  if (n == 0) sb.writeln('\n(no dictations saved)');
  return sb.toString();
}

class HistoryStore {
  final HistoryStorage storage;
  final DateTime Function() now;
  bool enabled;
  int retentionDays;

  /// Most entries kept, so the file stays small.
  final int maxItems;
  final List<HistoryEntry> _items = [];
  HistoryStore(this.storage,
      {this.enabled = true,
      this.retentionDays = 7,
      this.maxItems = 200,
      DateTime Function()? now})
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

  /// Two parts of the app (the window and the floating-button engine) write the same file, so
  /// each add re-reads it first rather than overwriting the other's entries.
  Future<void> add(String text, String profileId,
      {String raw = '',
      bool polished = false,
      String? route,
      String? fallback,
      String? app}) async {
    if (!enabled) return;
    await load();
    _items.add(HistoryEntry(now(), text, profileId,
        raw: raw,
        polished: polished,
        route: route,
        fallback: fallback,
        app: app));
    await purge();
  }

  Future<void> purge() async {
    final cutoff = now().subtract(Duration(days: retentionDays));
    _items.removeWhere((e) => e.at.isBefore(cutoff));
    while (_items.length > maxItems) {
      _items.removeAt(0);
    }
    await _save();
  }

  List<HistoryEntry> search(String q) => items
      .where((e) =>
          e.text.toLowerCase().contains(q.toLowerCase()) ||
          e.raw.toLowerCase().contains(q.toLowerCase()))
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
      jsonEncode({'v': 2, 'items': _items.map((e) => e.toJson()).toList()}));
}
