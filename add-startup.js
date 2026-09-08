const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const startupFolder = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup');
const targetVbs = path.join(__dirname, 'Pulse.vbs');
const shortcutPath = path.join(startupFolder, 'Pulse.lnk');

const psCommand = `
$WshShell = New-Object -ComObject WScript.Shell;
$Shortcut = $WshShell.CreateShortcut('${shortcutPath.replace(/\\/g, '\\\\')}');
$Shortcut.TargetPath = '${targetVbs.replace(/\\/g, '\\\\')}';
$Shortcut.WorkingDirectory = '${__dirname.replace(/\\/g, '\\\\')}';
$Shortcut.Description = 'Pulse AI Monitor';
$Shortcut.IconLocation = '${path.join(__dirname, 'assets', 'icon.ico').replace(/\\/g, '\\\\')}';
$Shortcut.Save();
`;

try {
  execSync(`powershell -NoProfile -Command "${psCommand.replace(/\r?\n/g, ' ')}"`);
  console.log('✓ 成功添加开机启动: ' + shortcutPath);
} catch (e) {
  console.error('Failed to create startup shortcut:', e.message);
}
