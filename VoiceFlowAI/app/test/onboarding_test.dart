import 'dart:async';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/audio/mic.dart';
import 'package:voiceflow_app/state/onboarding_controller.dart';
import 'package:voiceflow_app/state/settings_store.dart';
import 'package:voiceflow_app/ui/onboarding_page.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'helpers.dart';

class FakeMic implements MicProbe {
  bool allow = true;
  List<MicDevice> devs = const [
    MicDevice('a', 'Desk mic'),
    MicDevice('b', 'Headset'),
  ];
  final levelsCtl = StreamController<double>.broadcast();
  String? lastDevice;
  @override
  Future<bool> requestPermission() async => allow;
  @override
  Future<List<MicDevice>> devices() async => devs;
  @override
  Stream<double> levels(String? deviceId) {
    lastDevice = deviceId;
    return levelsCtl.stream;
  }
}

class FakeInstaller implements ModelInstallerPort {
  FakeInstaller({this.installed = false});
  @override
  bool installed;
  @override
  int get sizeMb => 160;
  int calls = 0;
  Object? failWith;
  Completer<void>? gate; // hold the download open mid-way
  @override
  Future<void> install({ModelProgress? onProgress, CancelToken? cancel}) async {
    calls++;
    onProgress?.call(ModelPhase.downloading, 50, 100);
    if (gate != null) {
      while (!gate!.isCompleted) {
        await Future<void>.delayed(const Duration(milliseconds: 5));
        if (cancel?.cancelled ?? false) throw const ModelCancelled();
      }
    }
    if (failWith != null) throw failWith!;
    onProgress?.call(ModelPhase.verifying, 1, 1);
    onProgress?.call(ModelPhase.extracting, 1, 1);
    installed = true;
    onProgress?.call(ModelPhase.done, 1, 1);
  }
}

Future<(OnboardingController, FakeMic, FakeInstaller, List<int>)> mount(
  WidgetTester t, {
  FakeInstaller? inst,
  FakeMic? mic,
}) async {
  size(t);
  final m = mic ?? FakeMic();
  final i = inst ?? FakeInstaller();
  final finished = <int>[];
  final c = OnboardingController(
    mic: m,
    installer: i,
    onFinished: () => finished.add(1),
  );
  addTearDown(c.dispose);
  await t.pumpWidget(host(OnboardingPage(controller: c)));
  return (c, m, i, finished);
}

