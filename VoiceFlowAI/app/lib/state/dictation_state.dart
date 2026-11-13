/// States and notices from spec §9.2 (shared by Windows and Android).
enum DictationUiState { idle, listening, processing, polishing, inserted, notice }

enum NoticeKind {
  noSpeech,
  noMicrophone,
  modelMissing,
  insertFailed,
  adminWindow,
  passwordField,
  cloudLimit;

  /// Notices that offer a one-tap fix (spec §9.1 rule 6).
  bool get hasAction => switch (this) {
        noMicrophone || modelMissing || insertFailed || adminWindow => true,
        _ => false,
      };
}
