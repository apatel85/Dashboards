import 'dart:typed_data';
import 'adapters/polish_chain.dart';
import 'history_store.dart';
import 'field_kind.dart';
import 'lang.dart';
import 'masker.dart';
import 'models.dart';
import 'pack.dart';
import 'polish_prompt.dart';
import 'polish_validator.dart';
import 'post_processor.dart';
import 'profile.dart';
import 'rule_formatter.dart';
import 'vad.dart';
import 'app_defaults.dart';
import 'text_context.dart';
import 'long_dictation.dart';
import 'voice_commands.dart';

class DictationOptions {
  final Profile profile;
  final List<DomainPack> packs;
  final List<String> dictionary;
  final Map<String, String> corrections;

  /// What we are typing into. Email / URL / number fields get literal text.
  final FieldKind fieldKind;

  /// AI Prompting only: layout and length behaviour (see [PromptStyle]).
  final PromptStyle promptStyle;

  /// Text around the cursor, so a dictation fits into its sentence (see [ContinuationFlow]).
  final TextContext surrounding;

  /// Cloud polish: send placeholders instead of names, numbers, dates and contact details.
  final bool maskCloud;

  /// Casual: expand "gonna" -> "going to" (the Settings switch).
  final bool spokenForms;

  /// Looks a profile up by id, so a spoken mode command ("professional mode ...") can switch the
  /// profile for this one dictation. Without it, mode commands are left in the text.
  final Profile? Function(String id)? profileById;
  DictationOptions withProfile(Profile p) => DictationOptions(p,
      packs: packs,
      dictionary: dictionary,
      corrections: corrections,
      fieldKind: fieldKind,
      promptStyle: promptStyle,
      surrounding: surrounding,
      maskCloud: maskCloud,
      spokenForms: spokenForms,
      profileById: profileById);

  const DictationOptions(this.profile,
      {this.packs = const [],
      this.dictionary = const [],
      this.corrections = const {},
      this.fieldKind = FieldKind.text,
      this.promptStyle = const PromptStyle(),
      this.surrounding = const TextContext(),
      this.maskCloud = false,
      this.spokenForms = true,
      this.profileById});
}

/// Capture is done by the caller; `run` takes the recorded PCM (spec §5.2).
/// Never throws: every failure becomes a [DictationResult].
class DictationPipeline {
  final LangData lang;
  final SttEngine stt;
  final TextSink sink;
  final PolishChain? polish;

  /// Lets the app switch polish on and off while running (settings change). Wins over [polish].
  final PolishChain? Function()? polishProvider;
  PolishChain? get _chain =>
      polishProvider != null ? polishProvider!() : polish;
  final HistoryStore? history;
  final RecoverSlot recover = RecoverSlot();
  final EnergyVad vad;
  late final RuleFormatter _fmt = RuleFormatter(lang);
  late final VoiceCommandParser _cmd = VoiceCommandParser(lang);
  late final PostProcessor _post = PostProcessor(lang);
  late final FieldFormatter _field = FieldFormatter(lang);
  late final List<(String, RegExp)> _modeCommands = [
    for (final c in (lang.raw['modeCommands'] as List? ?? const []))
      (
        c['profile'] as String,
        RegExp(c['pattern'] as String, caseSensitive: false)
      )
  ];
  late final PolishValidator _validator = PolishValidator(lang: lang);

  DictationPipeline(this.lang, this.stt, this.sink,
      {this.polish, this.polishProvider, this.history, EnergyVad? vad})
      : vad = vad ?? const EnergyVad();

  /// A dictation of any length: feed it audio while the person talks, then [runSession].
  late final Set<String> _common =
      lang.list('commonWords').map((e) => e.toLowerCase()).toSet();

  LongDictationSession startSession({List<String> hints = const []}) =>
      LongDictationSession(stt, vad: vad, hints: hints, commonWords: _common);

  Future<DictationResult> run(Uint8List pcm, DictationOptions o) {
    final s = startSession(hints: _hints(o))..add(pcm);
    return runSession(s, o);
  }

