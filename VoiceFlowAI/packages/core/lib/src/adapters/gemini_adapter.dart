import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models.dart';

/// Direct Gemini adapter (used only when a key is available on-device, e.g.
/// tests or a user who chooses to paste one). The default route is the
/// server-side proxy in proxy_adapter.dart.
class GeminiAdapter implements PolishEngine {
  final http.Client client;
  final String apiKey;
  String model;
  final String baseUrl;
  GeminiAdapter(this.client,
      {required this.apiKey,
      this.model = 'gemini-3.5-flash-lite',
      this.baseUrl = 'https://generativelanguage.googleapis.com'});

  @override
  String get name => 'gemini';
  @override
  bool get isAvailable => apiKey.isNotEmpty;
  @override
  bool get leavesDevice => true;

  /// Lists models and returns the newest id containing `flash-lite`.
  static Future<String?> pickFlashLite(http.Client c, String apiKey,
      {String baseUrl = 'https://generativelanguage.googleapis.com'}) async {
    final r = await c.get(Uri.parse('$baseUrl/v1beta/models'),
        headers: {'x-goog-api-key': apiKey});
    if (r.statusCode != 200) return null;
    final ids = [
      for (final m in (jsonDecode(r.body)['models'] as List? ?? const []))
        (m['name'] as String).replaceFirst('models/', '')
    ].where((i) => i.contains('flash-lite')).toList();
    if (ids.isEmpty) return null;
    int ver(String s) =>
        int.tryParse(RegExp(r'gemini-(\d+)(?:\.(\d+))?')
                .firstMatch(s)
                ?.group(0)!
                .replaceAll(RegExp(r'[^0-9]'), '') ??
            '0') ??
        0;
    ids.sort((a, b) => ver(b).compareTo(ver(a)));
    return ids.first;
  }

  @override
  Future<String> complete(String systemPrompt, String userText,
      {int maxTokens = 1024,
      Duration timeout = const Duration(seconds: 3)}) async {
    final uri = Uri.parse('$baseUrl/v1beta/models/$model:generateContent');
    final body = jsonEncode({
      'systemInstruction': {
        'parts': [
          {'text': systemPrompt}
        ]
      },
      'contents': [
        {
          'role': 'user',
          'parts': [
            {'text': userText}
          ]
        }
      ],
      'generationConfig': {'temperature': 0, 'maxOutputTokens': maxTokens},
    });
    final http.Response r;
    try {
      r = await client
          .post(uri,
              headers: {
                'content-type': 'application/json',
                'x-goog-api-key': apiKey
              },
              body: body)
          .timeout(timeout);
    } on TimeoutException {
      throw const PolishException('timeout');
    }
    if (r.statusCode == 429) {
      throw const PolishException('rate limited', rateLimited: true);
    }
    if (r.statusCode != 200) throw PolishException('http ${r.statusCode}');
    final j = jsonDecode(r.body);
    final t = j['candidates']?[0]?['content']?['parts']?[0]?['text'];
    if (t is! String) throw const PolishException('malformed response');
    return t.trim();
  }
}
