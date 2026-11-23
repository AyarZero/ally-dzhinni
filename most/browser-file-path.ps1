# Enumerate only file handles held by the browser. No disk traversal or file content reads.
param([string]$Name,[long]$Size,[string]$InputBase64)
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=[System.Text.UTF8Encoding]::new($false)
$lookupStarted=[DateTime]::UtcNow
function Write-LookupDiagnostic([string]$strategy,[int]$count,[string]$failure='') {
 try {
  $record=@{at=[DateTime]::UtcNow.ToString('o');strategy=$strategy;count=$count;ms=[int]([DateTime]::UtcNow-$lookupStarted).TotalMilliseconds;failure=$failure}
  $logPath=Join-Path $PSScriptRoot '../../../scratchpad/file-locator-native-20261121.jsonl'
  [IO.File]::AppendAllText([IO.Path]::GetFullPath($logPath),($record|ConvertTo-Json -Compress)+[Environment]::NewLine,[Text.UTF8Encoding]::new($false))
 }catch{}
}
trap { Write-LookupDiagnostic 'failed' 0 (([string]$_.Exception.GetType().Name));throw }
if($InputBase64){$request=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($InputBase64))|ConvertFrom-Json;$Name=[string]$request.name;$Size=[long]$request.size}
# Explorer owns the source of a normal drag. Ask for the selected filesystem items
# before relying on Chromium's short-lived handles. Do not walk folders or guess.
$selectedPaths=@()
$shell=$null
try {
 $shell=New-Object -ComObject Shell.Application
 foreach($window in $shell.Windows()) {
  try {
   foreach($item in $window.Document.SelectedItems()) {
    $path=[string]$item.Path
    if([IO.Path]::GetFileName($path) -ine $Name){continue}
    $info=Get-Item -LiteralPath $path -ErrorAction Stop
    if(-not $info.PSIsContainer -and $info.Length -eq $Size){$selectedPaths+='explorer:'+([string]$window.HWND)+':'+$path+'|'+$path}
   }
  }catch{}
 }
}catch{}finally{if($shell){[void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)}}
if($selectedPaths.Count -gt 0){Write-LookupDiagnostic 'explorer' $selectedPaths.Count;ConvertTo-Json -InputObject @($selectedPaths|Select-Object -Unique) -Compress;exit 0}
Add-Type -TypeDefinition @'
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Runtime.InteropServices;
using System.Text;
public static class AllYBrowserFile {
 [DllImport("ntdll.dll")] static extern int NtQuerySystemInformation(int c,IntPtr b,int n,out int len);
 [DllImport("kernel32.dll")] static extern IntPtr OpenProcess(uint rights,bool inherit,int pid);
 [DllImport("kernel32.dll")] static extern IntPtr GetCurrentProcess();
 [DllImport("kernel32.dll")] static extern bool DuplicateHandle(IntPtr src,IntPtr h,IntPtr target,out IntPtr copy,uint access,bool inherit,uint flags);
 [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr h);
 [DllImport("kernel32.dll")] static extern uint GetFileType(IntPtr h);
 [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern uint GetFinalPathNameByHandle(IntPtr h,StringBuilder b,uint n,uint flags);
 [DllImport("kernel32.dll")] static extern bool GetFileSizeEx(IntPtr h,out long n);
 public static string[] Find(string name,long size) {
  var pids=new HashSet<int>();
  int session=Process.GetCurrentProcess().SessionId;
  foreach(var p in Process.GetProcesses()) { try {var n=p.ProcessName.ToLowerInvariant();if(p.SessionId==session&&(n=="chrome"||n=="msedge"||n=="msedgewebview2"||n=="headless_shell"||n=="chrome-headless-shell"))pids.Add(p.Id);}catch{}finally{p.Dispose();} }
  var processes=new Dictionary<int,IntPtr>();var found=new HashSet<string>(StringComparer.OrdinalIgnoreCase);
  IntPtr buffer=IntPtr.Zero;int length=1024*1024,needed=0;
  try {
   for(int retry=0;retry<8;retry++) {if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);buffer=Marshal.AllocHGlobal(length);int status=NtQuerySystemInformation(64,buffer,length,out needed);if(status==0)break;if(status!=unchecked((int)0xC0000004))throw new Exception("Handle query failed");length=Math.Max(length*2,needed+65536);if(length>128*1024*1024)throw new Exception("Handle table too large");if(retry==7)throw new Exception("Handle query exhausted");}
   long count=Marshal.ReadIntPtr(buffer).ToInt64();int stride=IntPtr.Size==8?40:28;int header=IntPtr.Size*2;
   if(count<0||count>(length-header)/stride)throw new Exception("Invalid handle count");
   for(long i=0;i<count;i++) {
    IntPtr entry=IntPtr.Add(buffer,checked(header+(int)i*stride));long pidLong=Marshal.ReadIntPtr(entry,IntPtr.Size).ToInt64();if(pidLong>Int32.MaxValue||!pids.Contains((int)pidLong))continue;int pid=(int)pidLong;
    IntPtr proc;if(!processes.TryGetValue(pid,out proc)){proc=OpenProcess(0x40,false,pid);processes.Add(pid,proc);}if(proc==IntPtr.Zero)continue;
    IntPtr h=Marshal.ReadIntPtr(entry,IntPtr.Size*2),copy;
    if(!DuplicateHandle(proc,h,GetCurrentProcess(),out copy,0x80,false,0))continue;
    try {
     if(GetFileType(copy)!=1)continue;long bytes;if(!GetFileSizeEx(copy,out bytes)||bytes!=size)continue;
     var text=new StringBuilder(32768);uint n=GetFinalPathNameByHandle(copy,text,(uint)text.Capacity,0);if(n==0||n>=text.Capacity)continue;
     string path=text.ToString();if(path.StartsWith(@"\\?\UNC\"))path=@"\\"+path.Substring(8);else if(path.StartsWith(@"\\?\"))path=path.Substring(4);
     if(String.Equals(System.IO.Path.GetFileName(path),name,StringComparison.OrdinalIgnoreCase))found.Add(pid.ToString()+":"+h.ToInt64().ToString()+":"+Marshal.ReadIntPtr(entry).ToInt64().ToString()+"|"+path);
    }finally{CloseHandle(copy);}
   }
   var result=new string[found.Count];found.CopyTo(result);return result;
  }finally{if(buffer!=IntPtr.Zero)Marshal.FreeHGlobal(buffer);foreach(var p in processes.Values)if(p!=IntPtr.Zero)CloseHandle(p);}
 }
}
'@
$paths=@([AllYBrowserFile]::Find($Name,$Size))
Write-LookupDiagnostic 'browser_handles' $paths.Count
ConvertTo-Json -InputObject $paths -Compress
