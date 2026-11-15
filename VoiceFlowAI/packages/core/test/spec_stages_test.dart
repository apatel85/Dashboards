import 'package:test/test.dart';
import 'package:voiceflow_core/voiceflow_core.dart';
import 'helpers.dart';

/// Unit tests for the stages added from the "Dictation App Conversion Spec (Final)", in the order
/// of its section 15. Each group also checks what must NOT change ("when unsure, do less").
void main() {
  _stage34();
  _stage5();
  _stage6();
  _stage7();
  _stage8();
  _stage9();
  _stage10();
  _stage11();
  _stage12();
  _stage13();
  _punctuatedSafetyNet();
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
          startsWith('Could you send me the sales numbers for October?'));
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

void _stage34() {
  final lang = loadLang();
  final post = PostProcessor(lang);
  final f = RuleFormatter(lang);

  group('heard-as fixes run before formatting (spec change 3)', () {
    test(
        'a user correction is applied to the raw words, so the formatter sees it',
        () {
      final fixed = post.fixHeard('send it to pre ya tomorrow',
          corrections: {'pre ya': 'Priya'});
      expect(fixed, 'send it to Priya tomorrow');
      expect(f.format(fixed, loadProfile('business')),
          'Send it to Priya tomorrow.');
    });
    test('the dictionary fixes a near-miss spelling of a glossary term', () {
      expect(
          post.fixHeard('we use shopifi for orders', dictionary: ['Shopify']),
          'we use Shopify for orders');
    });
    test('abbreviations and pack rules stay at the end', () {
      final cricket = loadPack('cricket');
      expect(post.finish('it was lbw', packs: [cricket]), 'it was LBW');
    });
  });

  group('pack patterns see number words before they become digits (change 4)',
      () {
    final cricket = loadPack('cricket');
    String run(String s) {
      final packs = [cricket];
      return post.finish(
          f.format(post.beforeNumbers(post.fixHeard(s, packs: packs), packs),
              loadProfile('casual'),
              shorthandHundreds: true),
          packs: packs);
    }

    test('"four for twenty two" becomes 4/22 in a cricket pack', () {
      expect(run('bumrah finished with four for twenty two'),
          'Bumrah finished with 4/22.');
      expect(run('india are one fifty for three'), 'India are 150/3.');
    });
    test('not when a unit or currency word follows the second number', () {
      expect(run('we paid four for twenty dollars'), isNot(contains('4/20')));
      expect(run('it took four for twenty minutes'), isNot(contains('4/20')));
    });
    test('without the pack nothing changes', () {
      expect(f.format('four for twenty two', loadProfile('casual')),
          'Four for 22.');
    });
    test(
        'the pack file with a "stage" key still validates; a bad stage is refused',
        () {
      expect(
          PackValidator.validate({
            'id': 'x',
            'name': 'X',
            'rules': [
              {
                'stage': 'words',
                'pattern': r'\b({num}) for ({num})\b',
                'replace': r'$1/$2'
              }
            ]
          }),
          isEmpty);
      expect(
          PackValidator.validate({
            'id': 'x',
            'name': 'X',
            'rules': [
              {'stage': 'soon', 'pattern': 'a', 'replace': 'b'}
            ]
          }),
          isNotEmpty);
    });
  });
}

class _AlwaysFails extends RuleValidator {
  _AlwaysFails(super.lang);
  @override
  String? check(String cleaned, String output,
          {bool shorthandHundreds = false}) =>
      'forced';
}

