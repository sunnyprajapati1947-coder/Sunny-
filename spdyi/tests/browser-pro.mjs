import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--disable-dev-shm-usage','--no-zygote']});
const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
const shot=async n=>{if(process.env.SCREENSHOT_DIR)await page.screenshot({path:`${process.env.SCREENSHOT_DIR}/${n}.png`,fullPage:true});};
try{
 await page.goto(process.env.TEST_BASE_URL||'http://localhost:5173');
 await page.locator('#nav-diagnostics').click();await page.locator('#scan-device').click();await page.locator('.diag-grid').waitFor();
 assert.match(await page.locator('.diag-grid').textContent(),/Not available/);assert.match(await page.locator('.diag-grid').textContent(),/CSS PIXELS/);
 assert.equal(await page.locator('#apply-device').isDisabled(),true);await overflow();await shot('pro-device-dashboard');
 await page.locator('#frame-test').click();await page.locator('.frame-result').waitFor();assert.match(await page.locator('.frame-result').textContent(),/not the panel/);
 await page.locator('#nav-touch').click();await page.locator('#touch-canvas').scrollIntoViewIfNeeded();const r=await page.locator('#touch-canvas').boundingBox();
 const cdp=await context.newCDPSession(page);
 // Actual browser touch events via CDP, not mouse events masquerading as calibration.
 for(let i=0;i<5;i++){
  const x=r.x+r.width*.5;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y:r.y+r.height*.84,id:1}]});
  for(let j=1;j<=6;j++){await page.waitForTimeout(20);await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:r.y+r.height*(.84-j*.10),id:1}]});}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 }
 assert.equal(await page.locator('#swipe-count').textContent(),'5 / 5');assert.equal(await page.locator('#save-touch').isEnabled(),true);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+40,y:r.y+40,id:1},{x:r.x+r.width-40,y:r.y+40,id:2}]});
 assert.equal(await page.locator('#touch-max').textContent(),'2');await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
 await overflow();await shot('pro-touch-lab');await page.locator('#save-touch').click();
 assert.match(await page.locator('#open-touch').textContent(),/attached/);
 await page.locator('#brand').selectOption('Samsung');await page.locator('#model-search').fill('sm-a145f');await page.locator('#model').selectOption({index:1});await page.getByRole('button',{name:'Next: your playstyle'}).click();
 await page.locator('.previous-details summary').click();await page.locator('#load-screenshot').click();assert.equal(await page.locator('[data-previous="0"]').inputValue(),'145');
 await page.locator('#aim-issue').selectOption('overshoot');await page.locator('#feedback-scope').selectOption('0');await page.locator('#shot-count').fill('20');await page.locator('#shot-count').blur();
 await shot('pro-gameplay-feedback');await overflow();await page.locator('#generate').click();await page.locator('.confidence-card').waitFor();
 assert.match(await page.locator('.confidence-card').textContent(),/Repeat-tested input/);
 const val=Number(await page.locator('.sensitivity-row strong').first().textContent());assert.ok(val===140||val===142);
 assert.equal(await page.locator('.compare-row').count(),6);assert.match(await page.locator('.compare-row').first().textContent(),new RegExp(`145 → ${val}`));
 await page.locator('.confidence-card summary').click();assert.match(await page.locator('.confidence-card').textContent(),/CSS px/);
 await page.locator('#save').click();await page.locator('#profile-history').click();assert.equal(await page.locator('.profile-list article').count(),1);
 await page.locator('[data-load-profile="0"]').click();assert.equal(await page.locator('.sensitivity-row strong').first().textContent(),String(val));
 await overflow();await shot('pro-personalized-result');
 await page.reload();await page.locator('#nav-saved').click();assert.match(await page.locator('.confidence-card').textContent(),/Repeat-tested input/);
 // Test smaller phones, desktop tool layout and canceling active measurements on navigation.
 await page.setViewportSize({width:320,height:760});await overflow();await page.locator('#nav-touch').click();await overflow();
 await page.setViewportSize({width:1440,height:1050});await page.locator('#nav-diagnostics').click();await page.locator('#scan-device').click();await page.locator('.diag-grid').waitFor();await overflow();await shot('pro-desktop-diagnostics');
 await page.locator('#frame-test').click();await page.locator('#nav-generator').click();await page.waitForTimeout(100);assert.equal(await page.locator('#device-form').count(),1);
 assert.deepEqual(errors,[]);console.log('PASS pro diagnostics, measured callback pacing, real multitouch events, swipe calibration, feedback personalization, screenshot input, confidence, comparison charts, saved profiles, small/mobile/desktop layouts and measurement cancellation.');
}finally{await browser.close();}
