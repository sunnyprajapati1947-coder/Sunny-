// npm run test:browser (after npm run build, with preview running on port 5173)
// First run: npx playwright install chromium
// Sandbox override: BROWSER_EXECUTABLE_PATH=/path/to/chromium and LD_LIBRARY_PATH as needed.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
const context=await browser.newContext({viewport:{width:1440,height:1050},permissions:['clipboard-read','clipboard-write']});
const page=await context.newPage();
const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const base=process.env.TEST_BASE_URL||'http://localhost:5173';
const shot=async name=>{if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${name}.png`,fullPage:true});};
const checkOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'No horizontal overflow');
async function next(){await page.getByRole('button',{name:'Next: your playstyle'}).click();}
async function generate(){await page.locator('#generate').click();await page.locator('.sensitivity-row').first().waitFor();assert.equal(await page.locator('.sensitivity-row').count(),6);}
try{
 await page.goto(base);await page.locator('#brand').waitFor();
 assert.equal(await page.locator('#brand option').count(),58);
 assert.equal(await page.locator('#model option').count(),2);
 await shot('spdyi-device');
 await page.locator('#brand').selectOption('Samsung');await page.locator('#model-search').fill('sm-a145f');
 assert.ok((await page.locator('#model option').allTextContents()).some(t=>/A14/i.test(t)));
 const matching=await page.locator('#model option').nth(1).getAttribute('value');
 await page.locator('#model').selectOption(matching);await next();
 await page.locator('[data-fingers="3"]').click();await page.locator('[data-dpi="true"]').click();await generate();
 assert.equal(await page.locator('#fire-value').textContent(),'43');
 assert.match(await page.locator('.dpi-note').textContent(),/dp, not DPI/);
 await page.locator('#fire-plus').click();assert.equal(await page.locator('#fire-value').textContent(),'45');
 await page.locator('#tune-slider').selectOption('1');await page.locator('#aim-high').click();
 assert.equal(await page.locator('.sensitivity-row strong').nth(1).textContent(),'170');
 await page.locator('#copy').click();const clipboard=await page.evaluate(()=>navigator.clipboard.readText());
 assert.match(clipboard,/Fire button: 45%/);assert.match(clipboard,/Red Dot: 170/);assert.match(clipboard,/Sources reviewed/);
 await page.locator('#save').click();await page.reload();await page.locator('#nav-saved').click();
 assert.equal(await page.locator('#fire-value').textContent(),'45');assert.equal(await page.locator('.sensitivity-row strong').nth(1).textContent(),'170');
 await page.locator('#result-sources').click();assert.equal(await page.locator('.source-list article').count(),12);
 assert.match(await page.locator('#dialog-content').textContent(),/Official game information/);await page.locator('.close-dialog').click();
 await shot('spdyi-result');await checkOverflow();
 await page.locator('#restart').click();await page.locator('#brand').selectOption('Apple');await page.locator('#model').selectOption('iPhone 13');await next();
 assert.equal(await page.locator('[data-dpi="true"]').isDisabled(),true);await generate();assert.equal(await page.locator('.dpi-note').count(),0);
 // Manual entry supports devices not in the catalog, including HTML-like names as plain text.
 await page.locator('#restart').click();await page.locator('#brand').selectOption('Other');await page.locator('#model').selectOption('Other');
 await page.locator('#custom-brand').fill('My <brand>');await page.locator('#custom-model').fill('Regional "Phone"');await next();
 await page.locator('[data-fingers="4"]').click();await page.locator('[data-profile="fast"]').click();await generate();
 assert.match(await page.locator('.result-title p').textContent(),/My <brand> Regional "Phone"/);assert.equal(await page.locator('#fire-value').textContent(),'42');
 assert.equal(await page.locator('.sensitivity-row strong').first().textContent(),'190');
 // Navigation cancels an in-progress animation, preventing a stale result from replacing a new form.
 await page.locator('#restart').click();await next();await page.locator('#generate').click();await page.locator('#nav-generator').click();
 await page.waitForTimeout(2100);assert.equal(await page.locator('#device-form').count(),1);
 // An unknown search leaves manual entry available, and typing does not lose input focus.
 await page.locator('#brand').selectOption('Redmi');await page.locator('#model-search').fill('zzzz-not-a-phone');
 assert.equal(await page.locator('#model option').count(),2);assert.equal(await page.locator('#model-search').evaluate(e=>e===document.activeElement),true);
 await page.locator('#model-search').fill('note 13');assert.ok(await page.locator('#model option').count()>2);
 await page.setViewportSize({width:390,height:844});await page.locator('#model').selectOption({index:1});await checkOverflow();await shot('spdyi-mobile-device');
 await next();await checkOverflow();await generate();await checkOverflow();await shot('spdyi-mobile-result');
 await page.locator('.mobile-install').click();assert.match(await page.locator('#dialog-content').textContent(),/Install Spdyi/);await page.locator('.close-dialog').click();
 await page.locator('#tuning').click();await page.locator('#guide-sources').click();assert.equal(await page.locator('.source-list article').count(),12);await page.locator('.close-dialog').click();
 await page.evaluate(async()=>{await navigator.serviceWorker.ready;});await page.reload();await page.waitForLoadState('networkidle');await context.setOffline(true);await page.reload();
 await page.locator('#brand').selectOption('Realme');await page.locator('#model-search').fill('c55');await page.locator('#model').selectOption({index:1});await next();await generate();await checkOverflow();
 await page.locator('#result-sources').click();assert.equal(await page.locator('.source-list article').count(),12);
 assert.deepEqual(errors,[]);
 console.log('PASS: catalog/code search, unknown models, mobile, profiles, DPI guard, fire size, per-slider tuning, copy/save/reload, source dialogs, scan cancellation, PWA offline.');
}finally{await browser.close();}