void _stage5() {
  final lang = loadLang();
  final v = RuleValidator(lang);

  group('rule validator (spec section 14 checks 1, 2, 3, 5, 7)', () {
    test('a clean result passes', () {
      expect(v.check('we meet at ten on friday', 'We meet at 10 on Friday.'),
          isNull);
    });
    test('a lost number is caught', () {
      expect(v.check('send twenty reports', 'Send reports.'),
          contains('lost number 20'));
    });
    test('an invented number is caught', () {
      expect(v.check('send the reports', 'Send 5 reports.'),
          contains('invented number 5'));
    });
    test('a lost negation is caught; contractions count; "want" does not', () {
      expect(v.check('do not send it', 'Send it.'), 'lost a negation');
      expect(v.check("we can't go", 'We go.'), 'lost a negation');
      expect(v.check('i want you to go', 'I want you to go.'), isNull);
    });
    test('a limit written as "max" stands in for "not more than"', () {
      expect(
          v.check('not more than three sentences', 'Max 3 sentences.'), isNull);
    });
    test('filler and new shouting are caught', () {
      expect(v.check('hello there', 'Hello um there.'), startsWith('filler'));
      expect(v.check('send it now', 'Send it IMMEDIATELY.'),
          startsWith('shouting'));
    });
    test('unbalanced tags are caught', () {
      expect(v.check('write it', '<goal>Write it.'), 'unbalanced tags');
      expect(v.check('write it', '<goal>Write it.</goal>'), isNull);
    });
    test('list numbering is not an invented number', () {
      expect(v.check('one apples two pears', '1. Apples\n2. Pears'), isNull);
    });
  });

  group('fallback to minimal formatting in the selected profile', () {
    test('a failed check gives the minimal text, not tone vocabulary', () {
      final strict = RuleFormatter(lang, validator: _AlwaysFails(lang));
      final normal = RuleFormatter(lang);
      const said = 'hey john we gotta figure out the budget';
      final tone = normal.format(said, loadProfile('professional'));
      final out = strict.format(said, loadProfile('professional'));
      expect(strict.lastFallbackReason, 'forced');
      expect(out, isNot(tone));
      expect(out, contains('figure out')); // word map not applied
      expect(out, startsWith('Hey John'));
      expect(out, endsWith('.'));
    });
    test('no false alarms: the validator never fires on the goldens', () {
      final f = RuleFormatter(lang);
      for (final id in ['casual', 'business', 'professional', 'ai_prompting']) {
        for (final c in goldens(id)) {
          f.format(c['in'] as String, loadProfile(id));
          expect(f.lastFallbackReason, isNull, reason: '$id: ${c['in']}');
        }
      }
    });
  });
}

void _stage6() {
  final v = PolishValidator(lang: loadLang());
  String? check(String input, String out,
          {String profile = 'business', String? transcript}) =>
      v.validate(input, out, profileId: profile, transcript: transcript);

  group('polish validator (spec change 6)', () {
    test('a reply that changes a number is rejected, either way', () {
      expect(check('the total is 4,250', 'The total is 4,520.'), 'digits');
      expect(
          check('send the report friday', 'Send the report by Friday, 5 pm.'),
          'invented number');
    });
    test('a lost negation is rejected', () {
      expect(
          check("we can't offer a discount at that volume",
              'We offer a discount at that volume.'),
          'negation');
    });
    test('an apology or promise the speaker did not make is rejected', () {
      expect(
          check('the shipment is late', 'We apologize, the shipment is late.'),
          'apology');
      expect(check('send the report today', 'We guarantee the report today.'),
          'promise');
      // ...but one the speaker made stays allowed
      expect(
          check('sorry the shipment is late', 'Sorry, the shipment is late.'),
          isNull);
    });
    test('banned official phrases are rejected unless the speaker used them',
        () {
      expect(check('use the new tool', 'Please utilize the new tool.'),
          'banned word');
      expect(check('we need to touch base', 'We need to touch base.'), isNull);
      // casual and prompts are not held to the professional word list
      expect(
          check('use the new tool', 'Please utilize the new tool.',
              profile: 'casual', transcript: 'use the new tool'),
          isNot('banned word'));
    });
    test('masking placeholders must come back exactly', () {
      expect(check('send [[N1]] to [[N2]]', 'Send [[N1]] to [[N2]].'), isNull);
      expect(
          check('send [[N1]] to [[N2]]', 'Send [[N1]] to Bob.'), 'placeholder');
      expect(check('send it', 'Send [[N9]].'), 'placeholder');
    });
    test('the word-overlap floor depends on the profile', () {
      const input =
          'hey are you still coming tonight we are going to start around seven';
      const reworded =
          'Are you still coming this evening? We begin at about seven.';
      expect(check(input, reworded, profile: 'casual'),
          'drift'); // not 85% the same words
      expect(check(input, reworded, profile: 'business'), isNull);
      expect(check(input, reworded, profile: 'ai_prompting'), isNull);
    });
    test('casual passes a light correction', () {
      expect(
          check('i seen the email yesterday but i didnt had time to reply',
              'I saw the email yesterday but I didnt have time to reply.',
              profile: 'casual'),
          isNull);
    });
    test('the original checks still hold', () {
      expect(check('hi', ''), 'empty');
      expect(check('hi there', 'Sure! Hi there.'), 'preface');
      expect(check('hi', 'x' * 300), 'too long');
    });
  });
}

