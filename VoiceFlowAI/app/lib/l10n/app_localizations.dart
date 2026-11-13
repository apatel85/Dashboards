import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale)
    : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates =
      <LocalizationsDelegate<dynamic>>[
        delegate,
        GlobalMaterialLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
      ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[Locale('en')];

  /// No description provided for @appName.
  ///
  /// In en, this message translates to:
  /// **'VoiceFlow'**
  String get appName;

  /// No description provided for @navHome.
  ///
  /// In en, this message translates to:
  /// **'Home'**
  String get navHome;

  /// No description provided for @navStyle.
  ///
  /// In en, this message translates to:
  /// **'Style'**
  String get navStyle;

  /// No description provided for @navDictionary.
  ///
  /// In en, this message translates to:
  /// **'Dictionary'**
  String get navDictionary;

  /// No description provided for @navPacks.
  ///
  /// In en, this message translates to:
  /// **'Packs'**
  String get navPacks;

  /// No description provided for @navHistory.
  ///
  /// In en, this message translates to:
  /// **'History'**
  String get navHistory;

  /// No description provided for @navSettings.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get navSettings;

  /// No description provided for @comingLater.
  ///
  /// In en, this message translates to:
  /// **'Not built yet. This page arrives in a later update.'**
  String get comingLater;

  /// No description provided for @stateIdle.
  ///
  /// In en, this message translates to:
  /// **'Ready'**
  String get stateIdle;

  /// No description provided for @stateListening.
  ///
  /// In en, this message translates to:
  /// **'Listening…'**
  String get stateListening;

  /// No description provided for @stateProcessing.
  ///
  /// In en, this message translates to:
  /// **'Transcribing…'**
  String get stateProcessing;

  /// No description provided for @statePolishing.
  ///
  /// In en, this message translates to:
  /// **'Polishing…'**
  String get statePolishing;

  /// No description provided for @stateInserted.
  ///
  /// In en, this message translates to:
  /// **'✓ {count, plural, =1{1 word} other{{count} words}}'**
  String stateInserted(int count);

  /// No description provided for @undo.
  ///
  /// In en, this message translates to:
  /// **'Undo'**
  String get undo;

  /// No description provided for @cancel.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancel;

  /// No description provided for @profileLabel.
  ///
  /// In en, this message translates to:
  /// **'Profile: {name}'**
  String profileLabel(String name);

  /// No description provided for @noticeNoSpeech.
  ///
  /// In en, this message translates to:
  /// **'Didn\'t catch that'**
  String get noticeNoSpeech;

  /// No description provided for @noticeNoMicrophone.
  ///
  /// In en, this message translates to:
  /// **'No microphone found'**
  String get noticeNoMicrophone;

  /// No description provided for @noticeModelMissing.
  ///
  /// In en, this message translates to:
  /// **'Speech model not installed'**
  String get noticeModelMissing;

  /// No description provided for @noticeInsertFailed.
  ///
  /// In en, this message translates to:
  /// **'Couldn\'t type here. Text saved.'**
  String get noticeInsertFailed;

  /// No description provided for @noticeAdminWindow.
  ///
  /// In en, this message translates to:
  /// **'This window needs VoiceFlow run as admin. Text saved.'**
  String get noticeAdminWindow;

  /// No description provided for @noticePasswordField.
  ///
  /// In en, this message translates to:
  /// **'Dictation is off in password fields'**
  String get noticePasswordField;

  /// No description provided for @noticeCloudLimit.
  ///
  /// In en, this message translates to:
  /// **'Free limit reached. Used on-device cleanup.'**
  String get noticeCloudLimit;

  /// No description provided for @actionOpenSettings.
  ///
  /// In en, this message translates to:
  /// **'Open settings'**
  String get actionOpenSettings;

  /// No description provided for @actionDownload.
  ///
  /// In en, this message translates to:
  /// **'Download'**
  String get actionDownload;

  /// No description provided for @actionCopy.
  ///
  /// In en, this message translates to:
  /// **'Copy'**
  String get actionCopy;

  /// No description provided for @homeStatusTitle.
  ///
  /// In en, this message translates to:
  /// **'Status'**
  String get homeStatusTitle;

  /// No description provided for @homeHotkeyReminder.
  ///
  /// In en, this message translates to:
  /// **'Hold {hotkey} and speak. Double-tap for hands-free.'**
  String homeHotkeyReminder(String hotkey);

  /// No description provided for @tryItTitle.
  ///
  /// In en, this message translates to:
  /// **'Try it'**
  String get tryItTitle;

  /// No description provided for @tryItHint.
  ///
  /// In en, this message translates to:
  /// **'Type or paste what you would say, for example: um we shipped twelve features'**
  String get tryItHint;

  /// No description provided for @tryItOutput.
  ///
  /// In en, this message translates to:
  /// **'Result'**
  String get tryItOutput;

  /// No description provided for @tryItEmpty.
  ///
  /// In en, this message translates to:
  /// **'Your cleaned-up text appears here.'**
  String get tryItEmpty;

  /// No description provided for @tryItCopied.
  ///
  /// In en, this message translates to:
  /// **'Copied'**
  String get tryItCopied;

  /// No description provided for @recentTitle.
  ///
  /// In en, this message translates to:
  /// **'Recent dictations'**
  String get recentTitle;

  /// No description provided for @recentEmpty.
  ///
  /// In en, this message translates to:
  /// **'No dictations yet. Hold {hotkey} and speak.'**
  String recentEmpty(String hotkey);

  /// No description provided for @styleTitle.
  ///
  /// In en, this message translates to:
  /// **'Style'**
  String get styleTitle;

  /// No description provided for @styleIntro.
  ///
  /// In en, this message translates to:
  /// **'Pick how your words are cleaned up. Examples use the on-device formatter.'**
  String get styleIntro;

  /// No description provided for @styleBefore.
  ///
  /// In en, this message translates to:
  /// **'You say'**
  String get styleBefore;

  /// No description provided for @styleAfter.
  ///
  /// In en, this message translates to:
  /// **'You get'**
  String get styleAfter;

  /// No description provided for @styleDefault.
  ///
  /// In en, this message translates to:
  /// **'Default'**
  String get styleDefault;

  /// No description provided for @styleMakeDefault.
  ///
  /// In en, this message translates to:
  /// **'Make default'**
  String get styleMakeDefault;

  /// No description provided for @privacyPromise.
  ///
  /// In en, this message translates to:
  /// **'Your audio and text stay on this device unless you switch on Cloud polish.'**
  String get privacyPromise;

  /// No description provided for @trayStillRunning.
  ///
  /// In en, this message translates to:
  /// **'VoiceFlow is still running here'**
  String get trayStillRunning;
}

class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) =>
      <String>['en'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {
  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en':
      return AppLocalizationsEn();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.',
  );
}
