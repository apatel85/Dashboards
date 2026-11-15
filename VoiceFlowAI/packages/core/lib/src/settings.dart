import 'dart:convert';

/// App settings with schema versioning and forward migrations (spec §11).
class Settings {
  Settings();
  static const currentVersion = 2;
  int version = currentVersion;
  String defaultProfileId = 'casual';

  /// Professional is one mode with tone levels (spec section 8). `neutral` is the default;
  /// `formal` expands contractions and uses the formal wording.
  String professionalTone = 'neutral';

  /// Casual: write "gonna" as "going to", "wanna" as "want to" (on by default; some people
  /// prefer to keep them in texts).
  bool spokenForms = true;
  Map<String, String> perAppProfiles = {};
  String hotkey = 'F9';
  String language = 'en';
  bool soundsOn = true;
  bool historyEnabled = true;
  int retentionDays = 7;
  bool saveRecordings = false;

  /// Cloud polish: off by default; requires explicit consent.
  bool cloudPolish = false;
  bool cloudConsent = false;

  /// Replace names, numbers, amounts, dates, e-mail addresses and phone numbers with placeholders
  /// before text goes to the cloud, and put them back on the device (spec section 13).
  bool maskCloud = true;
  String cloudPreset = 'proxy'; // proxy | ollama | custom
  String ollamaUrl = 'http://localhost:11434/v1';
  String ollamaModel = '';
  bool onboardingDone = false;
  String? micDeviceId;
  List<String> activePacks = ['general_business'];
  List<String> dictionary = [];
  Map<String, String> corrections = {};

  /// AI Prompting: layout (auto | labels | xml | markdown) and answer length (concise_first | as_said).
  String promptFormat = 'auto';
  String aiLength = 'concise_first';

  /// True only if the user opted in AND consented.
  bool get cloudActive => cloudPolish && cloudConsent;

  Map<String, dynamic> toJson() => {
        'version': version,
        'defaultProfileId': defaultProfileId,
        'professionalTone': professionalTone,
        'spokenForms': spokenForms,
        'perAppProfiles': perAppProfiles,
        'hotkey': hotkey,
        'language': language,
        'soundsOn': soundsOn,
        'historyEnabled': historyEnabled,
        'retentionDays': retentionDays,
        'saveRecordings': saveRecordings,
        'cloudPolish': cloudPolish,
        'cloudConsent': cloudConsent,
        'maskCloud': maskCloud,
        'cloudPreset': cloudPreset,
        'ollamaUrl': ollamaUrl,
        'ollamaModel': ollamaModel,
        'onboardingDone': onboardingDone,
        'micDeviceId': micDeviceId,
        'activePacks': activePacks,
        'dictionary': dictionary,
        'corrections': corrections,
        'promptFormat': promptFormat,
        'aiLength': aiLength,
      };

  /// Export without secrets. There are none in Settings by design; history is
  /// exported separately and only if the user ticks it.
  String export() => jsonEncode(toJson());

  static Map<String, dynamic> migrate(Map<String, dynamic> j) {
    var m = Map<String, dynamic>.from(j);
    var v = (m['version'] as int?) ?? 0;
    if (v < 1) {
      // v0 stored a single `profile` key.
      m['defaultProfileId'] = m.remove('profile') ?? 'casual';
      v = 1;
    }
    if (v < 2) {
      // v2 dropped any stored API key: keys never live in settings.
      m.remove('apiKey');
      m.remove('geminiKey');
      m['cloudPreset'] ??= 'proxy';
      v = 2;
    }
    m['version'] = v;
    return m;
  }

  factory Settings.fromJson(Map<String, dynamic> raw) {
    final j = migrate(raw);
    final s = Settings();
    s.defaultProfileId = j['defaultProfileId'] as String? ?? s.defaultProfileId;
    s.spokenForms = j['spokenForms'] as bool? ?? true;
    s.professionalTone =
        j['professionalTone'] == 'formal' ? 'formal' : 'neutral';
    s.perAppProfiles =
        Map<String, String>.from(j['perAppProfiles'] as Map? ?? const {});
    s.hotkey = j['hotkey'] as String? ?? s.hotkey;
    s.language = j['language'] as String? ?? s.language;
    s.soundsOn = j['soundsOn'] as bool? ?? s.soundsOn;
    s.historyEnabled = j['historyEnabled'] as bool? ?? s.historyEnabled;
    s.retentionDays = j['retentionDays'] as int? ?? s.retentionDays;
    s.saveRecordings = j['saveRecordings'] as bool? ?? false;
    s.cloudPolish = j['cloudPolish'] as bool? ?? false;
    s.cloudConsent = j['cloudConsent'] as bool? ?? false;
    s.maskCloud = j['maskCloud'] as bool? ?? true;
    s.cloudPreset = j['cloudPreset'] as String? ?? 'proxy';
    s.ollamaUrl = j['ollamaUrl'] as String? ?? s.ollamaUrl;
    s.ollamaModel = j['ollamaModel'] as String? ?? '';
    s.onboardingDone = j['onboardingDone'] as bool? ?? false;
    s.micDeviceId = j['micDeviceId'] as String?;
    s.activePacks =
        List<String>.from(j['activePacks'] as List? ?? s.activePacks);
    s.dictionary = List<String>.from(j['dictionary'] as List? ?? const []);
    s.corrections =
        Map<String, String>.from(j['corrections'] as Map? ?? const {});
    s.promptFormat = j['promptFormat'] as String? ?? s.promptFormat;
    s.aiLength = j['aiLength'] as String? ?? s.aiLength;
    return s;
  }
}
