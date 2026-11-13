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
}
