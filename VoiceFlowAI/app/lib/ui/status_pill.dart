import 'package:flutter/scheduler.dart';
import 'package:material_ui/material_ui.dart';
import '../l10n/app_localizations.dart';
import '../state/app_controller.dart';
import '../state/dictation_state.dart';
import '../theme.dart';

/// The status pill (spec §9.3 / §9.2). State is never colour alone: every state
/// has an icon AND text. This is the in-window rendering; the native
/// click-through overlay window arrives with the hotkey slice.
class StatusPill extends StatefulWidget {
  const StatusPill({super.key, required this.controller, this.onAction, this.onUndo});
  final AppController controller;
  final void Function(NoticeKind)? onAction;
  final VoidCallback? onUndo;

  @override
  State<StatusPill> createState() => _StatusPillState();
}

class _StatusPillState extends State<StatusPill> with SingleTickerProviderStateMixin {
  late final Ticker _ticker;
  int _shownSecond = -1;

  @override
  void initState() {
    super.initState();
    _ticker = createTicker((_) {
      final s = widget.controller.listeningFor.elapsed.inSeconds;
      if (s != _shownSecond) setState(() => _shownSecond = s);
    });
    widget.controller.addListener(_sync);
    _sync();
  }

  void _sync() {
    final listening = widget.controller.state == DictationUiState.listening;
    if (listening && !_ticker.isActive) _ticker.start();
    if (!listening && _ticker.isActive) _ticker.stop();
    if (mounted) setState(() {});
  }

  @override
  void dispose() {
    widget.controller.removeListener(_sync);
    _ticker.dispose();
    super.dispose();
  }

  String _mmss(Duration d) =>
      '${d.inMinutes.toString().padLeft(2, '0')}:${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  @override
  Widget build(BuildContext context) {
    final t = AppLocalizations.of(context);
    final c = widget.controller;
    final cs = Theme.of(context).colorScheme;
    final reduceMotion = MediaQuery.of(context).disableAnimations;

    Color bg = cs.surfaceContainerHighest, fg = cs.onSurface;
    Widget lead;
    String text;
    Widget? trailing;

    switch (c.state) {
      case DictationUiState.idle:
        lead = const Icon(Icons.mic_none, size: 20);
        text = t.stateIdle;
      case DictationUiState.listening:
        bg = cs.primaryContainer;
        fg = cs.onPrimaryContainer;
        lead = const Icon(Icons.mic, size: 20);
        text = t.stateListening;
        trailing = Row(mainAxisSize: MainAxisSize.min, children: [
          _Bars(level: c.level, animate: !reduceMotion, color: fg),
          const SizedBox(width: 8),
          Text(_mmss(c.listeningFor.elapsed)),
        ]);
      case DictationUiState.processing:
        lead = const _Spinner();
        text = t.stateProcessing;
      case DictationUiState.polishing:
        lead = const _Spinner();
        text = t.statePolishing;
      case DictationUiState.inserted:
        lead = const Icon(Icons.check_circle_outline, size: 20);
        text = t.stateInserted(c.lastWordCount);
        trailing = TextButton(onPressed: widget.onUndo, child: Text(t.undo));
      case DictationUiState.notice:
        final k = c.notice!;
        bg = const Color(0xFFFFF3CD); // amber, always paired with icon + text
        fg = const Color(0xFF5C4400);
        lead = const Icon(Icons.warning_amber_rounded, size: 20);
        text = _noticeText(t, k);
        if (k.hasAction) {
          trailing = TextButton(
            onPressed: () => widget.onAction?.call(k),
            style: TextButton.styleFrom(foregroundColor: fg),
            child: Text(_actionText(t, k)),
          );
        }
    }

    // Live region: changes of the (single) text inside are announced; buttons inside
    // (Undo / notice action) stay reachable because children are NOT excluded.
    return Semantics(
      liveRegion: true,
      container: true,
      child: Container(
        constraints: const BoxConstraints(minWidth: 240, minHeight: 44),
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
        decoration: BoxDecoration(
          color: bg,
          borderRadius: BorderRadius.circular(999),
          border: Border.all(color: cs.outlineVariant),
        ),
        child: DefaultTextStyle.merge(
          style: TextStyle(color: fg),
          child: IconTheme.merge(
            data: IconThemeData(color: fg),
            child: Wrap(
              alignment: WrapAlignment.center,
              crossAxisAlignment: WrapCrossAlignment.center,
              spacing: 8,
              runSpacing: 4,
              children: [
                lead,
                Text(text),
                if (c.state == DictationUiState.listening)
                  Text(t.profileLabel(c.profile.name),
                      style: Theme.of(context).textTheme.labelSmall),
                ?trailing,
              ],
            ),
          ),
        ),
      ),
    );
  }

  static String _noticeText(AppLocalizations t, NoticeKind k) => switch (k) {
        NoticeKind.noSpeech => t.noticeNoSpeech,
        NoticeKind.noMicrophone => t.noticeNoMicrophone,
        NoticeKind.modelMissing => t.noticeModelMissing,
        NoticeKind.insertFailed => t.noticeInsertFailed,
        NoticeKind.adminWindow => t.noticeAdminWindow,
        NoticeKind.passwordField => t.noticePasswordField,
        NoticeKind.cloudLimit => t.noticeCloudLimit,
      };

  static String _actionText(AppLocalizations t, NoticeKind k) => switch (k) {
        NoticeKind.noMicrophone => t.actionOpenSettings,
        NoticeKind.modelMissing => t.actionDownload,
        _ => t.actionCopy,
      };
}

class _Spinner extends StatelessWidget {
  const _Spinner();
  @override
  Widget build(BuildContext context) => const SizedBox(
      width: 18, height: 18, child: CircularProgressIndicator(strokeWidth: 2));
}

class _Bars extends StatelessWidget {
  const _Bars({required this.level, required this.animate, required this.color});
  final double level;
  final bool animate;
  final Color color;
  @override
  Widget build(BuildContext context) {
    const heights = [0.5, 0.8, 1.0, 0.8, 0.5];
    final base = animate ? level : 0.5; // reduced motion: static bars
    return SizedBox(
      height: 20,
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        for (final h in heights)
          Container(
            width: 3,
            height: 4 + 16 * (h * (0.3 + 0.7 * base)).clamp(0, 1),
            margin: const EdgeInsets.symmetric(horizontal: 1),
            decoration:
                BoxDecoration(color: color, borderRadius: BorderRadius.circular(kRadius)),
          ),
      ]),
    );
  }
}
