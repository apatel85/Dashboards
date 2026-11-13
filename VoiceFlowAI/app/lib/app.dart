import 'package:flutter_localizations/flutter_localizations.dart'
    show GlobalWidgetsLocalizations;
import 'package:material_ui/material_ui.dart';

import 'l10n/app_localizations.dart';
import 'state/app_controller.dart';
import 'theme.dart';
import 'ui/shell.dart';

class VoiceFlowApp extends StatelessWidget {
  const VoiceFlowApp({super.key, required this.controller});
  final AppController controller;

  @override
  Widget build(BuildContext context) => MaterialApp(
    onGenerateTitle: (c) => AppLocalizations.of(c).appName,
    debugShowCheckedModeBanner: false,
    theme: buildTheme(Brightness.light),
    darkTheme: buildTheme(Brightness.dark),
    themeMode: ThemeMode.system,
    localizationsDelegates: [
      AppLocalizations.delegate,
      GlobalMaterialLocalizations.delegate,
      GlobalWidgetsLocalizations.delegate,
    ],
    supportedLocales: AppLocalizations.supportedLocales,
    home: AppShell(controller: controller),
  );
}