  List<String> _hints(DictationOptions o) => {
        ...o.dictionary,
        for (final p in o.packs) ...p.vocabulary,
      }.toList();

  Future<DictationResult> runSession(
      LongDictationSession session, DictationOptions o) async {
    String raw = '';
    if (o.fieldKind == FieldKind.password) {
      session.cancel();
      return const DictationResult(DictationStatus.passwordField);
    }
    try {
      session.hints = _hints(o);
      final r = await session.finish();
      raw = r.text.trim();
      if (r.speechSeconds <= 0 && raw.isEmpty) {
        return const DictationResult(DictationStatus.noSpeech);
      }
      if (raw.isEmpty) return const DictationResult(DictationStatus.noSpeech);
      final speechSecs = r.speechSeconds;
      if (speechSecs < 2 && lang.phantoms.contains(raw.toLowerCase().trim())) {
        return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
      }

      if (o.fieldKind != FieldKind.text) {
        // email / url / number: literal value, no voice commands, no polish, no pack edits
        final value = _field.format(raw, o.fieldKind);
        if (value.isEmpty) {
          return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
        }
        return await _insert(raw, value, false, o);
      }

      // A spoken mode at the start ("professional mode", "turn this into a prompt") switches the
      // style for this one dictation and is removed from the text (spec section 3).
      final lookup = o.profileById;
      if (lookup != null) {
        for (final c in _modeCommands) {
          final m = c.$2.firstMatch(raw);
          if (m == null) continue;
          final p = lookup(c.$1);
          if (p == null) break;
          o = o.withProfile(p);
          raw = raw.substring(m.end).trim();
          break;
        }
        if (raw.isEmpty) {
          return const DictationResult(DictationStatus.noSpeech);
        }
      }
      final segs = _cmd.parse(raw);
      if (segs.isEmpty) {
        return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
      }
      if (segs.length == 1 && segs.first is CommandSegment) {
        final k = (segs.first as CommandSegment).kind;
        if (k == CommandKind.undoPrevious) {
          await sink.undoLast();
          return DictationResult(DictationStatus.commandUndo,
              rawTranscript: raw);
        }
        if (k == CommandKind.discardUtterance) {
          return DictationResult(DictationStatus.discarded, rawTranscript: raw);
        }
      }
      final template = _template(raw, o.packs);
      if (template != null) return await _insert(raw, template, false, o);

      final allowCloud = o.packs.every((p) => p.cloudAllowed);
      final glossary = [
        ...o.dictionary,
        for (final p in o.packs) ...p.vocabulary,
      ];
      var polishUsed = false;
      final sb = StringBuffer();
      for (final s in segs) {
        switch (s) {
          case CommandSegment(:final kind):
            if (kind == CommandKind.newLine) sb.write('\n');
            if (kind == CommandKind.newParagraph) sb.write('\n\n');
          case TextSegment(:final text):
            final (t, used) = await _text(text, o, allowCloud, glossary);
            polishUsed |= used;
            sb.write(t);
          case BulletSegment(:final text):
            final (t, used) = await _text(text, o, allowCloud, glossary);
            polishUsed |= used;
            final items = t
                .split(RegExp(r'(?<=[.?!])\s+'))
                .where((x) => x.isNotEmpty)
                .map((x) => '- $x');
            if (sb.isNotEmpty && !sb.toString().endsWith('\n')) sb.write('\n');
            sb.write(items.join('\n'));
        }
      }
      var text = _post.finish(sb.toString().trim(), packs: o.packs);
      if (text.isEmpty) {
        return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
      }
      text = ContinuationFlow.adapt(text, o.surrounding, _common);
      String? hint;
      if (o.profile.id == 'ai_prompting' && !polishUsed) {
        hint = lang.needsPolishHint;
      }
      return await _insert(raw, text, polishUsed, o, hint: hint);
    } catch (e) {
      return DictationResult(DictationStatus.error,
          rawTranscript: raw, error: e.runtimeType.toString());
    }
  }