void _stage7() {
  final lang = loadLang();

  group('masking (spec section 13)', () {
    final m = Masker(lang);
    test(
        'names, numbers, amounts, dates and contact details become placeholders',
        () {
      final r = m.mask(
          'Send 4,250 dollars to Priya by Friday, email priya@example.com or call 555 123 4567 at 3:30 pm.');
      expect(r.text, isNot(contains('Priya')));
      expect(r.text, isNot(contains('4,250')));
      expect(r.text, isNot(contains('Friday')));
      expect(r.text, isNot(contains('example.com')));
      expect(r.text, isNot(contains('555')));
      expect(r.text, matches(RegExp(r'\[\[N\d+\]\]')));
      expect(m.unmask(r.text, r.values),
          'Send 4,250 dollars to Priya by Friday, email priya@example.com or call 555 123 4567 at 3:30 pm.');
    });
    test(
        'the same value gets the same placeholder in the transcript and the draft',
        () {
      final values = <String, String>{};
      final a = m.mask('Send it to Priya on Friday.', into: values).text;
      final b = m.mask('Send it to Priya on Friday.', into: values).text;
      expect(a, b);
      expect(values.length, 2);
    });
    test('plain words are left alone', () {
      expect(m.mask('we need to review the report').text,
          'we need to review the report');
    });
  });

  group('cloud polish in the pipeline', () {
    DictationPipeline mk(String said, FakePolish e, [FakeSink? sink]) =>
        DictationPipeline(loadLang(), FakeStt(said), sink ?? FakeSink(),
            polish: PolishChain([e]));
    DictationOptions opts({String profile = 'business', bool mask = false}) =>
        DictationOptions(loadProfile(profile), maskCloud: mask);

    test('the model gets the cleaned transcript and the offline draft',
        () async {
      String? seen;
      final e = FakePolish((t) {
        seen = t;
        return 'The shipment is late.';
      });
      await mk('um the shipment is late', e).run(speechPcm(), opts());
      expect(seen, contains('<transcript>The shipment is late'));
      expect(seen, contains('<draft>'));
      expect(seen, contains('Mode: professional.'));
      expect(seen!.trimRight(), endsWith('Improve the draft using the rules.'));
    });
    test(
        'with masking on, the model never sees the specifics and they are restored',
        () async {
      String? seen;
      final e = FakePolish((t) {
        seen = t;
        // echo the draft back, as a polite model would
        return RegExp(r'<draft>(.*?)</draft>', dotAll: true)
            .firstMatch(t)!
            .group(1)!;
      });
      final r = await mk('send the report to priya by friday', e)
          .run(speechPcm(), opts(mask: true));
      expect(seen, isNot(contains('Priya')));
      expect(seen, isNot(contains('priya')));
      expect(seen, isNot(contains('Friday')));
      expect(r.polishUsed, isTrue);
      expect(r.finalText, contains('Priya'));
      expect(r.finalText, contains('Friday'));
    });
    test('a reply that changes a masked placeholder is rejected', () async {
      final e = FakePolish((t) => 'Send the report to Bob by [[N9]].');
      final r = await mk('send the report to priya by friday', e)
          .run(speechPcm(), opts(mask: true));
      expect(r.polishUsed, isFalse);
      expect(r.finalText, contains('Priya'));
    });
    test(
        'a reply that changes a number is rejected and the offline text is shown',
        () async {
      final e = FakePolish((t) => 'The total is 4,520.');
      final r = await mk('the total is forty two fifty dollars', e)
          .run(speechPcm(), opts());
      expect(r.polishUsed, isFalse);
      expect(r.finalText, contains('4,250'));
    });
    test('Casual is not polished by default', () async {
      final e = FakePolish((t) => 'Hey there my friend how are you.');
      final r = await mk('hey there how are you', e)
          .run(speechPcm(), opts(profile: 'casual'));
      expect(e.calls, 0);
      expect(r.polishUsed, isFalse);
    });
    test('timeout and rate limit show the offline result without an error',
        () async {
      for (final err in [
        const PolishException('timeout'),
        const PolishException('rl', rateLimited: true)
      ]) {
        final r = await mk(
                'the shipment is late today', FakePolish((t) => t, error: err))
            .run(speechPcm(), opts());
        expect(r.status, DictationStatus.ok);
        expect(r.polishUsed, isFalse);
        expect(r.finalText, 'The shipment is late today.');
      }
    });
  });

  group('polish instructions are specific to the mode', () {
    String sys(String id) => buildPolishPrompt(loadProfile(id));
    test('casual asks for a minimal correction only', () {
      expect(sys('casual'), contains('Correct this dictated message'));
      expect(sys('casual'), contains('Do not make it more formal'));
    });
    test('professional lists the banned words and forbids additions', () {
      final p = buildPolishPrompt(loadProfile('professional'),
          banned: ['utilize', 'circle back']);
      expect(p, contains('Do not use: utilize, circle back'));
      expect(p, contains('Add no apology, promise, deadline'));
      expect(p, contains('purpose and the ask first'));
    });
    test('prompt mode keeps the chosen layout and the CLARIFY rule', () {
      final p = buildPolishPrompt(loadProfile('ai_prompting'),
          promptStyle: const PromptStyle(format: 'xml'));
      expect(p, contains('CLARIFY:'));
      expect(p, contains('lowercase tag'));
    });
  });
}

