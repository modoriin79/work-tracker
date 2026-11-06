# Work Tracker Mini launcher
# Opens the tracker's mini view as a small Edge app window in the bottom-right
# corner and keeps it on top of other windows.
#   -NoTop   : don't pin on top
#   -Width / -Height : window size
param([switch]$NoTop, [int]$Width = 360, [int]$Height = 620)

$url  = 'https://modoriin79.github.io/work-tracker/?mini'
$edge = "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
if (-not (Test-Path $edge)) { $edge = "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe" }

Add-Type -AssemblyName System.Windows.Forms
Add-Type @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class WtWin {
  public delegate bool EnumProc(IntPtr h, IntPtr p);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr p);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] public static extern bool SetWindowPos(IntPtr h, IntPtr after, int x, int y, int cx, int cy, uint flags);
  public static IntPtr Find(string part) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, p) => {
      if (!IsWindowVisible(h)) return true;
      var sb = new StringBuilder(512);
      GetWindowText(h, sb, 512);
      if (sb.ToString().Contains(part)) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

# Already open? just bring it back on top.
$hwnd = [WtWin]::Find('Work Tracker Mini')
if ($hwnd -eq [IntPtr]::Zero) {
  Start-Process $edge "--app=$url"
  for ($i = 0; $i -lt 60 -and $hwnd -eq [IntPtr]::Zero; $i++) {
    Start-Sleep -Milliseconds 500
    $hwnd = [WtWin]::Find('Work Tracker Mini')
  }
}
if ($hwnd -eq [IntPtr]::Zero) { exit 1 }

$wa = [System.Windows.Forms.Screen]::PrimaryScreen.WorkingArea
$x = $wa.Right - $Width - 12
$y = $wa.Bottom - $Height - 12
$insertAfter = if ($NoTop) { [IntPtr]::new(-2) } else { [IntPtr]::new(-1) }  # -1 TOPMOST, -2 NOTOPMOST
[void][WtWin]::SetWindowPos($hwnd, $insertAfter, $x, $y, $Width, $Height, 0x0040)  # SWP_SHOWWINDOW
