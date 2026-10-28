// JavaScript, file: tests/chrome-installed.mjs, target: installed Chrome in an isolated test profile.
import {spawn,execFileSync} from 'node:child_process';import net from 'node:net';import {chromium} from 'playwright';
async function verifyPrivateDesktop(){
 if(!process.env.NOIR_PRIVATE_DESKTOP)return false;
 const ps='Add-Type -TypeDefinition \'using System;using System.Text;using System.Runtime.InteropServices;public static class D{[DllImport("kernel32.dll")]public static extern uint GetCurrentThreadId();[DllImport("user32.dll")]public static extern IntPtr GetThreadDesktop(uint id);[DllImport("user32.dll",CharSet=CharSet.Unicode)]public static extern bool GetUserObjectInformation(IntPtr h,int n,StringBuilder b,int length,out int required);}\';$b=New-Object Text.StringBuilder 256;$n=0;[D]::GetUserObjectInformation([D]::GetThreadDesktop([D]::GetCurrentThreadId()),2,$b,512,[ref]$n)|Out-Null;$b.ToString()';
 const actual=execFileSync('powershell',['-NoProfile','-Command',ps],{encoding:'utf8',windowsHide:true}).trim();if(actual!==process.env.NOIR_PRIVATE_DESKTOP||!actual.startsWith('NoirChromeHidden_'))throw Error('Private desktop verification failed');return true;
}
export async function installedChrome(profile,extension,protect){
 const privateDesktop=await verifyPrivateDesktop();const server=net.createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));const port=server.address().port;await new Promise(ok=>server.close(ok));
 const proc=spawn('C:/Program Files/Google/Chrome/Application/chrome.exe',[...(!privateDesktop?['--headless=new']:[]),'--mute-audio','--user-data-dir='+profile,'--remote-debugging-address=127.0.0.1','--remote-debugging-port='+port,'--no-first-run','--no-default-browser-check','about:blank'],{windowsHide:true,stdio:'ignore'});
 let browser;
 try{
  for(let n=0;n<40;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break;}catch{if(proc.exitCode!==null)throw Error('Chrome exited before debugging endpoint was ready');await new Promise(ok=>setTimeout(ok,250));}}
  if(!browser)throw Error('Chrome debugging endpoint unavailable');const session=await browser.newBrowserCDPSession(),version=await session.send('Browser.getVersion');
  const loaded=protect?await session.send('Extensions.loadUnpacked',{path:extension}):null;
  const context=browser.contexts()[0];context.chromeTestMetadata={product:version.product,extensionLoaded:!!loaded?.id,extensionId:loaded?.id,headless:!privateDesktop,privateDesktop,audioDisabled:true,loader:protect?'CDP Extensions.loadUnpacked over local port':'normal Chrome control; no extension loaded',pipeDuringPlayback:false,extraExtensionDebugFlag:false,restartAfterInstall:false};return context;
 }catch(error){if(browser){try{await(await browser.newBrowserCDPSession()).send('Browser.close');}catch{}}else proc.kill();throw error;}
}
