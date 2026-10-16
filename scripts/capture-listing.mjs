import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const work=path.resolve(root,'../../work');
await fs.mkdir(work,{recursive:true});
const profile=await fs.mkdtemp(path.join(work,'noir-listing-profile-'));
const extension=path.join(root,'dist');
const target=path.join(root,'..','NoirShield-Store-Settings.png');
if(await fs.stat(target).then(()=>true,()=>false))throw new Error(`Screenshot already exists: ${target}`);
const context=await chromium.launchPersistentContext(profile,{
  channel:'chromium',headless:true,viewport:{width:1280,height:800},
  args:[`--disable-extensions-except=${extension}`,`--load-extension=${extension}`]
});
try{
  const worker=context.serviceWorkers()[0]||await context.waitForEvent('serviceworker',{timeout:20000});
  const id=new URL(worker.url()).hostname;
  const page=await context.newPage();
  await page.goto(`chrome-extension://${id}/options.html`);
  await page.locator('#builtin-lists .list-row').first().waitFor();
  await page.screenshot({path:target});
  console.log(target);
}finally{
  await context.close();
}
