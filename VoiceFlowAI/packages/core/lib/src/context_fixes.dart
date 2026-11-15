/// Speech-to-text often picks a look-alike word that fits the sound but not the sentence ("tax
/// messages", "buck fixing"). For a short list of such pairs this chooses the word the surrounding
/// words point to, and only switches when the evidence is clear: the other word has cue words
/// nearby (or a strong cue anywhere in the message) and the spoken word has none.
class _Pair {
  final String a, b;
  final List<String> aStrong, aWeak, bStrong, bWeak;
  const _Pair(this.a, this.b,
      {this.aStrong = const [],
      this.aWeak = const [],
      this.bStrong = const [],
      this.bWeak = const []});
}

class ContextFixes {
  // text / tax
  static const _textStrong = [
    'messag',
    'sms',
    'whatsapp',
    'imessage',
    'unstructured',
    'dictat',
    'transcri',
    'prompt',
    'chatbot',
    'texting',
    'paragraph'
  ];
  static const _textWeak = [
    'send',
    'sent',
    'reply',
    'replied',
    'phone',
    'chat',
    'typed',
    'typing',
    'type',
    'filler',
    'word',
    'words',
    'email',
    'copy',
    'paste',
    'tone',
    'tones',
    'casual',
    'write',
    'wrote',
    'written',
    'rewrite',
    'sentence',
    'wording',
    'format',
    'like',
    'ranges'
  ];
  static const _taxStrong = [
    'refund',
    'deduct',
    'irs',
    'accountant',
    'bracket',
    'audit',
    'levy',
    'withhold',
    'vat',
    'gst',
    'cpa',
    'income'
  ];
  static const _taxWeak = [
    'pay',
    'paid',
    'paying',
    'return',
    'rate',
    'filing',
    'duty',
    'credit',
    'owe',
    'owed',
    'cut',
    'hike',
    'bill',
    'sales',
    'property',
    'corporate'
  ];

  static const _bugStrong = [
    'fix',
    'fixes',
    'fixing',
    'crash',
    'regression',
    'patch',
    'debug',
    'ticket',
    'tracker',
    'release',
    'feature',
    'software',
    'code',
    'error'
  ];
  static const _bugWeak = ['report', 'app', 'test', 'issue', 'issues'];
  static const _buckStrong = [
    'dollar',
    'cash',
    'deer',
    'hunt',
    'million',
    'thousand',
    'bang'
  ];
  static const _buckWeak = ['price', 'cost', 'pay', 'paid', 'worth'];

  static const _cacheStrong = [
    'memory',
    'browser',
    'redis',
    'stale',
    'cdn',
    'flush',
    'invalidat',
    'storage',
    'clear'
  ];
  static const _cacheWeak = ['app', 'build', 'data', 'server', 'slow'];
  static const _cashStrong = [
    'money',
    'bank',
    'dollar',
    'budget',
    'invoice',
    'payment',
    'flow',
    'register',
    'revenue'
  ];
  static const _cashWeak = ['pay', 'paid', 'price', 'cost', 'customer'];

  static const _sqlStrong = [
    'database',
    'query',
    'queries',
    'postgres',
    'mysql',
    'injection',
    'schema'
  ];
  static const _sqlWeak = ['server', 'table', 'select', 'join', 'data'];
  static const _sequelStrong = ['movie', 'film', 'book', 'series', 'trilogy'];
  static const _sequelWeak = ['part', 'original', 'watch'];

  static const _pairs = <_Pair>[
    _Pair('tax', 'text',
        aStrong: _taxStrong,
        aWeak: _taxWeak,
        bStrong: _textStrong,
        bWeak: _textWeak),
    _Pair('taxes', 'texts',
        aStrong: _taxStrong,
        aWeak: _taxWeak,
        bStrong: _textStrong,
        bWeak: _textWeak),
    _Pair('taxing', 'texting',
        aStrong: _taxStrong,
        aWeak: _taxWeak,
        bStrong: _textStrong,
        bWeak: _textWeak),
    _Pair('taxed', 'texted',
        aStrong: _taxStrong,
        aWeak: _taxWeak,
        bStrong: _textStrong,
        bWeak: _textWeak),
    _Pair('buck', 'bug',
        aStrong: _buckStrong,
        aWeak: _buckWeak,
        bStrong: _bugStrong,
        bWeak: _bugWeak),
    _Pair('bucks', 'bugs',
        aStrong: _buckStrong,
        aWeak: _buckWeak,
        bStrong: _bugStrong,
        bWeak: _bugWeak),
    _Pair('cash', 'cache',
        aStrong: _cashStrong,
        aWeak: _cashWeak,
        bStrong: _cacheStrong,
        bWeak: _cacheWeak),
    _Pair('sequel', 'SQL',
        aStrong: _sequelStrong,
        aWeak: _sequelWeak,
        bStrong: _sqlStrong,
        bWeak: _sqlWeak),
  ];

