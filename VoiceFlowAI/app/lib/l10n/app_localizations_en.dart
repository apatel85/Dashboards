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
  String get setupTitle => 'Set up VoiceFlow keyboard';

  @override
  String get setupIntro => 'Four quick steps. Your voice stays on this phone.';

  @override
  String get setupEnable => 'Turn on the VoiceFlow keyboard';

  @override
  String get setupEnableBody =>
      'Open keyboard settings and switch VoiceFlow on.';

  @override
  String get setupEnableButton => 'Open keyboard settings';

  @override
  String get setupSelect => 'Choose VoiceFlow as your keyboard';

  @override
  String get setupSelectBody =>
      'Pick VoiceFlow in the list. You can switch back any time with the globe key.';

  @override
  String get setupSelectButton => 'Choose keyboard';

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
      'Tap the box, then tap the microphone on the VoiceFlow keyboard and speak.';

  @override
  String get setupTryHint => 'Dictate here';

  @override
  String get setupDone => 'Done';
}
