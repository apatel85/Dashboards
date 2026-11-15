import 'dart:math';

/// One generated dictation: realistic rambling speech-to-text (punctuated, with fillers) that
/// states a fact, retracts it in one of several ways, and gives the right one.
class CorpusCase {
  final int id;
  final String text;
  final List<String> mustHave; // corrected values that must survive
  final List<String> mustNot; // retracted values that must be gone
  final String form;
  final String slot;
  const CorpusCase(
      this.id, this.text, this.mustHave, this.mustNot, this.form, this.slot);
  int get words => text.split(RegExp(r'\s+')).length;
}

class _Slot {
  final String name;
  final String oldSentence; // full sentence with the wrong value
  final String oldStem; // same without the final period
  final String newSentence; // correction as a full sentence
  final String newFragment; // the bare corrected value
  final List<String> oldValues, newValues;
  const _Slot(this.name, this.oldSentence, this.newSentence, this.newFragment,
      this.oldValues, this.newValues)
      : oldStem = '';
  String get stem => oldSentence.replaceAll(RegExp(r'\.$'), '');
}

const _slots = <_Slot>[
  _Slot(
      'day+time',
      'We have a meeting scheduled for Monday at 9 am with the client.',
      "It's on Tuesday at 10 am.",
      'Tuesday at 10 am',
      ['Monday', '9 am'],
      ['Tuesday', '10 am']),
  _Slot('time', 'The call with the vendor starts at 2 pm.',
      'It starts at 4 pm.', '4 pm', ['2 pm'], ['4 pm']),
  _Slot('day', 'The design review is on Wednesday.', 'It is on Thursday.',
      'Thursday', ['Wednesday'], ['Thursday']),
  _Slot('date', 'The deadline for the proposal is March 3rd.',
      'The deadline is March 5th.', 'March 5th', ['March 3rd'], ['March 5th']),
  _Slot('money', 'The budget for the campaign is 500 dollars.',
      'The budget is 600 dollars.', '600 dollars', ['\$500'], ['\$600']),
  _Slot('quantity', 'We are expecting 20 people at the workshop.',
      'We are expecting 30 people.', '30 people', ['20 people'], ['30 people']),
  _Slot('percent', 'Revenue grew 15 percent over the last quarter.',
      'It grew 18 percent.', '18 percent', ['15 percent'], ['18 percent']),
  _Slot('name', 'Please send the contract to John by the end of the week.',
      'Please send the contract to Priya.', 'Priya', ['John'], ['Priya']),
  _Slot(
      'place',
      'We will meet at the Boston office to go through the plan.',
      'We will meet at the Chicago office.',
      'Chicago office',
      ['Boston'],
      ['Chicago']),
];

/// Retraction styles. {OLD} full old sentence, {STEM} old sentence without its period,
/// {NEW} corrected sentence, {FRAG} bare corrected value.
const _forms = <String, String>{
  'sentence "No, sorry."': '{OLD} No, sorry. {NEW}',
  'inline "no sorry"': '{STEM}, no sorry, {FRAG}.',
  'lead "Sorry,"': '{OLD} Sorry, {NEW_L}',
  'scratch that': '{OLD} Scratch that, {NEW_L}',
  'actually': '{OLD} Actually, {NEW}',
  'wait that is wrong': "{OLD} Wait, that's wrong. {NEW}",
  'negate that': '{OLD} Negate that. {NEW}',
  'I mean': '{STEM}, I mean {FRAG}.',
};

const _openers = [
  "Alright, so let's try this again.",
  'Okay so, um, this is what I need you to know.',
  'Right, so basically here is the situation.',
  "Hi, so I wanted to give you a quick update, you know, before the week gets away from us.",
  "Okay, so let me think out loud for a second here.",
  'So I was just going through my notes and there are a few things.',
];

