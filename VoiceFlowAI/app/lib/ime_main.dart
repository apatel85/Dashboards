// Dart entrypoint run by the Android keyboard's headless FlutterEngine.
import 'package:flutter/services.dart';
import 'package:flutter/widgets.dart';

import 'ime/ime_backend.dart';

@pragma('vm:entry-point')
void imeMain() {
  WidgetsFlutterBinding.ensureInitialized();
  const channel = MethodChannel('voiceflow/ime');
  Future<ImeBackend>? backend;
  channel.setMethodCallHandler((call) async {
    if (call.method == 'ping') return 'pong'; // answers before heavy init
    final b = await (backend ??= ImeBackend.create());
    return b.handle(call);
  });
}
