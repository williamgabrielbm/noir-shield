param([string]$Script='tests/midroll-hidden.mjs')
$ErrorActionPreference='Stop'
Add-Type -TypeDefinition @"
using System;
using System.Text;
using System.Runtime.InteropServices;
public static class NoirDesktopLaunch {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)] public struct STARTUPINFO {public int cb; public string lpReserved; public string lpDesktop; public string lpTitle; public int dwX,dwY,dwXSize,dwYSize,dwXCountChars,dwYCountChars,dwFillAttribute,dwFlags; public short wShowWindow,cbReserved2; public IntPtr lpReserved2,hStdInput,hStdOutput,hStdError;}
 [StructLayout(LayoutKind.Sequential)] public struct PROCESS_INFORMATION {public IntPtr process,thread;public int processId,threadId;}
 [StructLayout(LayoutKind.Sequential)] public struct SECURITY_ATTRIBUTES {public int length;public IntPtr descriptor;[MarshalAs(UnmanagedType.Bool)]public bool inherit;}
 [DllImport("user32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateDesktopW(string name,IntPtr device,IntPtr mode,uint flags,uint access,IntPtr attributes);
 [DllImport("user32.dll")] public static extern bool CloseDesktop(IntPtr handle);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern IntPtr CreateFileW(string name,uint access,uint share,ref SECURITY_ATTRIBUTES security,uint creation,uint flags,IntPtr template);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] public static extern bool CreateProcessW(string app,StringBuilder command,IntPtr processSecurity,IntPtr threadSecurity,bool inherit,uint flags,IntPtr env,string cwd,ref STARTUPINFO start,out PROCESS_INFORMATION process);
 [DllImport("kernel32.dll")] public static extern uint WaitForSingleObject(IntPtr handle,uint milliseconds);
 [DllImport("kernel32.dll")] public static extern bool GetExitCodeProcess(IntPtr handle,out uint code);
 [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
}
"@
$taskRoot=(Get-Location).Path
$desktopName='NoirChromeHidden_'+[Guid]::NewGuid().ToString('N')
$desktop=[NoirDesktopLaunch]::CreateDesktopW($desktopName,[IntPtr]::Zero,[IntPtr]::Zero,0,0x000F01FF,[IntPtr]::Zero)
if($desktop -eq [IntPtr]::Zero){throw ('CreateDesktop falhou: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())}
$runFolder=Join-Path $taskRoot ('work/'+$env:NOIR_LABEL)
New-Item -ItemType Directory -Force -Path $runFolder | Out-Null
$env:NOIR_PRIVATE_DESKTOP=$desktopName
$sa=New-Object NoirDesktopLaunch+SECURITY_ATTRIBUTES
$sa.length=[Runtime.InteropServices.Marshal]::SizeOf($sa);$sa.inherit=$true
$log=[NoirDesktopLaunch]::CreateFileW((Join-Path $runFolder 'runner.log'),0x40000000,3,[ref]$sa,2,0x80,[IntPtr]::Zero)
$inputHandle=[NoirDesktopLaunch]::CreateFileW('NUL',2147483648,3,[ref]$sa,3,0x80,[IntPtr]::Zero)
$start=New-Object NoirDesktopLaunch+STARTUPINFO
$start.cb=[Runtime.InteropServices.Marshal]::SizeOf($start);$start.lpDesktop=$desktopName;$start.dwFlags=0x100;$start.hStdInput=$inputHandle;$start.hStdOutput=$log;$start.hStdError=$log
$processInfo=New-Object NoirDesktopLaunch+PROCESS_INFORMATION
$node=(Get-Command node.exe).Source
$command=New-Object Text.StringBuilder ('"'+$node+'" "'+(Join-Path $taskRoot $Script)+'"')
try{
 if(-not [NoirDesktopLaunch]::CreateProcessW($node,$command,[IntPtr]::Zero,[IntPtr]::Zero,$true,0x08000000,[IntPtr]::Zero,$taskRoot,[ref]$start,[ref]$processInfo)){throw ('CreateProcess falhou: '+[Runtime.InteropServices.Marshal]::GetLastWin32Error())}
 @{desktop=$desktopName;switchedToUserScreen=$false;audioDisabled=$true;runnerPid=$processInfo.processId} | ConvertTo-Json | Set-Content -Encoding utf8 (Join-Path $runFolder 'desktop-proof.json')
 $lastWrite=[DateTime]::MinValue
 while([NoirDesktopLaunch]::WaitForSingleObject($processInfo.process,1000) -eq 258){
  $reportPath=Join-Path $runFolder 'report.json'
  if((Test-Path $reportPath) -and ((Get-Date)-$lastWrite).TotalSeconds -ge 30){try{$r=Get-Content $reportPath -Raw | ConvertFrom-Json;[pscustomobject]@{label=$env:NOIR_LABEL;content=$r.contentSeconds;midroll=$r.actualMidrollWithResume;stop=$r.stop}|ConvertTo-Json -Compress;$lastWrite=Get-Date}catch{}}
 }
 [uint32]$result=0;[NoirDesktopLaunch]::GetExitCodeProcess($processInfo.process,[ref]$result)|Out-Null
 Write-Output ('Isolated desktop runner exit: '+$result)
}finally{
 if($processInfo.thread -ne [IntPtr]::Zero){[NoirDesktopLaunch]::CloseHandle($processInfo.thread)|Out-Null}
 if($processInfo.process -ne [IntPtr]::Zero){[NoirDesktopLaunch]::CloseHandle($processInfo.process)|Out-Null}
 [NoirDesktopLaunch]::CloseHandle($log)|Out-Null;[NoirDesktopLaunch]::CloseHandle($inputHandle)|Out-Null
 [NoirDesktopLaunch]::CloseDesktop($desktop)|Out-Null
}
