import 'package:flutter/widgets.dart';

import 'app.dart';
import 'platform/desktop_shell.dart';
import 'state/app_controller.dart';
import 'state/assets_loader.dart';

// Keeps the keyboard's headless entrypoint (imeMain) in the compiled program;
// without this import, release builds omit the library and the IME engine
// fails with "library 'package:voiceflow_app/ime_main.dart' not found".
// ignore: unused_import
import 'ime_main.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final controller = AppController(await AppAssets.load());
  await DesktopShell.init(controller); // no-op off Windows
  runApp(VoiceFlowApp(controller: controller));
}
