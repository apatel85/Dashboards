// ignore: unused_import
import 'package:intl/intl.dart' as intl;

import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appName => 'VoiceFlow';

  @override
  String get navHome => 'Home';

  @override
  String get navStyle => 'Style';

  @override
  String get navDictionary => 'Dictionary';

  @override
  String get navPacks => 'Packs';

  @override
  String get navHistory => 'History';

  @override
  String get navSettings => 'Settings';

  @override
  String get comingLater =>
      'Not built yet. This page arrives in a later update.';

  @override
  String get stateIdle => 'Ready';

  @override
  String get stateListening => 'Listening…';

  @override
  String get stateProcessing => 'Transcribing…';

  @override
  String get statePolishing => 'Polishing…';

  @override
  String stateInserted(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count words',
      one: '1 word',
    );
    return '✓ $_temp0';
  }

  @override
  String get undo => 'Undo';

  @override
  String get cancel => 'Cancel';

  @override
  String profileLabel(String name) {
    return 'Profile: $name';
  }

  @override
  String get noticeNoSpeech => 'Didn\'t catch that';

  @override
  String get noticeNoMicrophone => 'No microphone found';

  @override
  String get noticeModelMissing => 'Speech model not installed';

  @override
  String get noticeInsertFailed => 'Couldn\'t type here. Text saved.';

  @override
  String get noticeAdminWindow =>
      'This window needs VoiceFlow run as admin. Text saved.';

  @override
  String get noticePasswordField => 'Dictation is off in password fields';

  @override
  String get noticeCloudLimit => 'Free limit reached. Used on-device cleanup.';

  @override
  String get actionOpenSettings => 'Open settings';

  @override
  String get actionDownload => 'Download';

  @override
  String get actionCopy => 'Copy';

  @override
  String get homeStatusTitle => 'Status';

  @override
  String homeHotkeyReminder(String hotkey) {
    return 'Hold $hotkey and speak. Double-tap for hands-free.';
  }

  @override
  String get tryItTitle => 'Try it';

  @override
  String get tryItHint =>
      'Type or paste what you would say, for example: um we shipped twelve features';

  @override
  String get tryItOutput => 'Result';

  @override
  String get tryItEmpty => 'Your cleaned-up text appears here.';

  @override
  String get tryItCopied => 'Copied';

  @override
  String get recentTitle => 'Recent dictations';

  @override
  String recentEmpty(String hotkey) {
    return 'No dictations yet. Hold $hotkey and speak.';
  }

  @override
  String get styleTitle => 'Style';

  @override
  String get styleIntro =>
      'Pick how your words are cleaned up. Examples use the on-device formatter.';

  @override
  String get styleBefore => 'You say';

  @override
  String get styleAfter => 'You get';

  @override
  String get styleDefault => 'Default';

  @override
  String get styleMakeDefault => 'Make default';

  @override
  String get privacyPromise =>
      'Your audio and text stay on this device unless you switch on Cloud polish.';

  @override
  String get trayStillRunning => 'VoiceFlow is still running here';

  @override
  String get recordButton => 'Record';

  @override
  String get stopButton => 'Stop';

  @override
  String get recordHint =>
      'Press Record, speak, then press Stop. The text is copied for you.';

  @override
  String get onbTitle => 'Set up VoiceFlow';

  @override
  String onbStep(int n) {
    return 'Step $n of 4';
  }

  @override
  String get onbWelcomeTitle => 'Welcome';

  @override
  String get onbWelcomeBody => 'VoiceFlow turns your voice into clean text.';

  @override
  String get onbMicTitle => 'Choose your microphone';

  @override
  String get onbMicHint => 'Say something. The bar moves when we can hear you.';

  @override
  String get onbMicAllow => 'Allow microphone';

  @override
  String get onbMicNone => 'No microphone found';

  @override
  String get onbMicDenied =>
      'Microphone access is off. Turn it on in system settings.';

  @override
  String get onbModelTitle => 'Download the speech model';

  @override
  String onbModelBody(int size) {
    return 'One-time download, $size MB. After this, dictation works offline.';
  }

  @override
  String get onbDownload => 'Download';

  @override
  String get onbPause => 'Pause';

  @override
  String get onbRetry => 'Try again';

  @override
  String onbDownloading(int percent) {
    return 'Downloading… $percent%';
  }

  @override
  String get onbVerifying => 'Checking the file…';

  @override
  String get onbExtracting => 'Unpacking… this takes about 30 seconds';

  @override
  String get onbInstalled => 'Speech model installed';

  @override
  String get onbPaused => 'Paused. Your progress is saved.';

  @override
  String get onbModelFailed =>
      'The download did not finish. Your progress is saved.';

  @override
  String get onbModelIntegrity =>
      'The file failed its safety check and was discarded. Try again.';

  @override
  String get onbTryTitle => 'Try it';

  @override
  String get onbTrySentence =>
      'Read this aloud: “Hi John, thanks for the update. Can we meet Thursday?”';

  @override
  String get onbNext => 'Next';

  @override
  String get onbBack => 'Back';

  @override
  String get onbSkip => 'Skip';

  @override
  String get onbDone => 'You\'re set';

  @override
  String get setupTitle => 'Set up VoiceFlow';

  @override
  String get setupIntro => 'Five quick steps. Your voice stays on this phone.';

  @override
  String get setupMic => 'Allow the microphone';

  @override
  String get setupMicBody =>
      'Needed to hear you. Audio is processed on this phone and never saved.';

  @override
  String get setupMicButton => 'Allow microphone';

  @override
  String get setupMicDenied =>
      'Microphone access is off. Turn it on in the system settings for VoiceFlow.';

  @override
  String get setupModel => 'Download the speech model';

  @override
  String get setupTry => 'Try it';

  @override
  String get setupTryBody =>
      'Tap the box, then tap the floating VoiceFlow button and speak.';

  @override
  String get setupTryHint => 'Dictate here';

  @override
  String get setupDone => 'Done';

  @override
  String get packsIntro =>
      'Packs teach VoiceFlow the words, abbreviations and note templates of your work. They only change what you dictate while they are on.';

  @override
  String get packsActive => 'On (top one wins a conflict)';

  @override
  String get packsAvailable => 'Available';

  @override
  String get packsNoneActive => 'No pack is on.';

  @override
  String get packsImport => 'Import a pack file';

  @override
  String packsImported(String name) {
    return 'Pack added: $name';
  }

  @override
  String get packsRefusedTitle => 'This pack could not be used';

  @override
  String packsRefusedFile(String file) {
    return 'File: $file';
  }

  @override
  String get packsOk => 'OK';

  @override
  String get packsLocalOnly => 'Stays on this device';

  @override
  String get packsMoveUp => 'Higher priority';

  @override
  String get packsMoveDown => 'Lower priority';

  @override
  String get packsRemove => 'Remove';

  @override
  String packsDetails(int words, String version) {
    return '$words words · version $version';
  }

  @override
  String get packsProblems => 'Packs that could not be loaded';

  @override
  String get packsDismiss => 'Dismiss';

  @override
  String packSuggest(String name) {
    return 'Turn on the $name pack?';
  }

  @override
  String get packSuggestOn => 'Turn on';

  @override
  String packSuggestWhy(String why) {
    return 'Suggested because of: $why';
  }

  @override
  String get setTitle => 'Settings';

  @override
  String get setCloudTitle => 'Cloud polish';

  @override
  String get setCloudBody =>
      'Optional. After the on-device formatting, VoiceFlow can ask an AI service to tidy your text a little more. Only text is sent, never audio. Off by default.';

  @override
  String get setCloudSwitch => 'Use cloud polish';

  @override
  String get setConsentTitle => 'Send text for polishing?';

  @override
  String get setConsentBody =>
      'When this is on, the text you dictate (never your voice) is sent to a function run for this app, which passes it to an AI service (Google Gemini\'s free tier, with backups) and returns a tidier version. The service sees your words. It is not used while a pack that keeps data on this device is on. You can turn it off at any time.';

  @override
  String get setConsentAgree => 'I agree, turn on';

  @override
  String get setCancel => 'Cancel';

  @override
  String get setPresetProxy => 'VoiceFlow service (hosted)';

  @override
  String get setPresetOllama => 'A server on this computer (Ollama)';

  @override
  String get setOllamaUrl => 'Server address';

  @override
  String get setOllamaModel => 'Model name';

  @override
  String get setTest => 'Test polish';

  @override
  String get setTesting => 'Testing…';

  @override
  String setTodayCount(int n) {
    return 'Requests today: $n';
  }

  @override
  String get setPrivacyTitle => 'Privacy';

  @override
  String get setPrivacyBody =>
      'Audio stays on this device and is never saved. No accounts, analytics or crash reports. Dictated text is not kept: there is no history yet. Settings and imported packs are stored in your user data folder.';

  @override
  String get setGeneralTitle => 'General';

  @override
  String get setSounds => 'Sounds';

  @override
  String get setBackupTitle => 'Back up and restore';

  @override
  String get setBackupBody =>
      'Settings, dictionary and pack choices as a small file. It never contains keys or dictated text, and it cannot turn cloud polish on: you do that here, on each device.';

  @override
  String get setExport => 'Copy settings to clipboard';

  @override
  String get setExported => 'Copied.';

  @override
  String get setImport => 'Restore from a file';

  @override
  String get setImported => 'Settings restored.';

  @override
  String get setImportRefused => 'This file could not be used';

  @override
  String get setAboutTitle => 'About';

  @override
  String setVersion(String v) {
    return 'Version $v';
  }

  @override
  String get setLicenses => 'Open-source licenses';

  @override
  String get setupOverlay => 'Allow the floating button';

  @override
  String get setupOverlayBody =>
      'Lets VoiceFlow show a small button over other apps. Find VoiceFlow in the list and switch it on.';

  @override
  String get setupOverlayButton => 'Open display settings';

  @override
  String get setupAccess => 'Turn on the typing service';

  @override
  String get setupAccessBody =>
      'VoiceFlow types your words into the box you are using through an Android accessibility service. It only inserts text you dictated, never reads or stores what is on screen, and refuses password fields. Open the list, choose VoiceFlow and switch it on.';

  @override
  String get setupAccessButton => 'Open accessibility settings';

  @override
  String get setupBubble => 'Show the floating button';

  @override
  String get setupBubbleBody =>
      'Puts the button on screen. Tap it to start dictating, tap again to stop. Drag it anywhere.';

  @override
  String get setupBubbleButton => 'Show button';

  @override
  String get setupAccessRestricted =>
      'If VoiceFlow is greyed out or says \"App was denied access\", Android is protecting you from apps installed outside the Play Store. Tap \"Open app info\", then the ⋮ menu at the top right, then \"Allow restricted settings\". After that, switch the service on.';

  @override
  String get setupAppInfoButton => 'Open app info';

  @override
  String get setAiTitle => 'AI Prompting';

  @override
  String get setAiBody =>
      'How a dictated AI prompt is laid out and how long its answer should be. Claude, ChatGPT and other AI apps are recognised automatically.';

  @override
  String get setPromptFormat => 'Prompt layout';

  @override
  String get setFormatAuto =>
      'Automatic (XML tags for Claude, ### sections for ChatGPT, labelled lines otherwise)';

  @override
  String get setFormatLabels => 'Labelled lines (Task: …)';

  @override
  String get setFormatXml => 'XML tags (<task>…</task>)';

  @override
  String get setFormatMarkdown => 'Markdown sections (### Task)';

  @override
  String get setAiLength => 'Answer length';

  @override
  String get setLengthConcise =>
      'Start concise (about 200 words) and offer more detail';

  @override
  String get setLengthAsSaid => 'Exactly what I say (no added length)';

  @override
  String get styleAppsTitle => 'Style for each app';

  @override
  String get styleAppsBody =>
      'VoiceFlow picks a style from the app you are typing in: email apps Professional, work chat Business, personal chat Casual, AI apps AI Prompting. Change any of them here. Apps not listed use your default style.';

  @override
  String get styleAppAuto => 'Automatic';

  @override
  String get styleAppAddTitle => 'Add another app';

  @override
  String get styleAppAddHint =>
      'App id (Android package like com.example.app, or a program like notes.exe)';

  @override
  String get styleAppAddButton => 'Add';
}