void _stage8() {
  final f = RuleFormatter(loadLang());
  String biz(String s) => f.format(s, loadProfile('business'));

  group('professional word map (spec section 9)', () {
    test('plain professional words replace casual ones', () {
      expect(biz('we need to find out who is approving that'),
          contains('confirm who is approving that'));
      expect(biz('send me the numbers asap'),
          'Send me the figures as soon as possible.');
      expect(biz('the paperwork is pricey'), 'The documentation is expensive.');
    });
    test('banned official phrases become plain words', () {
      expect(biz('we should utilize the new tool in order to save time'),
          contains('use the new tool to save time'));
      expect(biz('please circle back going forward'),
          contains('follow up in future'));
    });
    test('requests become polite requests; thanks becomes thank you', () {
      expect(biz('can you send me the report thanks'),
          'Could you send me the report? Thank you.');
    });
    test('"I think" stays a hedge: the speaker\'s firmness is kept', () {
      expect(biz('i think we should wait until friday'),
          'I think we should wait until Friday.');
    });
    test('"let me know" is a fine closing and is kept', () {
      expect(biz('let me know if you have any questions'),
          'Let me know if you have any questions.');
    });
    test('words that carry meaning in other senses are left alone', () {
      expect(biz('this kind of problem is new'), contains('kind of problem'));
      expect(biz('the check is in the mail'), 'The check is in the mail.');
    });
    test('casual keeps the speaker\'s words', () {
      expect(
          f.format('can you send me the numbers thanks', loadProfile('casual')),
          contains('Can you send me the numbers'));
    });
  });
}

