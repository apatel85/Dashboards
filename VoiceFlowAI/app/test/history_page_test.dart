import 'package:material_ui/material_ui.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:voiceflow_app/ui/history_page.dart';
import 'package:voiceflow_app/ui/shell.dart';
import 'package:voiceflow_app/state/settings_controller.dart';
import 'package:voiceflow_core/voiceflow_core.dart';

import 'helpers.dart';

void main() {
  late MemoryHistoryStorage mem;
  late HistoryStore store;
  late List<String> copied;

  setUp(() {
    mem = MemoryHistoryStorage();
    store = HistoryStore(mem);
    copied = [];
  });

  Future<void> mount(
    WidgetTester t, {
    SettingsController? settings,
    bool runAsyncLoad = true,
  }) async {
    size(t, const Size(900, 3000));
    final c = await makeController(t);
    await t.pumpWidget(
      host(
        HistoryPage(
          store: store,
          controller: c,
          settings: settings,
          copy: (s) async => copied.add(s),
        ),
      ),
    );
    await t.pumpAndSettle();
  }

  testWidgets('empty: says so', (t) async {
    await mount(t);
    expect(find.byKey(const Key('history-empty')), findsOneWidget);
    expect(
      t
          .widget<OutlinedButton>(find.byKey(const Key('history-copy-report')))
          .onPressed,
      isNull,
    );
  });

  testWidgets('shows what was heard next to what was typed', (t) async {
    await store.add(
      'We have to ship this by Friday.',
      'business',
      raw: 'um we gotta ship this by friday',
      app: 'com.slack',
      fallback: 'lost number 5',
    );
    await mount(t);
    expect(find.text('um we gotta ship this by friday'), findsOneWidget);
    expect(find.text('We have to ship this by Friday.'), findsOneWidget);
    expect(find.text('Professional'), findsWidgets);
    expect(find.text('com.slack'), findsOneWidget);
    expect(find.text('fell back: lost number 5'), findsOneWidget);
  });

  testWidgets('an entry from before raw text was kept says so', (t) async {
    mem.data =
        '{"v":1,"items":[{"at":"${DateTime.now().toIso8601String()}","text":"Old text.","profile":"casual"}]}';
    await mount(t);
    expect(
      find.textContaining('not saved: this entry is from before'),
      findsOneWidget,
    );
    expect(find.text('Old text.'), findsOneWidget);
  });

  testWidgets("re-running applies today's rules to the raw text", (t) async {
    // saved as if an older version had typed something different
    await store.add(
      'We want to meet at 1030.',
      'business',
      raw: 'we want to meet at ten thirty',
    );
    await mount(t);
    final rerun = find.byWidgetPredicate(
      (w) => w.key.toString().contains('history-rerun-'),
    );
    await t.tap(rerun);
    await t.pumpAndSettle();
    expect(find.textContaining('Different result with today'), findsOneWidget);
    expect(find.textContaining('10:30'), findsOneWidget);
  });

  testWidgets('re-running an unchanged entry says it is the same', (t) async {
    await store.add('Hello there friend.', 'casual', raw: 'hello there friend');
    await mount(t);
    await t.tap(
      find.byWidgetPredicate(
        (w) => w.key.toString().contains('history-rerun-'),
      ),
    );
    await t.pumpAndSettle();
    expect(find.text('Same result as when it was typed.'), findsOneWidget);
  });

  testWidgets(
    'copy report puts raw and typed text of every entry on the clipboard',
    (t) async {
      await store.add('One.', 'casual', raw: 'one');
      await store.add('Two.', 'business', raw: 'two um');
      await mount(t);
      await t.tap(find.byKey(const Key('history-copy-report')));
      await t.pumpAndSettle();
      expect(copied, hasLength(1));
      expect(copied.single, contains('HEARD: two um'));
      expect(copied.single, contains('TYPED: Two.'));
      expect(copied.single, contains('HEARD: one'));
      expect(copied.single, contains('Casual'));
    },
  );

  testWidgets('search finds text in the raw words too', (t) async {
    await store.add('Alpha.', 'casual', raw: 'alpha um');
    await store.add('Beta.', 'casual', raw: 'beta');
    await mount(t);
    await t.enterText(find.byKey(const Key('history-search')), 'um');
    await t.pumpAndSettle();
    expect(find.text('Alpha.'), findsOneWidget);
    expect(find.text('Beta.'), findsNothing);
  });

  testWidgets('clear asks first, then removes everything', (t) async {
    await store.add('One.', 'casual', raw: 'one');
    await mount(t);
    await t.tap(find.byKey(const Key('history-clear')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('history-clear-no')));
    await t.pumpAndSettle();
    expect(store.items, hasLength(1));
    await t.tap(find.byKey(const Key('history-clear')));
    await t.pumpAndSettle();
    await t.tap(find.byKey(const Key('history-clear-yes')));
    await t.pumpAndSettle();
    expect(store.items, isEmpty);
    expect(find.byKey(const Key('history-empty')), findsOneWidget);
  });

  testWidgets('the save switch turns saving off and on', (t) async {
    final s = Settings();
    final sc = SettingsController(s, () async {});
    addTearDown(sc.dispose);
    await mount(t, settings: sc);
    expect(s.historyEnabled, isTrue);
    await t.tap(find.byKey(const Key('history-save')));
    await t.pumpAndSettle();
    expect(s.historyEnabled, isFalse);
    expect(store.enabled, isFalse);
    await store.add('Not kept.', 'casual', raw: 'not kept');
    expect(store.items, isEmpty);
  });

  testWidgets('the History tab in the app shows this page', (t) async {
    size(t, const Size(900, 3000));
    final c = await makeController(t);
    await store.add('Shown.', 'casual', raw: 'shown');
    await t.pumpWidget(host(AppShell(controller: c, history: store)));
    await t.pumpAndSettle();
    await t.tap(find.text('History').first);
    await t.pumpAndSettle();
    expect(find.text('Shown.'), findsOneWidget);
    expect(find.text('shown'), findsOneWidget);
  });
}
