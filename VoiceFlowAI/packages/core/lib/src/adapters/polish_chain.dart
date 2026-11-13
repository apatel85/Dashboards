import '../models.dart';

/// Tries engines in order; skips an engine for 60 s after a 429; counts daily
/// requests per engine. Never retries (spec §7.3).
class PolishChain {
  final List<PolishEngine> engines;
  final DateTime Function() now;
  final Map<String, DateTime> _skipUntil = {};
  final Map<String, int> _count = {};
  String _day = '';
  PolishChain(this.engines, {DateTime Function()? now})
      : now = now ?? DateTime.now;

  bool get hasEngines => engines.any((e) => e.isAvailable);

  /// Requests made today, per engine name (for the Settings page).
  Map<String, int> get todayCounts {
    _roll();
    return Map.unmodifiable(_count);
  }

  void _roll() {
    final d = now().toIso8601String().substring(0, 10);
    if (d != _day) {
      _day = d;
      _count.clear();
    }
  }

  /// Returns null if no engine produced text. `allowCloud` false restricts to
  /// loopback engines (pack `safety.cloudAllowed: false`).
  Future<String?> complete(String system, String text,
      {bool allowCloud = true,
      int maxTokens = 1024,
      Duration timeout = const Duration(seconds: 3),
      void Function(String reason)? onFallthrough}) async {
    _roll();
    for (final e in engines) {
      if (!e.isAvailable) continue;
      if (e.leavesDevice && !allowCloud) continue;
      final until = _skipUntil[e.name];
      if (until != null && now().isBefore(until)) continue;
      _count[e.name] = (_count[e.name] ?? 0) + 1;
      try {
        return await e.complete(system, text,
            maxTokens: maxTokens, timeout: timeout);
      } on PolishException catch (x) {
        if (x.rateLimited) {
          _skipUntil[e.name] = now().add(const Duration(seconds: 60));
        }
        onFallthrough?.call(x.rateLimited ? 'rate-limit' : x.message);
      } catch (_) {
        onFallthrough?.call('error');
      }
    }
    return null;
  }
}