void _stage9() {
  final f = RuleFormatter(loadLang());
  String c(String s) => f.format(s, loadProfile('casual'));
  group('grammar slips and sound-alikes a pattern can decide', () {
    test('the spec examples', () {
      expect(c('i seen the email yesterday but i didn\'t had time to reply'),
          "I saw the email yesterday but I didn't have time to reply.");
      expect(
          c('there going to be late because of they\'re flight your going to have to pick up the kids'),
          "They're going to be late because of their flight. You're going to have to pick up the kids.");
    });
    test('real uses of there/their/your are left alone', () {
      expect(c('i left it over there going home'), isNot(contains("they're")));
      expect(c('there is going to be a meeting'),
          'There is going to be a meeting.');
      expect(c('put your coat on'), 'Put your coat on.');
      expect(c('their house is big'), 'Their house is big.');
      expect(c('where are they going'), isNot(contains("they're")));
    });
    test('"could of" and "more then"', () {
      expect(c('we could of won'), 'We could have won.');
      expect(c('it is more then enough'), 'It is more than enough.');
    });
  });
}

void _stage10() {
  final lang = loadLang();
  final r = PromptRouter(lang);
  final f = RuleFormatter(lang);
  String ai(String s) => f.format(s, loadProfile('ai_prompting'));

  group('prompt router (spec section 5): route by the deliverable', () {
    test('each route from keyword signals', () {
      expect(
          r.route('what is the current sales tax rate in new jersey'), 'ASK');
      expect(r.route('compare klaviyo and mailchimp for my store'), 'RESEARCH');
      expect(r.route('write an email to our supplier about the late shipment'),
          'WRITE');
      expect(
          r.route('take this description and make it way shorter'), 'REWRITE');
      expect(r.route('tell me why october was down compared to september'),
          'ASK'); // needs "the export" / "analyze" to be ANALYZE
      expect(r.route('analyze the sales export and find the top three reasons'),
          'ANALYZE');
      expect(r.route('build an app so warehouse staff can scan a barcode'),
          'BUILD');
      expect(r.route('the tracker app is broken when i export'), 'FIX');
      expect(r.route('send the invoice to the client'), 'DO');
      expect(
          r.route('should i open a third location or buy online ads'), 'PLAN');
    });
    test('a question about a deliverable is not the deliverable', () {
      expect(r.route('what would it take to build an inventory app'), 'ASK');
      expect(r.route('how do apps handle logins'), 'ASK');
      expect(r.route('can you send the invoice'), 'DO');
    });
  });

  group('DO requests that cannot be undone carry an approval constraint', () {
    test('added when the speaker did not ask for a look first', () {
      expect(ai('send an email to the whole team about the new schedule'),
          endsWith('Get approval first [default].'));
    });
    test('not added when they asked for drafts, or said to go ahead', () {
      expect(ai('write replies to the returns emails but do not send anything'),
          isNot(contains('approval')));
      expect(ai('send the invoice to the client go ahead and send it'),
          isNot(contains('approval')));
    });
    test('not added to other routes', () {
      expect(ai('compare klaviyo and mailchimp for my shopify store'),
          isNot(contains('approval')));
    });
  });

  group('two unrelated requests become two prompts', () {
    test('the spec example', () {
      final o = ai(
          "what's the weather in atlanta on friday and oh also draft a note to the landlord saying the ac is out again");
      expect(f.lastRoute, 'SPLIT');
      expect(o, startsWith('Prompt 1: What'));
      expect(o, contains('\n\nPrompt 2: Draft a note to the landlord'));
    });
    test('more detail about the same request stays one prompt', () {
      final o = ai(
          'we are building a dictation app and it should convert speech into prompts. also it will save tokens for input and output');
      expect(o, isNot(contains('Prompt 1')));
    });
    test('the validator does not treat "Prompt 1" as an invented number', () {
      ai("what's the weather in atlanta on friday and oh also draft a note to the landlord saying the ac is out again");
      expect(f.lastFallbackReason, isNull);
    });
  });

  group('"do you know" is not filler', () {
    test('the question keeps its words', () {
      expect(ai('do you know what the sales tax is in new jersey'),
          contains('Do you know what the sales tax'));
    });
  });
}

