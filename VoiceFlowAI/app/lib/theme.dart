import 'package:material_ui/material_ui.dart';

/// Spec §9.7: one accent colour (answer 7, indigo), 12 px radius, system font,
/// light/dark following the OS.
const kAccent = Color(0xFF4F46E5);
const kRadius = 12.0;
const kFontFamily = 'Segoe UI Variable';
const kFontFallback = ['Segoe UI', 'Roboto', 'Arial'];

ThemeData buildTheme(Brightness b) {
  final scheme = ColorScheme.fromSeed(seedColor: kAccent, brightness: b);
  final shape = RoundedRectangleBorder(
    borderRadius: BorderRadius.circular(kRadius),
  );
  return ThemeData(
    useMaterial3: true,
    colorScheme: scheme,
    fontFamily: kFontFamily,
    fontFamilyFallback: kFontFallback,
    visualDensity: VisualDensity.standard,
    cardTheme: CardThemeData(
      elevation: 0,
      shape: shape.copyWith(side: BorderSide(color: scheme.outlineVariant)),
      margin: EdgeInsets.zero,
    ),
    inputDecorationTheme: InputDecorationTheme(
      border: OutlineInputBorder(borderRadius: BorderRadius.circular(kRadius)),
    ),
    filledButtonTheme: FilledButtonThemeData(
      style: FilledButton.styleFrom(shape: shape),
    ),
    outlinedButtonTheme: OutlinedButtonThemeData(
      style: OutlinedButton.styleFrom(shape: shape),
    ),
    navigationRailTheme: NavigationRailThemeData(
      backgroundColor: scheme.surfaceContainerLow,
      indicatorColor: scheme.primaryContainer,
    ),
  );
}
