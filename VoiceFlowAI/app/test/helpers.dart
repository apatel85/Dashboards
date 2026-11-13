import 'package:flutter_localizations/flutter_localizations.dart'
    show GlobalWidgetsLocalizations;
import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/l10n/app_localizations.dart';
import 'package:voiceflow_app/state/app_controller.dart';
import 'package:voiceflow_app/state/assets_loader.dart';
import 'package:voiceflow_app/theme.dart';

Future<AppController> makeController(WidgetTester t) async {
  final assets = await t.runAsync(AppAssets.load);
  final c = AppController(assets!);
  addTearDown(c.dispose);
  return c;
}

Widget host(
  Widget child, {
  double textScale = 1,
  bool reduceMotion = false,
  Brightness brightness = Brightness.light,
}) {
  return MaterialApp(
    theme: buildTheme(brightness),
    localizationsDelegates: [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    builder: (context, w) => MediaQuery(
      data: MediaQuery.of(context).copyWith(
        textScaler: TextScaler.linear(textScale),
        disableAnimations: reduceMotion,
      ),
      child: w!,
    ),
    home: Scaffold(body: Center(child: child)),
  );
}

void size(WidgetTester t, [Size s = const Size(1000, 700)]) {
  t.view.physicalSize = s;
  t.view.devicePixelRatio = 1;
  addTearDown(t.view.resetPhysicalSize);
  addTearDown(t.view.resetDevicePixelRatio);
}
