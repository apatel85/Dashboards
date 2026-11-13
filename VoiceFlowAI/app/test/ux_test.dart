import 'package:flutter_test/flutter_test.dart';
import 'package:material_ui/material_ui.dart';
import 'package:voiceflow_app/state/app_controller.dart';
import 'package:voiceflow_app/state/dictation_service.dart';
import 'package:voiceflow_app/state/dictation_state.dart';

import 'helpers.dart';

import 'package:voiceflow_app/ui/shell.dart';
import 'package:voiceflow_app/ui/status_pill.dart';

void main() {
  group('status pill states (spec 9.2): icon + text, never colour alone', () {
    testWidgets('idle', (t) async {
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c)));
      expect(find.text('Ready'), findsOneWidget);
      expect(find.byIcon(Icons.mic_none), findsOneWidget);
    });

    testWidgets('listening shows text, timer, profile name', (t) async {
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c)));
      c.startListening();
      await t.pump();
      expect(find.text('Listening…'), findsOneWidget);
      expect(find.byIcon(Icons.mic), findsOneWidget);
      expect(find.text('00:00'), findsOneWidget);
      expect(find.text('Profile: Business'), findsOneWidget);
      c.reset();
      await t.pump();
    });

    testWidgets('processing then polishing', (t) async {
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c)));
      c.startProcessing();
      await t.pump();
      expect(find.text('Transcribing…'), findsOneWidget);
      expect(find.byType(CircularProgressIndicator), findsOneWidget);
      c.startPolishing();
      await t.pump();
      expect(find.text('Polishing…'), findsOneWidget);
    });

    testWidgets('inserted shows word count and Undo (plural + singular)', (
      t,
    ) async {
      final c = await makeController(t);
      var undone = false;
      await t.pumpWidget(
        host(StatusPill(controller: c, onUndo: () => undone = true)),
      );
      c.markInserted(List.filled(42, 'word').join(' '));
      await t.pump();
      expect(find.text('✓ 42 words'), findsOneWidget);
      await t.tap(find.text('Undo'));
      expect(undone, isTrue);
      c.markInserted('hello');
      await t.pump();
      expect(find.text('✓ 1 word'), findsOneWidget);
      c.reset();
    });

    testWidgets('inserted state clears itself after 4 s', (t) async {
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c)));
      c.markInserted('hello there');
      await t.pump();
      await t.pump(const Duration(seconds: 4, milliseconds: 100));
      expect(c.state, DictationUiState.idle);
    });
  });

  group('notices use the exact copy from spec 9.2', () {
    const copy = {
      NoticeKind.noSpeech: "Didn't catch that",
      NoticeKind.noMicrophone: 'No microphone found',
      NoticeKind.modelMissing: 'Speech model not installed',
      NoticeKind.insertFailed: "Couldn't type here. Text saved.",
      NoticeKind.adminWindow:
          'This window needs VoiceFlow run as admin. Text saved.',
      NoticeKind.passwordField: 'Dictation is off in password fields',
      NoticeKind.cloudLimit: 'Free limit reached. Used on-device cleanup.',
    };
    const actions = {
      NoticeKind.noMicrophone: 'Open settings',
      NoticeKind.modelMissing: 'Download',
      NoticeKind.insertFailed: 'Copy',
      NoticeKind.adminWindow: 'Copy',
    };
    for (final k in NoticeKind.values) {
      testWidgets(k.name, (t) async {
        final c = await makeController(t);
        NoticeKind? got;
        await t.pumpWidget(
          host(StatusPill(controller: c, onAction: (x) => got = x)),
        );
        c.showNotice(k);
        await t.pump();
        expect(find.text(copy[k]!), findsOneWidget);
        expect(find.byIcon(Icons.warning_amber_rounded), findsOneWidget);
        if (actions.containsKey(k)) {
          await t.tap(find.text(actions[k]!));
          expect(got, k);
        } else {
          expect(find.byType(TextButton), findsNothing);
        }
        await t.pump(const Duration(seconds: 6, milliseconds: 100));
        expect(c.state, DictationUiState.idle);
      });
    }
  });

  testWidgets('Listening renders within 100 ms of the trigger (spec 9.8)', (
    t,
  ) async {
    final c = await makeController(t);
    await t.pumpWidget(host(StatusPill(controller: c)));
    final sw = Stopwatch()..start();
    c.startListening(); // synchronous: state is set before any audio starts
    await t.pump(const Duration(milliseconds: 100));
    expect(find.text('Listening…'), findsOneWidget);
    expect(
      sw.elapsedMilliseconds,
      lessThan(100),
      reason: 'state change + frame must not wait on audio',
    );
    c.reset();
    await t.pump();
  });

  group('Home page', () {
    testWidgets('empty state tells you what to do next', (t) async {
      size(t);
      final c = await makeController(t);
      await t.pumpWidget(host(AppShell(controller: c)));
      expect(
        find.text('No dictations yet. Hold F9 and speak.'),
        findsOneWidget,
      );
      expect(find.textContaining('stay on this device'), findsOneWidget);
    });

    testWidgets(
      'Try it runs the real formatter (Business, then Professional)',
      (t) async {
        size(t);
        final c = await makeController(t);
        await t.pumpWidget(host(AppShell(controller: c)));
        await t.enterText(
          find.byType(TextField),
          'um we shipped twelve features',
        );
        await t.pump();
        expect(
          t.widget<SelectableText>(find.byKey(const Key('tryit-output'))).data,
          'We shipped 12 features.',
        );
        await t.tap(find.widgetWithText(ChoiceChip, 'Professional'));
        await t.enterText(
          find.byType(TextField),
          'the patient dont have any allergies',
        );
        await t.pump();
        expect(
          t.widget<SelectableText>(find.byKey(const Key('tryit-output'))).data,
          'The patient do not have any allergies.',
        );
      },
    );

    testWidgets('recent list shows the last 3 only', (t) async {
      size(t);
      final c = await makeController(t);
      for (final w in ['one a', 'two b', 'three c', 'four d']) {
        c.markInserted(w);
      }
      await t.pumpWidget(host(AppShell(controller: c)));
      expect(find.text('four d'), findsOneWidget);
      expect(find.text('one a'), findsNothing);
      expect(c.recent.length, 3);
      c.reset();
    });
  });

  testWidgets('Style page shows before/after from the on-device formatter', (
    t,
  ) async {
    size(t);
    final c = await makeController(t);
    await t.pumpWidget(host(AppShell(controller: c)));
    await t.tap(find.text('Style').first);
    await t.pumpAndSettle();
    expect(
      find.text('Hi John, thanks for the update. Can we meet Thursday?'),
      findsOneWidget,
    );
    expect(
      find.text('So I was thinking we could grab lunch tomorrow.'),
      findsOneWidget,
    );
    await t.tap(find.text('Make default').first);
    await t.pump();
    expect(c.profile.id, isNot('business'));
  });

  testWidgets('unbuilt pages say so honestly', (t) async {
    size(t);
    final c = await makeController(t);
    await t.pumpWidget(host(AppShell(controller: c)));
    await t.tap(find.text('Settings').first);
    await t.pumpAndSettle();
    expect(find.textContaining('Not built yet'), findsOneWidget);
  });

  group('accessibility', () {
    testWidgets('Home at 200% text scale does not overflow', (t) async {
      size(t, const Size(1000, 700));
      final c = await makeController(t);
      await t.pumpWidget(host(AppShell(controller: c), textScale: 2));
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    });

    testWidgets('pill at 200% text scale in a narrow window', (t) async {
      size(t, const Size(360, 640));
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c), textScale: 2));
      c.showNotice(NoticeKind.adminWindow);
      await t.pump();
      expect(t.takeException(), isNull);
      c.reset();
    });

    testWidgets('reduced motion renders listening without animation', (
      t,
    ) async {
      final c = await makeController(t);
      await t.pumpWidget(host(StatusPill(controller: c), reduceMotion: true));
      c.startListening();
      await t.pump();
      expect(find.text('Listening…'), findsOneWidget);
      expect(t.takeException(), isNull);
      c.reset();
    });

    testWidgets('dark theme builds', (t) async {
      size(t);
      final c = await makeController(t);
      await t.pumpWidget(
        host(AppShell(controller: c), brightness: Brightness.dark),
      );
      await t.pumpAndSettle();
      expect(t.takeException(), isNull);
    });

    testWidgets('state is announced to screen readers', (t) async {
      final c = await makeController(t);
      final h = t.ensureSemantics();
      await t.pumpWidget(host(StatusPill(controller: c)));
      c.startProcessing();
      await t.pump();
      expect(find.bySemanticsLabel('Transcribing…'), findsOneWidget);
      h.dispose();
    });
  });

  testWidgets('Home shows a Record button that starts and stops dictation', (
    t,
  ) async {
    size(t);
    final c = await makeController(t);
    final calls = <String>[];
    final svc = _FakeService(c, calls);
    await t.pumpWidget(host(AppShell(controller: c, service: svc)));
    expect(find.text('Record'), findsOneWidget);
    await t.tap(find.text('Record'));
    await t.pump();
    expect(calls, ['toggle']);
    expect(c.state, DictationUiState.listening);
    expect(find.text('Stop'), findsOneWidget);
    c.reset();
  });
}

class _FakeService implements DictationService {
  _FakeService(this.c, this.calls);
  final AppController c;
  final List<String> calls;
  @override
  Future<void> toggle() async {
    calls.add('toggle');
    c.startListening();
  }

  @override
  dynamic noSuchMethod(Invocation i) => null;
}
