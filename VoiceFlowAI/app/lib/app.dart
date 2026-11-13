import 'package:flutter/foundation.dart' show ValueListenable, ValueNotifier;
import 'package:flutter_localizations/flutter_localizations.dart'
    show GlobalWidgetsLocalizations;
import 'package:material_ui/material_ui.dart';

import 'l10n/app_localizations.dart';
import 'state/app_controller.dart';
import 'state/dictation_service.dart';
import 'state/onboarding_controller.dart';
import 'theme.dart';
import 'ui/onboarding_page.dart';
import 'ui/shell.dart';

class VoiceFlowApp extends StatelessWidget {
  const VoiceFlowApp({
    super.key,
    required this.controller,
    this.service,
    this.onboarding,
    this.onboardingFinished,
  });
  final AppController controller;
  final DictationService? service;

  /// Non-null on first run. The app shows it until [onboardingFinished] becomes true.
  final OnboardingController? onboarding;
  final ValueListenable<bool>? onboardingFinished;

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
    home: ValueListenableBuilder<bool>(
      valueListenable: onboardingFinished ?? ValueNotifier(true),
      builder: (context, finished, _) => (onboarding == null || finished)
          ? AppShell(controller: controller, service: service)
          : OnboardingPage(
              controller: onboarding!,
              app: controller,
              service: service,
            ),
    ),
  );
}
