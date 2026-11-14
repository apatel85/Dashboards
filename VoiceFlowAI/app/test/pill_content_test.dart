import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/l10n/app_localizations_en.dart';
import 'package:voiceflow_app/platform/windows/pill_window.dart';
import 'package:voiceflow_app/state/dictation_state.dart';

import 'helpers.dart';

void main() {
  final t = AppLocalizationsEn();

  testWidgets('hidden while idle; every other state has a glyph AND words', (
    tester,
  ) async {
    final c = await makeController(tester);
    expect(pillContent(c, t), isNull);

    c.startListening();
    var p = pillContent(c, t)!;
    expect(p.text, startsWith('●'));
    expect(p.text, contains('Listening…'));
    expect(p.text, contains('00:00'));
    expect(p.text, contains('Business'));

    c.startProcessing();
    expect(pillContent(c, t)!.text, '◌  Transcribing…');
    c.startPolishing();
    expect(pillContent(c, t)!.text, '◌  Polishing…');

    c.markInserted(List.filled(42, 'w').join(' '));
    p = pillContent(c, t)!;
    expect(p.text, contains('✓ 42 words'));
    expect(
      p.text,
      contains('Ctrl+Alt+Z'),
      reason: 'the pill is click-through, so say how to undo',
    );
    c.reset();
  });

  testWidgets(
    'notices are amber with a warning glyph and the exact spec copy',
    (tester) async {
      final c = await makeController(tester);
      c.showNotice(NoticeKind.adminWindow);
      final p = pillContent(c, t)!;
      expect(
        p.text,
        '⚠  This window needs VoiceFlow run as admin. Text saved.',
      );
      expect(p.bg, 0xFFF3CD);
      expect(p.fg, 0x5C4400);
      c.reset();
    },
  );

  testWidgets('Ctrl+Alt+P flash shows the new profile for 1.5 s then hides', (
    tester,
  ) async {
    final c = await makeController(tester);
    expect(c.profile.id, 'business');
    c.cycleProfile();
    expect(c.profile.id, 'professional');
    expect(pillContent(c, t)!.text, 'Profile: Professional');
    await tester.pump(const Duration(milliseconds: 1600));
    expect(pillContent(c, t), isNull);
  });

  testWidgets('cycling wraps around the four profiles', (tester) async {
    final c = await makeController(tester);
    final seen = <String>[];
    for (var i = 0; i < 4; i++) {
      c.cycleProfile();
      seen.add(c.profile.id);
    }
    expect(seen, ['professional', 'ai_prompting', 'casual', 'business']);
    await tester.pump(const Duration(milliseconds: 1600));
  });
}
