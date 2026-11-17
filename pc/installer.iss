; Installateur Windows de SimRaceDash (Inno Setup) — compilé par GitHub Actions
#define AppVer GetEnv("APP_VER")
[Setup]
AppId={{3F6B1C2A-7D4E-4B8A-9C2F-5E1D7A9B4C30}
AppName=SimRaceDash
AppVersion={#AppVer}
AppVerName=SimRaceDash {#AppVer}
AppPublisher=SimRaceDash
DefaultDirName={autopf}\SimRaceDash
DefaultGroupName=SimRaceDash
DisableProgramGroupPage=yes
UninstallDisplayIcon={app}\SimRaceDash.exe
UninstallDisplayName=SimRaceDash
OutputDir=..\out
OutputBaseFilename=SimRaceDash-Setup
SetupIconFile=simracedash.ico
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\dist\SimRaceDash\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
Type: filesandordirs; Name: "{app}\_internal"

[Icons]
Name: "{group}\SimRaceDash"; Filename: "{app}\SimRaceDash.exe"
Name: "{autodesktop}\SimRaceDash"; Filename: "{app}\SimRaceDash.exe"; Tasks: desktopicon

[Run]
; pare-feu : le téléphone et l'iPad doivent pouvoir joindre le PC, et la PS5 lui envoyer la télémétrie
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""SimRaceDash"""; Flags: runhidden
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall add rule name=""SimRaceDash"" dir=in action=allow program=""{app}\SimRaceDash.exe"" enable=yes profile=any"; Flags: runhidden
Filename: "{app}\SimRaceDash.exe"; Description: "{cm:LaunchProgram,SimRaceDash}"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "{sys}\netsh.exe"; Parameters: "advfirewall firewall delete rule name=""SimRaceDash"""; Flags: runhidden; RunOnceId: "fw"