const _blocks = [
  "The project has been moving along, kind of slowly, but I think the team is doing a really good job. We hit a couple of snags with the vendor, and basically they keep changing the requirements on us, which is a little frustrating.",
  "I talked to the finance team and they said we need to be more careful about spending, you know, especially on the tools we are not using. Honestly I think we can cut a few of the subscriptions without anyone noticing.",
  "On the engineering side, the new release is mostly done. There are a few bugs left in the settings screen and the sync is, like, sort of flaky on slow connections, so we want to test that properly before we ship anything.",
  "The client wants a report that is easy to read, with a short summary at the top and then the details below. I told them we can do that, and I think it is a good idea because nobody reads the long ones anyway.",
  "We also need to hire someone for the support team. I have a couple of candidates in mind, and basically I want somebody who is patient and good with customers, rather than somebody who just knows the product.",
  "Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier.",
  "I think we should write down the process so that new people do not have to ask the same questions over and over. It does not have to be fancy, just a simple page with the steps and who to contact when something breaks.",
  "The marketing team sent over the new designs and honestly they look great. There are a few small things, like the font being too small on mobile, but overall I am happy and I think the client will be too.",
  "Let me also mention that the security review came back fine. There were two small findings, nothing serious, and we already have a plan to fix both of them as part of the normal work.",
  "I am a little worried about the timeline, to be honest. We have a lot to do and not that much time, so we should probably decide what is really important and what can wait until the next round.",
  "Customers have been asking for a way to export their data, which makes sense, and it is not too hard to build. I would say it is a good candidate for the next sprint if we can find the space.",
  "The training session went well, people asked good questions, and a few of them stayed afterwards to talk about how they could use the tool in their own work. That is exactly what we were hoping for.",
];

const _misheard = [
  "I want to test the whole thing by tax messages like text that ranges from a few words to a few hundred, and see how it comes out in each tone.",
  "Before the release we should do some buck fixing, and the get hub issues also need a look from somebody on the team.",
  "The plan is to use chat gpt for the first draft, and then somebody checks the java script that it writes.",
];

const _distractors = [
  'I will also bring the printed copies for everyone.',
  'The team is excited about it, which is great.',
  'I still need to check the numbers once more.',
  'We should keep the notes in the shared folder.',
];

const _closers = [
  'Anyway, let me know if you have any questions.',
  'That is pretty much it for now, thanks.',
  'Okay, that is everything I wanted to cover, talk soon.',
  'So yeah, please keep this in mind and let me know what you think.',
];

String _lower(String s) => s.isEmpty ? s : s[0].toLowerCase() + s.substring(1);

List<CorpusCase> buildCorpus({int count = 48, int seed = 2026}) {
  final rng = Random(seed);
  final forms = _forms.keys.toList();
  const targets = [50, 100, 150, 200, 250, 300];
  final out = <CorpusCase>[];
  for (var i = 0; i < count; i++) {
    final slot = _slots[i % _slots.length];
    final formName = forms[i % forms.length];
    final target = targets[i % targets.length];
    String correction = _forms[formName]!
        .replaceAll('{OLD}', slot.oldSentence)
        .replaceAll('{STEM}', slot.stem)
        .replaceAll('{NEW}', slot.newSentence)
        .replaceAll('{NEW_L}', _lower(slot.newSentence))
        .replaceAll('{FRAG}', slot.newFragment);
    if (rng.nextBool()) {
      // a sentence about something else between the fact and the retraction
      final d = _distractors[rng.nextInt(_distractors.length)];
      if (formName.startsWith('inline') || formName == 'I mean') {
        correction = '$correction $d';
      } else {
        correction =
            correction.replaceFirst(slot.oldSentence, '${slot.oldSentence} $d');
      }
    }
    final parts = <String>[_openers[rng.nextInt(_openers.length)]];
    var words = parts.first.split(' ').length;
    final blocks = [..._blocks, ..._misheard]..shuffle(rng);
    var bi = 0;
    final closer = _closers[rng.nextInt(_closers.length)];
    final need =
        target - correction.split(' ').length - closer.split(' ').length;
    // blocks before the correction, then (for longer texts) one after it
    while (words < need - 20 && bi < blocks.length) {
      parts.add(blocks[bi]);
      words += blocks[bi].split(' ').length;
      bi++;
      if (words > need * 0.6 && !parts.contains(correction)) {
        parts.add(correction);
      }
    }
    if (!parts.contains(correction)) parts.add(correction);
    // short targets: top up with small talk so a "50-word" text is really about 50 words
    var di = rng.nextInt(_distractors.length);
    while (parts.join(' ').split(' ').length + closer.split(' ').length <
        target * 0.85) {
      parts.add(_distractors[di % _distractors.length]);
      di++;
    }
    parts.add(closer);
    out.add(CorpusCase(i, parts.join(' '), slot.newValues, slot.oldValues,
        formName, slot.name));
  }
  return out;
}
