// Live check of the deployed polish function, with the exact URL and public key the app ships.
// Usage (from packages/core): dart run tool/polish_live_check.dart <url> <anonKey>
// Exit 0 only if the function answered with polished text. Says plainly what is wrong otherwise.
import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:voiceflow_core/voiceflow_core.dart';

Future<void> main(List<String> a) async {
  if (a.length < 2 || a[0].isEmpty || a[1].isEmpty) {
    stderr.writeln('usage: polish_live_check <functionUrl> <anonKey>');
    exit(2);
  }
  final client = http.Client();
  final engine = ProxyPolishAdapter(client, functionUrl: a[0], anonKey: a[1]);
  try {
    final out = await engine.complete(
      'Repeat the user text exactly, with correct punctuation and capital letters. Output only the text.',
      'hello this is a test of the polish service',
      timeout: const Duration(seconds: 12),
    );
    stdout.writeln('POLISH_LIVE_OK text="$out"');
    if (out.trim().isEmpty) {
      stdout.writeln('POLISH_LIVE_FAIL empty answer');
      exit(1);
    }
  } on PolishException catch (e) {
    final m = e.message;
    final why = m == 'http 503'
        ? 'the function is deployed but has no provider secret (GEMINI_API_KEY etc.) set'
        : m == 'http 401' || m == 'http 403'
            ? 'the public key was rejected (wrong or rotated key)'
            : m == 'http 404'
                ? 'the function is not deployed at this address'
                : e.rateLimited
                    ? 'rate limited (try again later)'
                    : m == 'timeout'
                        ? 'no answer within 12 s'
                        : 'unexpected answer ($m)';
    stdout.writeln('POLISH_LIVE_FAIL $why');
    // The function's own explanation: provider names and status codes only, never keys or text.
    try {
      final r = await client
          .post(Uri.parse(a[0]),
              headers: {
                'content-type': 'application/json',
                'apikey': a[1],
                'authorization': 'Bearer ${a[1]}',
              },
              body: '{"system":"Repeat the text.","text":"hello"}')
          .timeout(const Duration(seconds: 12));
      stdout.writeln(
          'POLISH_LIVE_DETAIL http ${r.statusCode} ${r.body.length > 300 ? r.body.substring(0, 300) : r.body}');
    } catch (_) {}
    exit(1);
  } catch (e) {
    stdout.writeln('POLISH_LIVE_FAIL could not connect (${e.runtimeType})');
    exit(1);
  } finally {
    client.close();
  }
}
