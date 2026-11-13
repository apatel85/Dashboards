// Dart entrypoint run by the Android keyboard's headless FlutterEngine (spike S3).
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

@pragma('vm:entry-point')
void imeMain() {
  WidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('voiceflow/ime');
  LangData? lang;
  channel.setMethodCallHandler((call) async {
    switch (call.method) {
      case 'ping':
        return 'pong';
      case 'format':
        final args = Map<String, dynamic>.from(call.arguments as Map);
        lang ??= LangData.fromJsonString(
            await rootBundle.loadString('assets/lang/en.json'));
        final profile = Profile.fromJsonString(await rootBundle
            .loadString('assets/profiles/${args['profile'] ?? 'business'}.json'));
        return RuleFormatter(lang!).format(args['text'] as String, profile);
      default:
        throw MissingPluginException();
    }
  });
}