void main() {
  testWidgets('step 1: welcome + privacy promise, no Back, Next works', (
    t,
  ) async {
    final (c, _, _, _) = await mount(t);
    expect(find.text('Step 1 of 4'), findsOneWidget);
    expect(find.textContaining('stay on this device'), findsOneWidget);
    expect(find.text('Back'), findsNothing);
    await t.tap(find.text('Next'));
    await t.pump();
    expect(c.step, 1);
    expect(find.text('Step 2 of 4'), findsOneWidget);
  });

  testWidgets(
    'step 2: allow mic, pick a device, live level meter follows the mic',
    (t) async {
      final (c, m, _, _) = await mount(t);
      c.next();
      await t.pump();
      await t.tap(find.text('Allow microphone'));
      await t.pumpAndSettle();
      expect(find.text('Desk mic'), findsWidgets);
      final bar = find.byKey(const Key('mic-level'));
      expect(t.widget<LinearProgressIndicator>(bar).value, 0);
      m.levelsCtl.add(0.7);
      await t.pump(); // deliver the stream event
      await t.pump(); // draw the frame it triggered
      expect(t.widget<LinearProgressIndicator>(bar).value, 0.7);
      c.selectDevice('b');
      await t.pump();
      expect(m.lastDevice, 'b');
    },
  );

  testWidgets(
    'step 2: denied permission explains the fix and still lets you continue',
    (t) async {
      final (c, _, _, _) = await mount(t, mic: FakeMic()..allow = false);
      c.next();
      await t.pump();
      await t.tap(find.text('Allow microphone'));
      await t.pumpAndSettle();
      expect(find.textContaining('Microphone access is off'), findsOneWidget);
      expect(c.canNext, isTrue, reason: 'never trap a user without a mic');
    },
  );

  testWidgets('step 2: no devices -> "No microphone found"', (t) async {
    final (c, _, _, _) = await mount(t, mic: FakeMic()..devs = const []);
    c.next();
    await t.pump();
    await t.tap(find.text('Allow microphone'));
    await t.pumpAndSettle();
    expect(find.text('No microphone found'), findsOneWidget);
  });

  testWidgets(
    'step 3: Next is blocked until the model is installed; progress is shown',
    (t) async {
      final inst = FakeInstaller()..gate = Completer<void>();
      final (c, _, _, _) = await mount(t, inst: inst);
      c
        ..next()
        ..next();
      await t.pump();
      expect(
        find.text(
          'One-time download, 160 MB. After this, dictation works offline.',
        ),
        findsOneWidget,
      );
      expect(
        t
            .widget<FilledButton>(find.widgetWithText(FilledButton, 'Next'))
            .onPressed,
        isNull,
      );
      await t.tap(find.text('Download'));
      await t.pump(const Duration(milliseconds: 20));
      expect(find.text('Downloading… 50%'), findsOneWidget);
      expect(
        t
            .widget<LinearProgressIndicator>(
              find.byKey(const Key('model-progress')),
            )
            .value,
        0.5,
      );
      expect(c.canBack, isFalse, reason: 'cannot leave mid-download');
      inst.gate!.complete();
      await t.pumpAndSettle();
      expect(find.text('Speech model installed'), findsOneWidget);
      expect(c.canNext, isTrue);
    },
  );

  testWidgets('step 3: pause keeps progress; Download resumes and finishes', (
    t,
  ) async {
    final inst = FakeInstaller()..gate = Completer<void>();
    final (c, _, _, _) = await mount(t, inst: inst);
    c
      ..next()
      ..next();
    await t.pump();
    await t.tap(find.text('Download'));
    await t.pump(const Duration(milliseconds: 20));
    await t.tap(find.text('Pause'));
    await t.pump(const Duration(milliseconds: 30));
    expect(find.text('Paused. Your progress is saved.'), findsOneWidget);
    expect(find.text('Download'), findsOneWidget);
    inst.gate = null; // network is fine now
    await t.tap(find.text('Download'));
    await t.pumpAndSettle();
    expect(inst.calls, 2);
    expect(find.text('Speech model installed'), findsOneWidget);
  });

  testWidgets(
    'step 3: integrity failure and generic failure each explain themselves and allow retry',
    (t) async {
      final inst = FakeInstaller()
        ..failWith = const ModelIntegrityException('bad hash');
      final (c, _, _, _) = await mount(t, inst: inst);
      c
        ..next()
        ..next();
      await t.pump();
      await t.tap(find.text('Download'));
      await t.pumpAndSettle();
      expect(find.textContaining('failed its safety check'), findsOneWidget);
      expect(find.text('Try again'), findsOneWidget);
      inst.failWith = const SocketException('offline');
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(find.textContaining('did not finish'), findsOneWidget);
      inst.failWith = null;
      await t.tap(find.text('Try again'));
      await t.pumpAndSettle();
      expect(c.canNext, isTrue);
    },
  );

  testWidgets(
    'already-installed model shows as installed and Next is enabled',
    (t) async {
      final (c, _, _, _) = await mount(t, inst: FakeInstaller(installed: true));
      c
        ..next()
        ..next();
      await t.pump();
      expect(find.text('Speech model installed'), findsOneWidget);
      expect(c.canNext, isTrue);
    },
  );

  testWidgets(
    'last step: Skip exists only here, finishing fires onFinished once',
    (t) async {
      final (c, _, _, done) = await mount(
        t,
        inst: FakeInstaller(installed: true),
      );
      for (var i = 0; i < 2; i++) {
        expect(c.canSkip, isFalse);
        expect(find.text('Skip'), findsNothing);
        c.next();
        await t.pump();
      }
      c.next();
      await t.pump();
      expect(c.step, 3);
      expect(find.text('Skip'), findsOneWidget);
      expect(find.text('Step 4 of 4'), findsOneWidget);
      await t.tap(find.text("You're set"));
      await t.pump();
      expect(done.length, 1);
    },
  );

  testWidgets('onboarding at 200% text scale does not overflow', (t) async {
    size(t, const Size(800, 600));
    final c = OnboardingController(mic: FakeMic(), installer: FakeInstaller());
    addTearDown(c.dispose);
    await t.pumpWidget(host(OnboardingPage(controller: c), textScale: 2));
    for (var i = 0; i < 2; i++) {
      c.next();
      await t.pump();
      expect(t.takeException(), isNull);
    }
  });

  group('SettingsStore', () {
    late Directory tmp;
    setUp(() => tmp = Directory.systemTemp.createTempSync('vf_settings_'));
    tearDown(() => tmp.deleteSync(recursive: true));

    test('round-trips onboarding + mic, leaves no temp file', () async {
      final s = SettingsStore(tmp);
      final cfg = Settings()
        ..onboardingDone = true
        ..micDeviceId = 'dev-1'
        ..dictionary = ['Priya'];
      await s.save(cfg);
      final back = await s.load();
      expect(back.onboardingDone, isTrue);
      expect(back.micDeviceId, 'dev-1');
      expect(back.dictionary, ['Priya']);
      expect(File('${tmp.path}/settings.json.tmp').existsSync(), isFalse);
    });
    test('missing file -> defaults (cloud OFF)', () async {
      final back = await SettingsStore(tmp).load();
      expect(back.onboardingDone, isFalse);
      expect(back.cloudActive, isFalse);
    });
    test('corrupt file -> defaults, no crash', () async {
      File('${tmp.path}/settings.json').writeAsStringSync('{not json');
      expect((await SettingsStore(tmp).load()).onboardingDone, isFalse);
    });
    test('old v0 file migrates and never carries a stored key', () async {
      File('${tmp.path}/settings.json')
          .writeAsStringSync('{"profile":"casual","geminiKey":"SECRET"}');
      final back = await SettingsStore(tmp).load();
      expect(back.defaultProfileId, 'casual');
      expect(back.export().contains('SECRET'), isFalse);
    });
  });
}
