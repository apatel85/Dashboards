; VoiceFlow installer (Inno Setup 6). Built by .github/workflows/voiceflow-release.yml
; Per-user install by default: no admin rights, matches the per-user "start at login" entry.
#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef SourceDir
  #define SourceDir "..\app\build\windows\x64\runner\Release"
#endif

[Setup]
AppId={{4F46E5A2-7C1D-4B8E-9F10-2A6B3C5D7E91}
AppName=VoiceFlow
AppVersion={#AppVersion}
AppPublisher=VoiceFlow (personal project)
DefaultDirName={autopf}\VoiceFlow
DefaultGroupName=VoiceFlow
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
OutputDir=..\dist
OutputBaseFilename=VoiceFlow-Setup-{#AppVersion}
Compression=lzma2
SolidCompression=yes
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
WizardStyle=modern
UninstallDisplayIcon={app}\voiceflow_app.exe
CloseApplications=yes
RestartApplications=no

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; Flags: unchecked
Name: "autostart"; Description: "Start VoiceFlow when I sign in"; Flags: unchecked

[Files]
Source: "{#SourceDir}\*"; DestDir: "{app}"; Flags: recursesubdirs createallsubdirs ignoreversion

[Icons]
Name: "{autoprograms}\VoiceFlow"; Filename: "{app}\voiceflow_app.exe"
Name: "{autodesktop}\VoiceFlow"; Filename: "{app}\voiceflow_app.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueName: "VoiceFlow"; ValueType: string; ValueData: """{app}\voiceflow_app.exe"" --background"; Tasks: autostart

[Run]
Filename: "{app}\voiceflow_app.exe"; Description: "Launch VoiceFlow"; Flags: nowait postinstall skipifsilent

[Code]
// The app can also switch start-at-login on from its tray menu, so always clean it up.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    RegDeleteValue(HKEY_CURRENT_USER, 'Software\Microsoft\Windows\CurrentVersion\Run', 'VoiceFlow');
end;
