import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/state/app_controller.dart';
import 'package:voiceflow_app/state/per_app_profiles.dart';

import 'helpers.dart';

void main() {
  test('remembers the profile chosen while an app was focused (case-insensitive), persists via callback', () {
    final saved = <Map<String, String>>[];
    final p = PerAppProfiles({}, onChanged: saved.add);
    p.remember('Slack.EXE', 'casual');
    expect(p.profileFor('slack.exe'), 'casual');
    expect(saved.single, {'slack.exe': 'casual'});
    p.remember('slack.exe', 'casual'); // unchanged: no write
    expect(saved.length, 1);
    p.remember('slack.exe', 'business');
    expect(p.profileFor('slack.exe'), 'business');
  });

  test('our own window and unknown apps are never remembered', () {
    final saved = <Map<String, String>>[];
    final p = PerAppProfiles({}, onChanged: saved.add);
    p.remember('voiceflow_app.exe', 'casual');
    p.remember(null, 'casual');
    expect(p.all, isEmpty);
    expect(saved, isEmpty);
    expect(p.profileFor(null), isNull);
  });

  test('loads previous choices', () {
    final p = PerAppProfiles({
      'winword.exe': 'professional',
    }, onChanged: (_) {});
    expect(p.profileFor('WINWORD.EXE'), 'professional');
  });

  testWidgets(
    'controller: choosing a profile in app A, then switching to app B, then back to A',
    (t) async {
      final c = await makeController(t);
      var fg = 'slack.exe';
      c.foregroundApp = () => fg;
      c.perApp = PerAppProfiles({}, onChanged: (_) {});

      c.profile = c.assets.profiles.firstWhere(
        (p) => p.id == 'casual',
      ); // chosen while in Slack
      expect(c.perApp!.profileFor('slack.exe'), 'casual');

      fg = 'winword.exe'; // a different app, never configured
      c.resolveForForeground();
      expect(
        c.profile.id,
        'casual',
        reason: 'no memory for Word: keep the current profile',
      );

      c.profile = c.assets.profiles.firstWhere(
        (p) => p.id == 'professional',
      ); // chosen in Word
      fg = 'slack.exe';
      c.resolveForForeground();
      expect(
        c.profile.id,
        'casual',
        reason: 'back in Slack: its remembered profile returns',
      );
      fg = 'winword.exe';
      c.resolveForForeground();
      expect(c.profile.id, 'professional');
    },
  );

  testWidgets('resolving does not itself write a new memory', (t) async {
    final c = await makeController(t);
    var writes = 0;
    c.foregroundApp = () => 'slack.exe';
    c.perApp = PerAppProfiles({
      'slack.exe': 'casual',
    }, onChanged: (_) => writes++);
    c.resolveForForeground();
    expect(c.profile.id, 'casual');
    expect(writes, 0);
  });

  testWidgets(
    'without the hooks the profile logic is unchanged (Android / tests)',
    (t) async {
      final AppController c = await makeController(t);
      c.profile = c.assets.profiles.first;
      c.resolveForForeground();
      expect(c.profile.id, c.assets.profiles.first.id);
    },
  );
}
