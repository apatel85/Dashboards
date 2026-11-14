import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/state/android_setup.dart';
import 'package:voiceflow_app/ui/android_setup_page.dart';
import 'package:voiceflow_app/ui/shell.dart';

import 'helpers.dart';
import 'onboarding_test.dart' show FakeInstaller, FakeMic;

class FakePlatform implements SetupPlatform {
  bool enabled = false, selected = false, mic = false;
  int settingsOpened = 0, pickerShown = 0;
  @override
  Future<bool> keyboardEnabled() async => enabled;
  @override
  Future<bool> keyboardSelected() async => selected;
  @override
  Future<bool> micGranted() async => mic;
  @override
  Future<void> openKeyboardSettings() async => settingsOpened++;
  @override
  Future<void> showKeyboardPicker() async => pickerShown++;
}

void main() {
  test('steps come in order and follow the OS state', () async {
    final p = FakePlatform();
    final inst = FakeInstaller();
    final mic = FakeMic();
    final c = AndroidSetupController(platform: p, mic: mic, installer: inst);
    await c.refresh();
    expect(c.current, SetupStep.enable);
    p.enabled = true;
    await c.refresh();
    expect(c.current, SetupStep.select);
    // "selected" only counts once enabled (a stale selection must not skip a step)
    p.enabled = false;
    p.selected = true;
    await c.refresh();
    expect(c.selected, false);
    p.enabled = true;
    await c.refresh();
    expect(c.current, SetupStep.mic);
    p.mic = true;
    await c.refresh();
    expect(c.current, SetupStep.model);
    await c.download();
    expect(c.current, SetupStep.done);
    expect(c.allDone, true);
    c.dispose();
  });

  test('allowMic asks the OS then re-reads the grant', () async {
    final p = FakePlatform()
      ..enabled = true
      ..selected = true;
    final mic = FakeMic()..allow = false;
    final c = AndroidSetupController(
      platform: p,
      mic: mic,
      installer: FakeInstaller(),
    );
    await c.refresh();
    await c.allowMic();
    expect(c.micAsked, true);
    expect(c.micOk, false); // denied -> page explains how to fix it
    c.dispose();
  });

  testWidgets('page shows only the active step, ticks, and finishes', (
    t,
  ) async {
    size(t, const Size(400, 900));
    final p = FakePlatform();
    var finished = 0;
    final c = AndroidSetupController(
      platform: p,
      mic: FakeMic(),
      installer: FakeInstaller(),
      onFinished: () => finished++,
    );
    addTearDown(c.dispose);
    await t.pumpWidget(host(AndroidSetupPage(controller: c)));
    await t.pump();
    expect(find.byKey(const Key('btn-enable')), findsOneWidget);
    expect(find.byKey(const Key('btn-select')), findsNothing);

    await t.tap(find.byKey(const Key('btn-enable')));
    expect(p.settingsOpened, 1);
    p.enabled = true;
    await c.refresh(); // what resuming from system settings does
    await t.pump();
    expect(find.byKey(const Key('btn-select')), findsOneWidget);
    await t.tap(find.byKey(const Key('btn-select')));
    expect(p.pickerShown, 1);

    p.selected = true;
    p.mic = true;
    await c.refresh();
    await t.pump();
    expect(find.byKey(const Key('btn-model')), findsOneWidget);
    await t.runAsync(() async {
      await t.tap(find.byKey(const Key('btn-model')));
      await Future<void>.delayed(const Duration(milliseconds: 50));
    });
    await t.pump();
    expect(find.byKey(const Key('setup-try')), findsOneWidget);
    await t.tap(find.byKey(const Key('setup-finish')));
    expect(finished, 1);
  });

  testWidgets('phone width uses a bottom bar; wide uses the rail', (t) async {
    final ctl = await makeController(t);
    size(t, const Size(400, 800));
    await t.pumpWidget(host(AppShell(controller: ctl)));
    await t.pump();
    expect(find.byType(NavigationBar), findsOneWidget);
    expect(find.byType(NavigationRail), findsNothing);
    // five everyday pages, reachable and switchable
    expect(find.byType(NavigationDestination), findsNWidgets(5));
    expect(
      find.text('Packs'),
      findsWidgets,
      reason: 'phones can reach the Packs page',
    );
    await t.tap(find.byType(NavigationDestination).at(1));
    await t.pump();

    size(t, const Size(1000, 700));
    await t.pumpWidget(host(AppShell(controller: ctl)));
    await t.pump();
    expect(find.byType(NavigationRail), findsOneWidget);
  });
}