void _stage11() {
  final f = RuleFormatter(loadLang());
  String biz(String s, [String p = 'business']) => f.format(s, loadProfile(p));
  group('emotion becomes impact, blame becomes fact (spec section 8)', () {
    test('venting is converted in Business and Professional', () {
      expect(biz("it's really killing us because orders are backing up"),
          'This is affecting our operations because orders are backing up.');
      expect(biz("i'm so sick of this"), 'This is a recurring issue.');
      expect(biz("i'm freaking out about the deadline", 'professional'),
          'I am concerned about the deadline.');
    });
    test('an empty rant is deleted, the request stays', () {
      expect(biz('honestly it is ridiculous i want a refund for this order'),
          'I want a refund for this order.');
    });
    test('blame is stated as what happened', () {
      expect(biz('you guys messed up the order'),
          'There was an error with the order.');
      expect(biz('they dropped the ball on the deadline'),
          'The deadline was missed.');
    });
    test('Casual keeps emotion and emphasis as spoken', () {
      expect(
          biz("it's really killing us", 'casual'), "It's really killing us.");
    });
  });
}

void _stage12() {
  Future<DictationResult> run(String said, String profile,
      {bool resolver = true}) {
    final sink = FakeSink();
    final p = DictationPipeline(loadLang(), FakeStt(said), sink);
    return p.run(
        speechPcm(),
        DictationOptions(loadProfile(profile),
            profileById: resolver ? (id) => loadProfile(id) : null));
  }

  group('spoken mode commands (spec section 3)', () {
    test('"prompt mode" switches this dictation to a prompt and is removed',
        () async {
      final r = await run(
          'prompt mode compare klaviyo and mailchimp for my store', 'casual');
      expect(r.finalText, startsWith('Compare'));
      expect(r.finalText, isNot(contains('prompt mode')));
    });
    test('"casual mode" keeps the words even from a Professional default',
        () async {
      final r = await run(
          'casual mode hey can you send me the numbers thanks', 'professional');
      expect(r.finalText, 'Hey, can you send me the numbers? Thanks!');
    });
    test('"make this formal" and "professional mode" pick the two tone levels',
        () async {
      final formal = await run(
          'make this formal we cant make the meeting thursday', 'casual');
      expect(formal.finalText, contains('cannot'));
      final neutral = await run(
          'professional mode we cant make the meeting thursday', 'casual');
      expect(neutral.finalText, contains("can't"));
    });
    test('it applies to one dictation only', () async {
      await run('prompt mode explain kubernetes pods', 'casual');
      final next = await run('hey are you free tonight', 'casual');
      expect(next.finalText, startsWith('Hey'));
    });
    test('the words stay when the app gave no way to look a profile up',
        () async {
      final r = await run('prompt mode explain kubernetes pods', 'casual',
          resolver: false);
      expect(r.finalText, startsWith('Prompt mode'));
    });
    test('only at the start: a later mention is ordinary text', () async {
      final r = await run('we talked about prompt mode yesterday', 'casual');
      expect(r.finalText, 'We talked about prompt mode yesterday.');
    });
  });
}

void _stage13() {
  group('Professional is one mode with tone levels', () {
    final biz = loadProfile('business');
    final formal = loadProfile('professional');
    Profile? byId(String id) => id == 'professional' ? formal : biz;
    test('the tone level picks the profile', () {
      expect(resolveProfessional(biz, 'neutral', byId).id, 'business');
      expect(resolveProfessional(biz, 'formal', byId).id, 'professional');
      // a profile saved as the formal one stays formal; others are untouched
      expect(resolveProfessional(formal, 'neutral', byId).id, 'professional');
      expect(resolveProfessional(loadProfile('casual'), 'formal', byId).id,
          'casual');
    });
    test('the tone level is a saved setting', () {
      final s = Settings();
      expect(s.professionalTone, 'neutral');
      s.professionalTone = 'formal';
      expect(Settings.fromJson(s.toJson()).professionalTone, 'formal');
      expect(Settings.fromJson({'professionalTone': 'weird'}).professionalTone,
          'neutral');
    });
    test('email apps use Professional (tone from the setting)', () {
      expect(AppDefaults.profileFor('com.google.android.gm'), 'business');
    });
  });
}

