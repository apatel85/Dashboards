import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models.dart';

/// Calls the VoiceFlow Supabase Edge Function (`voiceflow-polish`).
///
/// The Gemini key lives ONLY as a server-side secret of that function, so no
/// key is ever entered in, shipped with, or stored by the app. The `anonKey`
/// is Supabase's public client key (safe to embed; same as PLDashboard).
class ProxyPolishAdapter implements PolishEngine {
  final http.Client client;
  final String functionUrl, anonKey;
  ProxyPolishAdapter(this.client,
      {required this.functionUrl, required this.anonKey});

  @override
  String get name => 'voiceflow-proxy';
  @override
  bool get isAvailable => functionUrl.isNotEmpty && anonKey.isNotEmpty;
  @override
  bool get leavesDevice => true;

  @override
  Future<String> complete(String systemPrompt, String userText,
      {int maxTokens = 1024,
      Duration timeout = const Duration(seconds: 3)}) async {
    final http.Response r;
    try {
      r = await client
          .post(Uri.parse(functionUrl),
              headers: {
                'content-type': 'application/json',
                'apikey': anonKey,
                'authorization': 'Bearer $anonKey',
              },
              body: jsonEncode({
                'system': systemPrompt,
                'text': userText,
                'maxTokens': maxTokens,
              }))
          .timeout(timeout);
    } on TimeoutException {
      throw const PolishException('timeout');
    }
    if (r.statusCode == 429) {
      throw const PolishException('rate limited', rateLimited: true);
    }
    if (r.statusCode != 200) throw PolishException('http ${r.statusCode}');
    final t = jsonDecode(r.body)['text'];
    if (t is! String) throw const PolishException('malformed response');
    return t.trim();
  }
}
