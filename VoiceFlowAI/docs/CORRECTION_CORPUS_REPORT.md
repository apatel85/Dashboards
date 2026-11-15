# Correction and flow test: what was tested and what it found

Added with 0.7.3 after the owner's phone test (a retraction sentence was removed but the wrong
day and time stayed, and "text messages" came out as "tax messages").

## Method
`packages/core/test/support/correction_corpus.dart` generates **48 typed-style dictations** (seeded, so the
same 48 every run): words 44-312 (median 185).. Each one rambles with fillers ("so basically", "you
know", "kind of"), states a fact, retracts it, and gives the right value. The 48 cover
**9 kinds of fact** (day+time, time, day, date, amount, quantity, percent, name, place) times
**8 retraction styles** ("No, sorry." as its own sentence, inline "no sorry", leading "Sorry,", "Scratch that",
"Actually", "Wait, that's wrong.", "Negate that.", "I mean"), with a sentence about something else between the
fact and the retraction in about half of them, and three look-alike mishearings mixed in ("tax messages",
"buck fixing", "get hub / java script / chat gpt").

Every dictation is run through all four tones (192 outputs) and checked automatically: the right value is
there, the wrong one is gone, no retraction words are left, no "um/uh", no double spaces or stray
punctuation, capital start and a full stop at the end, no sentence starting with "So" in Business and
Professional, the misheard words are fixed, "a/an" agree with the next word, "just so you know" is not
mangled, "a few hundred" is not turned into "a few 100", and the length is sane (neither gutted nor padded).
`dart test test/correction_corpus_test.dart` (from `packages/core`) runs it.

## What it found (before the fixes: 41 of 48 failed in every tone)
* A retraction that stands alone as a sentence ("No, sorry.") was thrown away without correcting anything,
  which is exactly the owner's bug. Fixed: the next sentence is now treated as the correction.
* Corrections only understood days and times. Now also dates, amounts, percents, quantities, names and places,
  and they look back up to four sentences, so an unrelated sentence in between no longer hides the target.
* "March 5th" was typed "March 5 th" (the ordinal was split). Fixed.
* "a few hundred" became "a few 100". Fixed.
* "Just so you know" lost "you know" and became "Just so,". Fixed.
* "a excellent" / "an dictation" (the swapped word did not match its "a/an"). Fixed for every tone.
* Opener chatter ("Alright, so let's try this again.") stayed in Business/Professional, and a leftover "yeah"
  after a dropped "So" became "Yes". Fixed.

## New in 0.7.3
* **Context fixes**: look-alike words are chosen by the words around them (text/tax, bug/buck, cache/cash,
  SQL/sequel), plus fixed mis-splits (get hub, java script, chat gpt, o auth, a p i ...). A word is only
  switched when the other one has cue words nearby and the spoken one has none: "bang for the buck",
  "20 bucks", "tax on income", "cash flow" and "the movie sequel" are left alone.
* **Retraction with no retraction words**: if the speech model drops "no, sorry", a very short
  "It's on Tuesday at 10 am." right after a sentence with the same kind of values replaces it. It never fires
  when the sentence adds anything ("It's Tuesday for members only", "It's on Zoom").

## Samples (real output)

### Case #0 - day+time, sentence "No, sorry.", 50 words

**Typed:** Alright, so let's try this again. We have a meeting scheduled for Monday at 9 am with the client. No, sorry. It's on Tuesday at 10 am. The team is excited about it, which is great. So yeah, please keep this in mind and let me know what you think.

**business:**

```
Let's try this again. We have a meeting scheduled for Tuesday at 10 am with the client. The team is excited about it, which is great. Please keep this in mind and let me know what you think.
```

**professional:**

```
Let's try this again. We have a meeting scheduled for Tuesday at 10 am with the client. The team is excited about it, which is great. Please keep this in mind and let me know what you think.
```

**ai_prompting:**

```
We have a meeting scheduled for Tuesday at 10 am with the client. The team is excited about it, which is great. Keep this in mind and let me know what you think.
```


### Case #17 - place, inline "no sorry", 312 words

**Typed:** So I was just going through my notes and there are a few things. The project has been moving along, kind of slowly, but I think the team is doing a really good job. We hit a couple of snags with the vendor, and basically they keep changing the requirements on us, which is a little frustrating. Let me also mention that the security review came back fine. There were two small findings, nothing serious, and we already have a plan to fix both of them as part of the normal work. Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. We also need to hire someone for the support team. I have a couple of candidates in mind, and basically I want somebody who is patient and good with customers, rather than somebody who just knows the product. We will meet at the Boston office to go through the plan, no sorry, Chicago office. The team is excited about it, which is great. Customers have been asking for a way to export their data, which makes sense, and it is not too hard to build. I would say it is a good candidate for the next sprint if we can find the space. Before the release we should do some buck fixing, and the get hub issues also need a look from somebody on the team. I talked to the finance team and they said we need to be more careful about spending, you know, especially on the tools we are not using. Honestly I think we can cut a few of the subscriptions without anyone noticing. Okay, that is everything I wanted to cover, talk soon.

**business:**

```
I was just going through my notes and there are a few things. The project has been moving along, kind of slowly, but I think the team is doing a really good job. We hit a few snags with the vendor, and basically they keep changing the requirements on us, which is a little frustrating. Let me also mention that the security review came back fine.

There were two small findings, nothing serious, and we already have a plan to fix both of them as part of the normal work. Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. We also need to hire someone for the support team.

I have a few candidates in mind, and basically I want somebody who is patient and good with customers, rather than somebody who just knows the product. We will meet at the Chicago office to go through the plan. The team is excited about it, which is great. Customers have been asking for a way to export their data, which makes sense, and it is not too hard to build.

I would say it is a good candidate for the next sprint if we can find the space. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. I talked to the finance team and they said we need to be more careful about spending, you know, especially on the tools we are not using. Honestly I think we can cut a few of the subscriptions without anyone noticing.

Okay, that is everything I wanted to cover, talk soon.
```

**professional:**

```
I was just going through my notes and there are a few things. The project has been moving along, kind of slowly, but I believe the team is doing an excellent job. We hit a few snags with the vendor, and they keep changing the requirements on us, which is a little frustrating. Let me also mention that the security review came back fine.

There were two small findings, nothing serious, and we already have a plan to fix both of them as part of the normal work. Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. We also need to hire someone for the support team.

I have a few candidates in mind, and I would like somebody who is patient and good with customers, rather than somebody who just knows the product. We will meet at the Chicago office to go through the plan. The team is excited about it, which is great. Customers have been asking for a way to export their data, which makes sense, and it is not too hard to build.

I would say it is a good candidate for the next sprint if we can find the space. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. I talked to the finance team and they said we need to be more careful about spending, especially on the tools we are not using. I believe we can cut a few of the subscriptions without anyone noticing.

Understood, that is everything I wanted to cover, speak soon.
```

**ai_prompting:**

```
I was just going through my notes and there are a few things. The project has been moving along, slowly, but the team is doing a good job. We hit a couple of snags with the vendor, and they keep changing the requirements on us, which is a little frustrating. Let me also mention that the security review came back fine. There were two small findings, nothing serious, and we already have a plan to fix both of them as part of the normal work. The office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. We also need to hire someone for the support team. I have a couple of candidates in mind, and I want somebody who is patient and good with customers, rather than somebody who just knows the product. We will meet at the Chicago office to go through the plan. The team is excited about it, which is great. Customers have been asking for a way to export their data, which makes sense, and it is not too hard to build. I would say it is a good candidate for the next sprint if we can find the space. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. I talked to the finance team and they said we need to be more careful about spending, especially on the tools we are not using. We can cut a few of the subscriptions without anyone noticing. That is everything I wanted to cover, talk soon.
```


### Case #29 - day, wait that is wrong, 308 words

**Typed:** Hi, so I wanted to give you a quick update, you know, before the week gets away from us. Before the release we should do some buck fixing, and the get hub issues also need a look from somebody on the team. The training session went well, people asked good questions, and a few of them stayed afterwards to talk about how they could use the tool in their own work. That is exactly what we were hoping for. Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. The project has been moving along, kind of slowly, but I think the team is doing a really good job. We hit a couple of snags with the vendor, and basically they keep changing the requirements on us, which is a little frustrating. The design review is on Wednesday. I will also bring the printed copies for everyone. Wait, that's wrong. It is on Thursday. I want to test the whole thing by tax messages like text that ranges from a few words to a few hundred, and see how it comes out in each tone. The marketing team sent over the new designs and honestly they look great. There are a few small things, like the font being too small on mobile, but overall I am happy and I think the client will be too. I talked to the finance team and they said we need to be more careful about spending, you know, especially on the tools we are not using. Honestly I think we can cut a few of the subscriptions without anyone noticing. Anyway, let me know if you have any questions.

**business:**

```
I wanted to give you a quick update, you know, before the week gets away from us. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. The training session went well, people asked good questions, and a few of them stayed afterwards to discuss how they could use the tool in their own work. That is exactly what we were hoping for.

Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. The project has been moving along, kind of slowly, but I think the team is doing a really good job. We hit a few snags with the vendor, and basically they keep changing the requirements on us, which is a little frustrating.

The design review is on Thursday. I will also bring the printed copies for everyone. I want to test the whole thing by text messages like text that ranges from a few words to a few hundred, and see how it comes out in each tone. The marketing team sent over the new designs and honestly they look great.

There are a few small things, like the font being too small on mobile, but overall I am happy and I think the client will be too. I talked to the finance team and they said we need to be more careful about spending, you know, especially on the tools we are not using. Honestly I think we can cut a few of the subscriptions without anyone noticing. Anyway, let me know if you have any questions.
```

**professional:**

```
I wanted to give you a quick update, before the week gets away from us. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. The training session went well, people asked good questions, and a few of them stayed afterwards to discuss how they could use the tool in their own work. That is exactly what we were hoping for.

Just so you know, the office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. The project has been moving along, kind of slowly, but I believe the team is doing an excellent job. We hit a few snags with the vendor, and they keep changing the requirements on us, which is a little frustrating.

The design review is on Thursday. I will also bring the printed copies for everyone. I would like to test the whole thing by text messages like text that ranges from a few words to a few hundred, and see how it comes out in each tone. The marketing team sent over the new designs and they look great.

There are a few small things, like the font being too small on mobile, but overall I am happy and I believe the client will be too. I talked to the finance team and they said we need to be more careful about spending, especially on the tools we are not using. I believe we can cut a few of the subscriptions without anyone noticing.

In any case, let me know if you have any questions.
```

**ai_prompting:**

```
I wanted to give you a quick update, before the week gets away from us. Before the release we should do some bug fixing, and the GitHub issues also need a look from somebody on the team. The training session went well, people asked good questions, and a few of them stayed afterwards to talk about how they could use the tool in their own work. That is exactly what we were hoping for. The office will be a bit noisy because they are fixing the elevator. If you need quiet time to work, you can use the small room at the back, or just work from home that day, whatever is easier. The project has been moving along, slowly, but the team is doing a good job. We hit a couple of snags with the vendor, and they keep changing the requirements on us, which is a little frustrating. The design review is on Thursday. I will also bring the printed copies for everyone. Test the whole thing by text messages like text that ranges from a few words to a few hundred, and see how it comes out in each tone. The marketing team sent over the new designs and they look great. There are a few small things, like the font being too small on mobile, but overall I am happy and the client will be too. I talked to the finance team and they said we need to be more careful about spending, especially on the tools we are not using. We can cut a few of the subscriptions without anyone noticing. Let me know if you have any questions.
```


## What this does not prove
* The checks prove facts and tidiness, not that the prose is elegant. I read samples in all tones and the
  results are sensible, but formatting here is rule-based: a run-on sentence stays a run-on sentence, and
  Business/Professional word upgrades are a fixed list.
* The speech model's own errors are only fixed where a rule exists (the pairs above). A new mishearing needs a
  new pair; the lists are in `packages/core/lib/src/context_fixes.dart`.
* A retraction that names no day, time, date, amount, percent, quantity, name or place, and shares too few
  words with what it corrects, is left as spoken (with an explicit "no sorry"-type phrase removed).
* Typed-style text is a stand-in for real speech: this has not been measured on a real voice.
