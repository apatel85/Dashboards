import 'dart:async';
import 'dart:convert';
import 'package:http/http.dart' as http;
import '../models.dart';

/// OpenAI-compatible `/chat/completions` (Groq, Ollama, OpenRouter...).
class OpenAiCompatAdapter implements PolishEngine {
  final http.Client client;
  final String baseUrl, model, label;
  final String? apiKey;
  OpenAiCompatAdapter(this.client,
      {required this.baseUrl,
      required this.model,
      this.apiKey,
      this.label = 'openai-compatible'});

  @override
  String get name => label;
  @override
  bool get isAvailable => true;
  @override
  bool get leavesDevice {
    final h = Uri.parse(baseUrl).host;
    return !(h == 'localhost' ||
        h == '127.0.0.1' ||
        h == '::1' ||
        h == '[::1]');
  }

  @override
  Future<String> complete(String systemPrompt, String userText,
      {int maxTokens = 1024,
      Duration timeout = const Duration(seconds: 3)}) async {
    final http.Response r;
    try {
      r = await client
          .post(Uri.parse('$baseUrl/chat/completions'),
              headers: {
                'content-type': 'application/json',
                if (apiKey != null) 'authorization': 'Bearer $apiKey',
              },
              body: jsonEncode({
                'model': model,
                'temperature': 0,
                'max_tokens': maxTokens,
                'messages': [
                  {'role': 'system', 'content': systemPrompt},
                  {'role': 'user', 'content': userText},
                ],
              }))
          .timeout(timeout);
    } on TimeoutException {
      throw const PolishException('timeout');
    }
    if (r.statusCode == 429) {
      throw const PolishException('rate limited', rateLimited: true);
    }
    if (r.statusCode != 200) throw PolishException('http ${r.statusCode}');
    final t = jsonDecode(r.body)['choices']?[0]?['message']?['content'];
    if (t is! String) throw const PolishException('malformed response');
    return t.trim();
  }
}
