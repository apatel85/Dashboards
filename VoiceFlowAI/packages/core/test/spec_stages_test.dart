import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

/// Unit tests for the stages added from the "Dictation App Conversion Spec (Final)", in the order
/// of its section 15. Each group also checks what must NOT change ("when unsure, do less").
void main() {
  final f = RuleFormatter(loadLang());
  String fmt(String s, [String p = 'business']) => f.format(s, loadProfile(p));

  group('numbers: two spoken groups are never added together', () {
    test('"forty two fifty" is 4,250 in a money sentence, never 92', () {
      expect(fmt('the total should be forty-two fifty not forty-five twenty'),
          'The total should be 4,250 not 4,520.');
      expect(fmt('the invoice was forty two fifty'), 'The invoice was 4,250.');
    });
    test('years and plain amounts are unchanged', () {
      expect(fmt('in nineteen ninety nine'), 'In 1999.');
      expect(fmt('twenty twenty four'), '2024.');
      expect(fmt('two hundred fifty people'), '250 people.');
      expect(fmt('a hundred and twenty five'), 'A 125.');
    });
    test('clinician shorthand still works when asked for', () {
      expect(
          f.format('one forty over ninety', loadProfile('business'),
              shorthandHundreds: true),
          '140 over 90.');
    });
    test('times and "instead of" take digits; "one of" stays a word', () {
      expect(fmt('we start around seven'), 'We start around 7.');
      expect(
          fmt('closing at six instead of seven'), 'Closing at 6 instead of 7.');
      expect(fmt('one of them is late'), 'One of them is late.');
    });
    test('whole dollar amounts get the sign', () {
      expect(fmt('it costs two hundred bucks'), 'It costs \$200.');
      expect(fmt('twenty dollars'), '\$20.');
    });
  });

  group('apostrophe repair', () {
    test('"its" becomes "it\'s" before a verb or adjective, not before a noun',
        () {
      expect(fmt('its gonna be really tight'),
          contains("It's going to be really tight"));
      expect(fmt('its going to rain'), contains("It's going to rain"));
      expect(fmt('the dog wagged its tail'), 'The dog wagged its tail.');
      expect(
          fmt('the company and its building'), 'The company and its building.');
    });
    test('"id" is "I\'d" only in "id like"; an ID stays an ID', () {
      expect(fmt('id like a coffee'), "I'd like a coffee.");
      expect(fmt('show your id please'), isNot(contains("I'd")));
      expect(fmt('the user id is missing'), isNot(contains("I'd")));
    });
    test('"were" and "well" are never touched', () {
      expect(fmt('we were late but well done'), 'We were late but well done.');
    });
    test('the owner\'s spec golden', () {
      expect(
          fmt('hey john thanks a lot we cant make it friday its gonna be really tight',
              'professional'),
          'Hello John, thank you very much. We cannot make it Friday. It is going to be tight.');
    });
  });

  group('segmentation of unpunctuated speech', () {
    test('comma after greeting; question mark; break before a subject and verb',
        () {
      expect(
          fmt("hey um are you still coming tonight we're gonna start around seven i think",
              'casual'),
          "Hey, are you still coming tonight? We're going to start around 7, I think.");
    });
    test('a bare opening greeting is dropped in business, kept in casual', () {
      expect(
          fmt('hey can you send me the sales numbers for October I need them for the bank meeting Tuesday thanks',
              'business'),
          startsWith('Can you send me the sales numbers for October?'));
      expect(
          fmt('hey can you send me the sales numbers for October I need them for the bank meeting Tuesday thanks',
              'casual'),
          'Hey, can you send me the sales numbers for October? I need them for the bank meeting Tuesday. Thanks!');
    });
    test('a named greeting keeps the name and gets its comma', () {
      expect(fmt('hey sarah are you free tonight', 'casual'),
          'Hey Sarah, are you free tonight?');
      expect(fmt('hi team the report is ready', 'business'),
          'Hi team, the report is ready.');
    });
    test('closers get their own sentence; a sign-off stays together', () {
      final o = fmt('the files are ready thanks a lot talk soon', 'casual');
      expect(o, 'The files are ready. Thanks a lot, talk soon.');
    });
    test('when unsure it does not break', () {
      // complement clauses, conditions and short lead-ins stay in one sentence
      expect(fmt('i think we should wait until friday', 'casual'),
          'I think we should wait until Friday.');
      expect(fmt('if you want we can meet tomorrow', 'casual'),
          'If you want we can meet tomorrow.');
      expect(fmt('um so i was thinking we could grab lunch', 'casual'),
          'So I was thinking we could grab lunch.');
      expect(fmt('so heads up everyone starting monday we are closing at six'),
          isNot(contains('Monday.')));
      expect(fmt('what is the time', 'casual'), 'What is the time?');
    });
    test('text that already has punctuation is left as the speaker had it', () {
      const t = 'We met on Monday. Then we talked about the budget.';
      expect(fmt(t, 'casual'), t);
    });
    test('prompt mode never ends a request in a question mark', () {
      expect(
          fmt('can you please help me write a short email to my landlord i would like it polite',
              'ai_prompting'),
          isNot(contains('?')));
    });
  });

  group('self-correction restart', () {
    test('"at the, no wait, at the coffee place" keeps one lead-in', () {
      expect(
          fmt("let's meet at the, no wait, at the coffee place on main street at like ten",
              'casual'),
          "Let's meet at the coffee place on Main Street at like 10.");
    });
    test('a correction that is not a restart is untouched by this rule', () {
      expect(fmt('send it to john, no wait, to priya', 'casual'),
          'Send it to Priya.');
    });
  });

  group('casual spoken forms and street names', () {
    test('gonna / wanna / gotta expand in casual only when the setting is on',
        () {
      expect(fmt('i wanna go', 'casual'), 'I want to go.');
      final keep = Profile.fromJson({
        'id': 'casual',
        'name': 'Casual',
        'rules': {'register': 'casual', 'numbers': 'digits'}
      });
      expect(f.format('i wanna go', keep), 'I wanna go.');
    });
    test('street names are capitalised after a preposition only', () {
      expect(
          fmt('meet me on main street', 'casual'), 'Meet me on Main Street.');
      expect(fmt('the main street was closed', 'casual'),
          'The main street was closed.');
    });
  });
}
