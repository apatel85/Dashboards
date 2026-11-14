import 'package:http/http.dart' as http;

import 'adapters/openai_adapter.dart';
import 'adapters/polish_chain.dart';
import 'adapters/proxy_adapter.dart';
import 'settings.dart';

/// Which polish engines the current settings allow (spec §7). Returns null when polish is off, so
/// the default install makes no network call at all.
///
/// * Off unless `cloudPolish` is on.
/// * The hosted proxy and any non-local server need `cloudConsent`: text leaves the device.
/// * A server on this computer (Ollama) needs no consent: text does not leave the device.
PolishChain? polishChainFor(
  Settings s, {
  required http.Client client,
  required String proxyUrl,
  required String proxyAnonKey,
}) {
  if (!s.cloudPolish) return null;
  switch (s.cloudPreset) {
    case 'proxy':
      if (!s.cloudConsent || proxyUrl.isEmpty || proxyAnonKey.isEmpty) {
        return null;
      }
      return PolishChain([
        ProxyPolishAdapter(client,
            functionUrl: proxyUrl, anonKey: proxyAnonKey),
      ]);
    case 'ollama':
      if (s.ollamaModel.trim().isEmpty) return null;
      final e = OpenAiCompatAdapter(client,
          baseUrl: s.ollamaUrl, model: s.ollamaModel.trim(), label: 'ollama');
      if (e.leavesDevice && !s.cloudConsent) return null;
      return PolishChain([e]);
    default:
      return null; // "custom" is not offered yet
  }
}

/// Changes only when something that decides the polish setup changes. Callers keep their
/// [PolishChain] (and its 429 skip / daily counters) until this string changes.
String polishFingerprint(Settings s) =>
    '${s.cloudPolish}|${s.cloudConsent}|${s.cloudPreset}|${s.ollamaUrl}|${s.ollamaModel}';
