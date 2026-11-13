import 'dart:typed_data';
import 'adapters/polish_chain.dart';
import 'history_store.dart';
import 'lang.dart';
import 'models.dart';
import 'pack.dart';
import 'polish_prompt.dart';
import 'polish_validator.dart';
import 'post_processor.dart';
import 'profile.dart';
import 'rule_formatter.dart';
import 'vad.dart';
import 'voice_commands.dart';

class DictationOptions {
  final Profile profile;
  final List<DomainPack> packs;
  final List<String> dictionary;
  final Map<String, String> corrections;
  const DictationOptions(this.profile,
      {this.packs = const [],
      this.dictionary = const [],
      this.corrections = const {}});
}

/// Capture is done by the caller; `run` takes the recorded PCM (spec §5.2).
/// Never throws: every failure becomes a [DictationResult].
class DictationPipeline {
  final LangData lang;
  final SttEngine stt;
  final TextSink sink;
  final PolishChain? polish;
  final HistoryStore? history;
  final RecoverSlot recover = RecoverSlot();
  final EnergyVad vad;
  late final RuleFormatter _fmt = RuleFormatter(lang);
  late final VoiceCommandParser _cmd = VoiceCommandParser(lang);
  late final PostProcessor _post = PostProcessor(lang);
  final PolishValidator _validator = PolishValidator();

  DictationPipeline(this.lang, this.stt, this.sink,
      {this.polish, this.history, EnergyVad? vad})
      : vad = vad ?? const EnergyVad();

  Future<DictationResult> run(Uint8List pcm, DictationOptions o) async {
    String raw = '';
    try {
      final speech = vad.trim(pcm);
      if (speech.isEmpty) {
        return const DictationResult(DictationStatus.noSpeech);
      }
      final hints = {
        ...o.dictionary,
        for (final p in o.packs) ...p.vocabulary,
      }.toList();
      final r = await stt.transcribe(speech, vocabularyHints: hints);
      raw = r.text.trim();
      if (raw.isEmpty) return const DictationResult(DictationStatus.noSpeech);
      final speechSecs =
          r.speechSeconds > 0 ? r.speechSeconds : vad.seconds(speech);
      if (speechSecs < 2 && lang.phantoms.contains(raw.toLowerCase().trim())) {
        return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
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
      var text = _post.process(sb.toString().trim(),
          dictionary: o.dictionary, corrections: o.corrections, packs: o.packs);
      if (text.isEmpty) {
        return DictationResult(DictationStatus.noSpeech, rawTranscript: raw);
      }
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
    final ruled = _fmt.format(text, o.profile);
    final chain = polish;
    if (ruled.isEmpty ||
        !o.profile.useLlm ||
        chain == null ||
        !chain.hasEngines ||
        ruled.split(' ').length < 3) {
      return (ruled, false);
    }
    final out = await chain.complete(
        buildPolishPrompt(o.profile, packs: o.packs, glossary: glossary), ruled,
        allowCloud: allowCloud);
    if (out == null) return (ruled, false);
    return _validator.validate(ruled, out, glossary: glossary) == null
        ? (out.trim(), true)
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
