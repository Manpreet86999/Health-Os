const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = __dirname, pkg = require('./package.json');
execFileSync(process.execPath, [path.join(root, 'scripts/prepare-release-runtime.mjs')], { cwd: root, stdio: 'inherit' });
if (!/^\d+\.\d+\.\d+$/.test(pkg.version)) throw new Error('Use a stable major.minor.patch version.');
execFileSync(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
const stage = path.join(root, 'installer/stage'), release = path.join(root, `outputs/release-v${pkg.version}`);
if (path.resolve(stage) !== path.resolve(root, 'installer', 'stage')) throw new Error('Unexpected installer stage path.');
fs.rmSync(stage, { recursive: true, force: true });
fs.mkdirSync(stage, { recursive: true }); fs.mkdirSync(release, { recursive: true });
fs.cpSync(path.join(root, 'dist/client'), path.join(stage, 'dist/client'), { recursive: true });
for (const name of ['serve-web.mjs', 'desktop-updater.mjs', 'launch-health-os.mjs']) {
  fs.mkdirSync(path.join(stage, 'scripts'), { recursive: true }); fs.copyFileSync(path.join(root, 'scripts', name), path.join(stage, 'scripts', name));
}
fs.mkdirSync(path.join(stage, 'runtime'), { recursive: true });
fs.copyFileSync(process.execPath, path.join(stage, 'runtime/node.exe'));
fs.copyFileSync(path.join(root, 'Health Os.vbs'), path.join(stage, 'Health Os.vbs'));
fs.writeFileSync(path.join(stage, 'package.json'), JSON.stringify({ name: 'health-os', version: pkg.version, type: 'module', private: true }, null, 2));
fs.writeFileSync(path.join(stage, 'VERSION.txt'), `Health Os v${pkg.version}\nPublic release: https://github.com/Manpreet86999/Health-Os/releases\n`);
fs.writeFileSync(path.join(stage, 'README.txt'), 'Health Os\r\nOpen Health Os from the Start menu or desktop.\r\nThe installer includes the Node.js runtime and compiled web app; npm, Python, Java and build tools are not required.\r\nUse your own cloud account. Internet is needed for sign-in, cloud sync and online services. AI and optional personal-worker features need their own configuration.\r\nYour browser stores the session and queued offline records. Sign in using the same browser after an update.\r\nLogs: %LOCALAPPDATA%\\Health Os\\logs\\desktop.log\r\n');
// Include the license shipped with the official Node runtime when available.
const nodeLicense = path.join(root, '.build-tools/release-runtime/LICENSE');
if (!fs.existsSync(nodeLicense)) throw new Error('Missing Node.js runtime license. Run the release preparation first.');
fs.copyFileSync(nodeLicense, path.join(stage, 'runtime/LICENSE.txt'));
const icon = path.join(root, 'src/client/public/favicon.ico');
fs.copyFileSync(icon, path.join(stage, 'favicon.ico'));
const iss = `[Setup]
AppId={{46A23601-216B-4B1F-979F-68033AA168C2}
AppName=Health Os
AppVersion=${pkg.version}
AppPublisher=Health Os
AppPublisherURL=https://github.com/Manpreet86999/Health-Os
DefaultDirName={localappdata}\\Programs\\Health Os
DefaultGroupName=Health Os
DisableDirPage=no
DisableWelcomePage=no
DisableProgramGroupPage=yes
UsePreviousAppDir=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
SetupIconFile=${icon}
UninstallDisplayIcon={app}\\favicon.ico
OutputDir=${release}
OutputBaseFilename=Health-OS-Setup-v${pkg.version}
Compression=lzma2
SolidCompression=yes
CloseApplications=yes
RestartApplications=no
UninstallDisplayName=Health Os
AppMutex=HealthOsDesktop

[Files]
Source: "${stage}\\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Tasks]
Name: "desktopicon"; Description: "Create a desktop shortcut"; GroupDescription: "Shortcuts:"

[Icons]
Name: "{group}\\Health Os"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\Health Os.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\favicon.ico"
Name: "{userdesktop}\\Health Os"; Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\Health Os.vbs"""; WorkingDir: "{app}"; IconFilename: "{app}\\favicon.ico"; Tasks: desktopicon

[Run]
Filename: "{sys}\\wscript.exe"; Parameters: """{app}\\Health Os.vbs"""; Description: "Open Health Os — your welcome tour is ready"; Flags: postinstall nowait skipifsilent

[Code]
procedure InitializeWizard;
begin
  WizardForm.WelcomeLabel1.Caption := 'Health Os is here';
  WizardForm.WelcomeLabel1.Font.Color := $005E7F28;
  WizardForm.WelcomeLabel2.Caption := 'Your training, nutrition, recovery and health, beautifully connected.' + #13#10 + #13#10 + 'Choose where to install Health Os. Your runtime and web app are included, so there is no dependency setup after installation.' + #13#10 + #13#10 + 'Open Health Os after installation for a colourful, interactive tour.';
  WizardForm.FinishedHeadingLabel.Caption := 'Health Os is here';
  WizardForm.FinishedHeadingLabel.Font.Color := $005E7F28;
end;
`;
const issPath = path.join(root, 'installer/health-os.iss'); fs.writeFileSync(issPath, iss);
execFileSync(require.resolve('innosetup-compiler/bin/ISCC.exe'), [issPath], { cwd: root, stdio: 'inherit' });
const file = path.join(release, `Health-OS-Setup-v${pkg.version}.exe`);
console.log(`Windows installer: ${file}\nSHA-256: ${crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`);
