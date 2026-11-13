# Third-party
Dart packages (core is audited by `tool/license_audit.dart`; app packages listed by hand):

| Package | Where | License |
|---|---|---|
| http, test, lints, crypto, intl | core / app | BSD-3-Clause |
| archive | core | MIT |
| flutter_localizations, material_ui, flutter SDK | app | BSD-3-Clause |
| window_manager, tray_manager (legacy bridge) | app | MIT |
| sherpa_onnx 2.0.1 (+ per-platform native packages) | app | Apache-2.0 |
| record 7.x (+ record_windows / record_android) | app | BSD-3-Clause |
| path_provider | app | BSD-3-Clause |

Models / data: Whisper base.en weights (MIT, OpenAI) via the k2-fsa sherpa-onnx release archive; test audio provenance in `test_fixtures/audio/LICENSES.md` (NOT-VERIFIED).
Native libraries bundled by sherpa_onnx (onnxruntime, sherpa-onnx C API): MIT / Apache-2.0 per upstream; confirm exact notices before a release.
