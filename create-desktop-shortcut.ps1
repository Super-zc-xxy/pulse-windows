$WshShell = New-Object -comObject WScript.Shell
$Desktop = [System.Environment]::GetFolderPath('Desktop')
$Shortcut = $WshShell.CreateShortcut("$Desktop\Pulse 监视器.lnk")
$Shortcut.TargetPath = "$PSScriptRoot\Pulse.vbs"
$Shortcut.WorkingDirectory = "$PSScriptRoot"
$Shortcut.Description = "Pulse - AI Coding Allowance Monitor for Windows"
$Shortcut.Save()
Write-Host "✓ 已在桌面成功创建 Pulse 监视器快捷方式！" -ForegroundColor Green