  /// Unambiguous mishearings of tech words (no context needed).
  static final _phrases = <(RegExp, String)>[
    (RegExp(r'\bchat g\.?p\.?t\b', caseSensitive: false), 'ChatGPT'),
    (RegExp(r'\bget hub\b', caseSensitive: false), 'GitHub'),
    (RegExp(r'\bjava script\b', caseSensitive: false), 'JavaScript'),
    (RegExp(r'\btype script\b', caseSensitive: false), 'TypeScript'),
    (RegExp(r'\bcube (?:cuddle|control)\b', caseSensitive: false), 'kubectl'),
    (RegExp(r'\bo auth\b', caseSensitive: false), 'OAuth'),
    (RegExp(r'\ba p i\b', caseSensitive: false), 'API'),
    (RegExp(r'\bu r l\b', caseSensitive: false), 'URL'),
    (RegExp(r'\bs d k\b', caseSensitive: false), 'SDK'),
    (RegExp(r'\bl l m\b', caseSensitive: false), 'LLM'),
    (RegExp(r'\bg p t\b', caseSensitive: false), 'GPT'),
    (RegExp(r'\bc l i\b', caseSensitive: false), 'CLI'),
    (RegExp(r'\bs q l\b', caseSensitive: false), 'SQL'),
    (RegExp(r'\ba w s\b', caseSensitive: false), 'AWS'),
  ];

  static final _word = RegExp(r"[A-Za-z]+");
  static const _window = 10;

  static String apply(String input) {
    var s = input;
    for (final (re, to) in _phrases) {
      s = s.replaceAll(re, to);
    }
    final ms = _word.allMatches(s).toList();
    if (ms.isEmpty) return s;
    final words = [for (final m in ms) m.group(0)!.toLowerCase()];
    final edits = <(int, int, String)>[];
    for (var i = 0; i < words.length; i++) {
      for (final p in _pairs) {
        final isA = words[i] == p.a.toLowerCase();
        final isB = words[i] == p.b.toLowerCase();
        if (!isA && !isB) continue;
        final own = isA
            ? _score(words, i, p.aStrong, p.aWeak)
            : _score(words, i, p.bStrong, p.bWeak);
        final other = isA
            ? _score(words, i, p.bStrong, p.bWeak)
            : _score(words, i, p.aStrong, p.aWeak);
        if (other >= 2 && own == 0) {
          final to = isA ? p.b : p.a;
          final orig = ms[i].group(0)!;
          final cap = orig[0] == orig[0].toUpperCase() &&
              orig[0] != orig[0].toLowerCase();
          edits.add((
            ms[i].start,
            ms[i].end,
            cap && to == to.toLowerCase()
                ? to[0].toUpperCase() + to.substring(1)
                : to
          ));
        }
        break;
      }
    }
    for (final e in edits.reversed) {
      s = s.replaceRange(e.$1, e.$2, e.$3);
    }
    return s;
  }

  /// Window hits count 2 each (strong or weak); a strong cue elsewhere in the message counts 1.
  static int _score(
      List<String> w, int i, List<String> strong, List<String> weak) {
    var score = 0;
    final lo = i - _window < 0 ? 0 : i - _window;
    final hi = i + _window >= w.length ? w.length - 1 : i + _window;
    bool hit(String x, List<String> cues) => cues.any((c) => x.startsWith(c));
    for (var k = 0; k < w.length; k++) {
      if (k == i) continue;
      final inWin = k >= lo && k <= hi;
      if (inWin && (hit(w[k], strong) || hit(w[k], weak))) {
        score += 2;
      } else if (!inWin && hit(w[k], strong)) {
        score += 1;
      }
    }
    return score;
  }
}
