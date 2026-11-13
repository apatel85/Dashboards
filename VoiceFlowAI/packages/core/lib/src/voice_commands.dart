import 'lang.dart';

sealed class Segment {}

class TextSegment extends Segment {
  final String text;
  TextSegment(this.text);
}

class BulletSegment extends Segment {
  final String text;
  BulletSegment(this.text);
}

enum CommandKind { newLine, newParagraph, undoPrevious, discardUtterance }

class CommandSegment extends Segment {
  final CommandKind kind;
  CommandSegment(this.kind);
}

/// Splits a transcript into text and command segments (spec §5.5).
class VoiceCommandParser {
  final LangData lang;
  VoiceCommandParser(this.lang);

  static String _norm(String s) => s
      .toLowerCase()
      .replaceAll(RegExp(r'[^a-z0-9\s]'), ' ')
      .replaceAll(RegExp(r'\s+'), ' ')
      .trim();

  List<Segment> parse(String text) {
    final words =
        text.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (words.isEmpty) return const [];
    final whole = _norm(text);
    final scratch = lang.commands['scratchThat'] ?? const [];
    if (scratch.contains(whole)) {
      return [CommandSegment(CommandKind.undoPrevious)];
    }
    final nw = words.map(_norm).toList();
    final phrases = <(CommandKind?, String, List<String>)>[];
    void add(String key, CommandKind? k, String tag) {
      for (final p in lang.commands[key] ?? const <String>[]) {
        phrases.add((k, tag, p.split(' ')));
      }
    }

    add('newParagraph', CommandKind.newParagraph, 'cmd');
    add('newLine', CommandKind.newLine, 'cmd');
    add('bulletList', null, 'bullet');
    add('endList', null, 'end');
    add('scratchThat', CommandKind.discardUtterance, 'scratch');
    add('literal', null, 'literal');
    phrases.sort((a, b) => b.$3.length.compareTo(a.$3.length));

    (CommandKind?, String, List<String>)? matchAt(int i) {
      for (final p in phrases) {
        if (i + p.$3.length <= nw.length &&
            nw.sublist(i, i + p.$3.length).join(' ') == p.$3.join(' ')) {
          return p;
        }
      }
      return null;
    }

    final out = <Segment>[];
    var buf = <String>[];
    var bullets = false;
    void flush() {
      if (buf.isEmpty) return;
      final t = buf.join(' ');
      out.add(bullets ? BulletSegment(t) : TextSegment(t));
      buf = [];
    }

    var i = 0;
    while (i < words.length) {
      final m = matchAt(i);
      if (m == null) {
        buf.add(words[i++]);
        continue;
      }
      final tag = m.$2;
      final len = m.$3.length;
      if (tag == 'literal') {
        i += len;
        if (i < words.length) {
          final lit = matchAt(i);
          final n = lit?.$3.length ?? 1;
          buf.addAll(words.sublist(i, i + n));
          i += n;
        }
        continue;
      }
      if (tag == 'scratch') {
        if (i + len >= words.length) {
          // at end of utterance: discard this utterance
          return [CommandSegment(CommandKind.discardUtterance)];
        }
        buf.addAll(words.sublist(i, i + len));
        i += len;
        continue;
      }
      flush();
      i += len;
      if (tag == 'bullet') {
        bullets = true;
      } else if (tag == 'end') {
        bullets = false;
      } else {
        out.add(CommandSegment(m.$1!));
      }
    }
    flush();
    return out;
  }
}
