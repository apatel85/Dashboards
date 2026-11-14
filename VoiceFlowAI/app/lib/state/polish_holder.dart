import 'package:http/http.dart' as http;
import 'package:voiceflow_core/voiceflow_core.dart';

import 'polish_config.dart';

/// Hands the pipelines the right [PolishChain] for the current settings. The chain (and with it
/// the 429 back-off and today's counters) is kept until something that decides polish changes.
class PolishHolder {
  PolishHolder(
    this.settings, {
    http.Client? client,
    this.proxyUrl = kPolishFunctionUrl,
    this.proxyAnonKey = kPolishAnonKey,
  }) : client = client ?? http.Client();

  /// Replaceable: the keyboard re-reads settings from disk on every call.
  Settings settings;
  final http.Client client;
  final String proxyUrl, proxyAnonKey;
  PolishChain? _chain;
  String? _fp;

  /// Pass this as `polishProvider:` to a [DictationPipeline].
  PolishChain? get chain {
    final fp = polishFingerprint(settings);
    if (fp != _fp) {
      _fp = fp;
      _chain = polishChainFor(
        settings,
        client: client,
        proxyUrl: proxyUrl,
        proxyAnonKey: proxyAnonKey,
      );
    }
    return _chain;
  }

  /// "Test polish": one tiny real request, answered in plain words.
  Future<String> test() async {
    final c = chain;
    if (c == null) return 'Polish is off.';
    final out = await c.complete(
      'Repeat the user text exactly, with correct punctuation and capital letters.',
      'hello this is a test',
      timeout: const Duration(seconds: 6),
    );
    if (out == null || out.trim().isEmpty) {
      return 'No answer. The service may be busy, not set up yet, or unreachable. Your text is still formatted on this device.';
    }
    return 'Works: "${out.trim()}"';
  }
}