/// What the speech recogniser really returns is punctuated and capitalised. These sentences are
/// already right, so Casual must hand them back exactly as they came, and the business tones
/// must not cut them into pieces. (The first spec tests used unpunctuated typed text only, which
/// hid the damage the sentence breaker did to text like this.)
void _punctuatedSafetyNet() {
  final f = RuleFormatter(loadLang());
  const already = [
    "So I talked to John about the Supabase migration and he said it should be done by Friday, but I'm not sure that's realistic.",
    'We need to review the budget, the timeline, and the staffing plan before the board meeting.',
    'The API is returning a 500 error when I hit the export endpoint, and it was working fine last week.',
    "I'd like to schedule a call for next week to go over the contract, the pricing, and the termination clause.",
    "I was thinking about going to the gym, but it's raining, so maybe I'll just stay home and watch a movie.",
    'We should probably talk about the Android app and the Windows app separately, since the features are different.',
    "I don't think that's a good idea because the deadline is too tight and we don't have enough people.",
    "Hi Sarah, thanks for the update. I looked at the report and it looks good, but I have a few questions about the Q3 numbers.",
    'The new checkout is live. We\'re still working on the mobile menu, which should be done by Friday.',
    "Hey Raj, I wanted to check in on the shipment. It was supposed to arrive on the third and I still haven't heard anything.",
    'If you want, we can meet tomorrow, or we can talk on the phone.',
    'I want to build an app that converts speech into text and then formats it for different tones.',
  ];
  group('punctuated speech (what the recogniser returns) is left alone', () {
    for (final s in already) {
      test('casual: $s', () {
        expect(f.format(s, loadProfile('casual')), s);
      });
    }
    test('business tones never cut a punctuated sentence in two', () {
      for (final s in already) {
        for (final id in ['business', 'professional']) {
          final out = f.format(s, loadProfile(id));
          final inCount = RegExp(r'[.?!](\s|$)').allMatches(s).length;
          final outCount = RegExp(r'[.?!](\s|$)').allMatches(out).length;
          expect(outCount, inCount, reason: '$id: $s -> $out');
        }
      }
    });
    test('an alphanumeric name stays one word: Q3, T20, GPT4, S3', () {
      expect(
          f.format('the Q3 numbers and the T20 final', loadProfile('casual')),
          'The Q3 numbers and the T20 final.');
      expect(f.format('we use GPT4 and S3', loadProfile('business')),
          'We use GPT4 and S3.');
    });
    test('"ten thirty" is a time, not 1030; years stay years', () {
      expect(f.format('make it ten thirty', loadProfile('casual')),
          'Make it 10:30.');
      expect(
          f.format('in twenty twenty four', loadProfile('casual')), 'In 2024.');
    });
    test(
        'a correction without a replaceable value never deletes the sentence before it',
        () {
      final o = f.format(
          "Let's meet at the coffee place on Main Street at ten. Actually, make it ten thirty.",
          loadProfile('casual'));
      expect(o, contains('coffee place on Main Street'));
    });
    test('a request to be sent TO the speaker is not a send action', () {
      final ai = f.format(
          'Can you send me the sales numbers for October? I need them for the bank meeting on Tuesday.',
          loadProfile('ai_prompting'));
      expect(ai, isNot(contains('approval')));
      final statement = f.format(
          "Okay, I'll send it over by end of day. Let me know if you have any questions.",
          loadProfile('ai_prompting'));
      expect(statement, isNot(contains('approval')));
    });
    test('the spoken-forms switch', () {
      const said = "We're gonna start at seven.";
      expect(
          f.format(said, loadProfile('casual')), "We're going to start at 7.");
      expect(f.format(said, loadProfile('casual'), spokenForms: false),
          "We're gonna start at 7.");
    });
  });
}