  Future<(String, bool)> _text(String text, DictationOptions o, bool allowCloud,
      List<String> glossary) async {
    // Heard-as fixes (the user's corrections and dictionary) and pack patterns that need the
    // spoken number words come first, so everything after sees the right names and values.
    text = _post.beforeNumbers(
        _post.fixHeard(text,
            dictionary: o.dictionary,
            corrections: o.corrections,
            packs: o.packs),
        o.packs);
    final ruled = _fmt.format(text, o.profile,
        shorthandHundreds: o.packs.any((p) => p.shorthandHundreds),
        promptStyle: o.promptStyle,
        spokenForms: o.spokenForms);
    final chain = _chain;
    // A pack that wants exact numbers keeps the rule output whenever there is a digit in it.
    final keepNumbers = o.packs.any((p) => p.preferRuleFormatterForNumbers) &&
        RegExp(r'\d').hasMatch(ruled);
    if (ruled.isEmpty ||
        keepNumbers ||
        !o.profile.useLlm ||
        chain == null ||
        !chain.hasEngines ||
        ruled.split(' ').length < 3) {
      return (ruled, false);
    }
    // The model gets the cleaned transcript as well as the offline draft, so it can recover from
    // a rule mistake, and (optionally) placeholders instead of the specifics.
    final transcript = _fmt.clean(text);
    final values = <String, String>{};
    final masker = Masker(lang);
    // The draft is masked first; its values are then looked for in the transcript too.
    final sentDraft =
        o.maskCloud ? masker.mask(ruled, into: values).text : ruled;
    final sentTranscript = o.maskCloud
        ? masker.maskKnown(masker.mask(transcript, into: values).text, values)
        : transcript;
    final out = await chain.complete(
        buildPolishPrompt(o.profile,
            packs: o.packs,
            glossary: glossary,
            promptStyle: o.promptStyle,
            banned: List<String>.from(
                lang.register['bannedWords'] as List? ?? const [])),
        buildPolishContent(o.profile, sentTranscript, sentDraft,
            route: o.profile.id == 'ai_prompting' ? _fmt.lastRoute : null),
        allowCloud: allowCloud);
    if (out == null) return (ruled, false);
    // Checks run on what was sent (placeholders and all); only an accepted reply is restored.
    final reason = _validator.validate(sentDraft, out,
        glossary: o.maskCloud ? const [] : glossary,
        profileId: o.profile.id,
        transcript: sentTranscript);
    if (reason != null) return (ruled, false);
    final restored = masker.unmask(out.trim(), values);
    // A restored reply must still pass the fact checks against the real text.
    return _validator.validate(ruled, restored,
                glossary: glossary,
                profileId: o.profile.id,
                transcript: transcript) ==
            null
        ? (restored, true)
        : (ruled, false);
  }

  String? _template(String raw, List<DomainPack> packs) {
    final n = raw.toLowerCase().replaceAll(RegExp(r'[^a-z0-9 ]'), '').trim();
    for (final p in packs) {
      for (final t in p.templates) {
        if (t.trigger.contains(n)) return t.skeleton;
      }
    }
    return null;
  }

  Future<DictationResult> _insert(
      String raw, String text, bool polishUsed, DictationOptions o,
      {String? hint}) async {
    InsertResult r;
    try {
      r = await sink.insert(text);
    } catch (_) {
      r = InsertResult.failed;
    }
    if (r == InsertResult.passwordField) {
      return DictationResult(DictationStatus.passwordField, rawTranscript: raw);
    }
    if (r != InsertResult.ok) {
      recover.save(text);
      return DictationResult(DictationStatus.insertFailed,
          rawTranscript: raw,
          finalText: text,
          polishUsed: polishUsed,
          error: r.name);
    }
    await history?.add(text, o.profile.id);
    return DictationResult(DictationStatus.ok,
        rawTranscript: raw,
        finalText: text,
        polishUsed: polishUsed,
        hint: hint);
  }
}
