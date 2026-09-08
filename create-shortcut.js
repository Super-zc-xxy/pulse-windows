const { execSync } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const desktop = path.join(os.homedir(), 'Desktop');
const targetVbs = path.join(__dirname, 'Pulse.vbs');
const shortcutPath = path.join(desktop, 'Pulse.lnk');

// Use powershell with semicolons
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
  console.log('✓ 成功在桌面创建快捷方式: ' + shortcutPath);
} catch (e) {
  console.error('Failed to create shortcut:', e.message);
}
