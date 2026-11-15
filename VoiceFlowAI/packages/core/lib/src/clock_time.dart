/// "after nine forty five" / "after 945" / "after 9.45" -> "after 9:45 PM".
/// Only after a time cue word, so "945 Main Street" or "room 945" are left alone. With no AM/PM
/// spoken, the period of the current time of day is assumed: before noon -> AM, otherwise PM
/// (the phone's local time). A spoken AM/PM, "in the morning", "tonight" etc. always wins.
class ClockTime {
  static const _cue =
      r'(?:at|after|before|until|till|by|around|about|from|since|past|between|and|to|every)';
  static const _hours = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
    'ten': 10,
    'eleven': 11,
    'twelve': 12,
  };
  static const _units = {
    'one': 1,
    'two': 2,
    'three': 3,
    'four': 4,
    'five': 5,
    'six': 6,
    'seven': 7,
    'eight': 8,
    'nine': 9,
  };
  static const _teens = {
    'ten': 10,
    'eleven': 11,
    'twelve': 12,
    'thirteen': 13,
    'fourteen': 14,
    'fifteen': 15,
    'sixteen': 16,
    'seventeen': 17,
    'eighteen': 18,
    'nineteen': 19,
  };
  static const _tens = {'twenty': 20, 'thirty': 30, 'forty': 40, 'fifty': 50};

  static const _meridiem = r'(?:\s+(a\.?\s?m\.?|p\.?\s?m\.?)(?![A-Za-z]))?';

  static final _words = RegExp(
      '\\b($_cue)\\s+(${_hours.keys.join('|')})\\s+'
      '(?:(?:oh|o)\\s+(${_units.keys.join('|')})|(${_teens.keys.join('|')})|'
      '(${_tens.keys.join('|')})(?:[\\s-]+(${_units.keys.join('|')}))?)\\b'
      '$_meridiem',
      caseSensitive: false);

  // 945, 9.45 or 9:45 after a cue
  static final _digits = RegExp(
      '\\b($_cue)\\s+(1[0-2]|[1-9])[.:]?([0-5]\\d)\\b$_meridiem',
      caseSensitive: false);

  static final _spokenPeriod = RegExp(
      r'^\s*(?:in the (?:morning|afternoon|evening)|at night|tonight|o.?clock)',
      caseSensitive: false);
  static final _notATime = RegExp(
      r'^\s*(?:%|percent|dollars?|pounds?|kg|km|miles?|hours?|minutes?|seconds?|million|billion|thousand|units?)\b',
      caseSensitive: false);
  static final _capital = RegExp(r'^\s+[A-Z]');

  static String apply(String input, {DateTime? now}) {
    final period = (now ?? DateTime.now()).hour < 12 ? 'AM' : 'PM';
    String finish(Match m, String cue, int h, int min, String? spoken) {
      final rest = m.input.substring(m.end);
      if (_notATime.hasMatch(rest)) return m[0]!;
      final t = '$h:${min.toString().padLeft(2, '0')}';
      if (spoken != null) {
        return '$cue $t ${spoken.toLowerCase().startsWith('a') ? 'AM' : 'PM'}';
      }
      return '$cue $t${_spokenPeriod.hasMatch(rest) ? '' : ' $period'}';
    }

    var s = input.replaceAllMapped(_words, (m) {
      final h = _hours[m.group(2)!.toLowerCase()]!;
      int min;
      if (m.group(3) != null) {
        min = _units[m.group(3)!.toLowerCase()]!;
      } else if (m.group(4) != null) {
        min = _teens[m.group(4)!.toLowerCase()]!;
      } else {
        min = _tens[m.group(5)!.toLowerCase()]! +
            (m.group(6) == null ? 0 : _units[m.group(6)!.toLowerCase()]!);
      }
      return finish(m, m.group(1)!, h, min, m.group(7));
    });
    s = s.replaceAllMapped(_digits, (m) {
      final isAddress = _capital.hasMatch(m.input.substring(m.end));
      if (isAddress) {
        return m[0]!;
      }
      return finish(m, m.group(1)!, int.parse(m.group(2)!),
          int.parse(m.group(3)!), m.group(4));
    });
    return s;
  }
}
