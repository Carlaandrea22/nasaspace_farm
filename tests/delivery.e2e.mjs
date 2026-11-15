import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin=process.env.FIELD_SHIFT_TEST_URL??'http://localhost:3000';
const date=(offset=0)=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/La_Paz',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(Date.now()+offset*86400000));

async function checkSteps(page, completed){
  const steps=page.getByRole('list',{name:'Pasos de la consulta'}).locator('li');
  const current=page.getByRole('list',{name:'Pasos de la consulta'}).locator(completed===4?'li:nth-child(4)[data-state=complete]':`li:nth-child(${completed+1})[aria-current=step]`);
  await current.waitFor();
  assert.deepEqual(await steps.evaluateAll(nodes=>nodes.map(n=>n.dataset.state)),Array.from({length:4},(_,i)=>i<completed?'complete':i===completed?'current':'pending'));
}

test('Tirani entrega el perfil local sin esperar la humedad modelada', {timeout:15000}, async()=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL?{channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL}:{});
  let finishMoisture;
  const pendingMoisture=new Promise(resolve=>{finishMoisture=resolve;});
  try {
    const context=await browser.newContext();
    const response=await context.request.get(origin+'/api/parcel-sources?kind=soil&lat=-17.34170&lon=-66.15458',{timeout:4000});
    assert.ok(response.ok());
    const data=await response.json();
    assert.equal(data.soilStatus,'available');
    assert.equal(data.soil.distanceM,10);
    assert.equal(data.soil.profile.length,5);
    assert.equal('moisture' in data,false);

    await context.route('**/api/parcel-sources?kind=moisture&*',async route=>{
      await pendingMoisture;
      await route.fulfill({json:{moisture:null}});
    });
    const page=await context.newPage();
    page.setDefaultTimeout(5000);
    await page.goto(origin+'/consulta?lat=-17.34170&lon=-66.15458');
    const moistureRequest=page.waitForRequest(request=>request.url().includes('kind=moisture'));
    await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
    await moistureRequest;
    const calculate=page.getByRole('button',{name:'Ver cómo estará el agua',exact:true});
    await calculate.waitFor();
    assert.ok(await calculate.isEnabled());
    await page.getByText('¿De dónde salen los datos de mi terreno?',{exact:true}).click();
    await page.getByText(/Referencia a 10 m del punto seleccionado/).waitFor();
    const moistureResponse=page.waitForResponse(response=>response.url().includes('kind=moisture'));
    finishMoisture();
    await moistureResponse;
  } finally {
    finishMoisture();
    await browser.close();
  }
});

test('consulta pública con fuentes reales, agua, tres rotaciones, impresión y móvil', {timeout:180000}, async()=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL?{channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL}:{});
  try {
    const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
    const page=await context.newPage();page.setDefaultTimeout(90000);
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/consulta?lat=-17.42442&lon=-66.18272&tipo=parcela&area=1');
    await checkSteps(page,1);
    const choices=page.locator('.consultation-choice');
    assert.equal(await choices.count(),2);
    assert.deepEqual(await choices.evaluateAll(nodes=>nodes.map(n=>getComputedStyle(n).backgroundColor)),['rgb(255, 255, 255)','rgb(255, 255, 255)']);
    await choices.first().hover();
    await page.waitForFunction(()=>getComputedStyle(document.querySelector('.consultation-choice')).backgroundColor==='rgb(36, 91, 55)');
    await page.mouse.move(0,0);
    await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
    const water=page.locator('#parcel-water');
    await checkSteps(page,2);
    await water.locator('select[name=crop]').selectOption('Maíz forrajero');
    await water.locator('input[name=planting]').fill(date(-30));
    await water.getByText('¿Vas a regar? Agrega la fecha y la cantidad',{exact:true}).click();
    assert.equal(await water.locator('input[name=irrigationEfficiency]').isVisible(),false);
    assert.equal(await water.locator('input[name=pastTurn]').isVisible(),false);
    await water.locator('input[name=turn]').fill(date(1));
    await water.locator('input[name=depth]').fill('30');
    await mkdir('.data-cache/verification',{recursive:true});
    await water.locator('form').screenshot({path:'.data-cache/verification/riego-simple-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    await water.locator('form').screenshot({path:'.data-cache/verification/riego-simple-mobile.png'});
    await page.setViewportSize({width:1440,height:1000});
    await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
    await water.getByText('Agua que necesitaría el cultivo',{exact:true}).waitFor();
    await checkSteps(page,4);
    await water.getByText('Cómo hicimos esta estimación',{exact:true}).click();
    assert.match(await water.innerText(),/SMAP L4 vía POWER|modelo Open-Meteo/);
    await water.getByRole('button',{name:'¿Qué pasa si riego 5 días después?'}).click();
    await water.getByText(/Escenario: riego retrasado 5 días/).waitFor();
    await water.getByRole('group',{name:'Periodo del análisis de agua'}).getByRole('button',{name:'14 días',exact:true}).click();
    await water.getByRole('button',{name:'Ver aviso para coordinar el riego',exact:true}).click();
    const notice=page.getByRole('dialog',{name:'Aviso para coordinar el riego',exact:true});
    await notice.waitFor();
    await notice.getByRole('heading',{name:'Solicitud para coordinar',exact:true}).waitFor();
    await mkdir('.data-cache/verification',{recursive:true});
    await notice.screenshot({path:'.data-cache/verification/aviso-preview.png'});
    const [download]=await Promise.all([page.waitForEvent('download'),notice.getByRole('button',{name:'Descargar PDF',exact:true}).click()]);
    assert.match(download.suggestedFilename(),/^aviso-agua-.*-14-dias\.pdf$/);
    await download.saveAs('.data-cache/verification/aviso-agua.pdf');
    assert.equal((await readFile('.data-cache/verification/aviso-agua.pdf')).subarray(0,5).toString(),'%PDF-');
    await page.keyboard.press('Escape');
    assert.equal(await notice.count(),0);
    await page.getByRole('button',{name:'Quiero planificar qué sembrar después',exact:true}).click();
    const rotations=page.locator('#parcel-rotations');
    await checkSteps(page,2);
    assert.equal(await rotations.locator('select[name=crop]').inputValue(),'Maíz forrajero');
    await rotations.locator('select[name=habitual]').selectOption('Avena forrajera');
    await rotations.locator('select[name=priority]').selectOption('Diversificar la producción');
    await rotations.locator('input[name=harvest]').fill(new Date().getUTCFullYear()+1+'-01-31');
    await rotations.getByRole('button',{name:'Ver qué puedo sembrar'}).click();
    await rotations.getByRole('heading',{name:/Para revisar primero:/}).waitFor();
    assert.equal(await rotations.getByRole('article').count(),3);
    assert.equal(await rotations.getByText('Rotación habitual',{exact:true}).count(),1);
    await rotations.getByLabel('Semilla de Avena forrajera (Bs/ha, opcional)').fill('80');
    await rotations.getByRole('article').nth(1).getByLabel(/Semilla de/).fill('90');
    await rotations.getByText(/Diferencia frente a la habitual: \+10 Bs\/ha/).waitFor();
    assert.equal(await rotations.getByText('Siembra estimada desde',{exact:false}).count(),3);
    await checkSteps(page,4);
    await page.setViewportSize({width:390,height:844});
    const cover=page.locator('.consulta-portada');
    assert.ok((await cover.boundingBox()).height < 300);
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    await rotations.getByRole('article').locator('img').evaluateAll(images=>Promise.all(images.map(image=>image.decode())));
    const [rotationPdf]=await Promise.all([
      page.waitForEvent('download'),
      rotations.getByRole('button',{name:'Descargar aviso de siembra (PDF)'}).click(),
    ]);
    assert.match(rotationPdf.suggestedFilename(),/^aviso-siembra-.*\.pdf$/);
    assert.equal((await readFile(await rotationPdf.path())).subarray(0,5).toString(),'%PDF-');
    await page.setViewportSize({width:1440,height:1000});
    await page.locator('#clima-parcela').getByText('Temperatura media',{exact:true}).waitFor();
    await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});
    await page.getByRole('button',{name:'Imprimir o guardar PDF'}).click();
    assert.equal(await page.evaluate(()=>window.__printed),true);
    await mkdir('.data-cache/verification',{recursive:true});
    await page.screenshot({path:'.data-cache/verification/desktop.png',fullPage:true});
    await page.locator('.consultation-progress').screenshot({path:'.data-cache/verification/pasos-desktop.png'});
    await page.setViewportSize({width:390,height:844});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
    await page.screenshot({path:'.data-cache/verification/mobile.png',fullPage:true});
    await page.emulateMedia({media:'print'});
    assert.equal(await water.isVisible(),true);
    await page.pdf({path:'.data-cache/verification/informe.pdf',format:'A4',printBackground:true});
    assert.deepEqual(errors,[]);
    const invalid=await context.request.get(origin+'/api/parcel-sources?lat=0&lon=0');
    assert.equal(invalid.status(),400);
  } finally {await browser.close();}
});

test('sin suelo o pronóstico no se inventa un balance favorable', {timeout:45000},async()=>{
  const browser=await chromium.launch(process.env.PLAYWRIGHT_CHROMIUM_CHANNEL?{channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL}:{});
  try {
    const context=await browser.newContext(),page=await context.newPage();
    await context.route('**/api/parcel-sources?**',route=>route.fulfill({json:{soil:null,soilStatus:'unavailable',moisture:null,smap:null,queriedAt:new Date().toISOString()}}));
    await context.route('**/api/weather?**',route=>route.fulfill({status:502,json:{error:'Fuente no disponible'}}));
    await page.goto(origin+'/consulta?lat=-17.34161&lon=-66.15458&tipo=parcela&area=1');
    await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
    const water=page.locator('#parcel-water');
    await page.getByRole('heading',{name:'No pudimos cargar la información del suelo',exact:true}).waitFor();
    assert.equal(await water.getByRole('button',{name:'Ver cómo estará el agua'}).count(),0);
    assert.equal(await water.getByText('Agua que necesitaría el cultivo',{exact:true}).count(),0);
    await page.getByRole('button',{name:'Volver a intentar',exact:true}).waitFor();
  }finally{await browser.close();}
});

function forecastFixture(){return {today:date(),queriedAt:new Date().toISOString(),history:[],recent:[],days:Array.from({length:14},(_,i)=>({date:date(i),rain:2,et0:4,minimum:9,maximum:23,humidity:60}))};}
async function mockWeather(context){
  await context.route('**/api/weather?**',route=>route.fulfill({json:forecastFixture()}));
  await context.route('**/api/territory?**',route=>route.fulfill({status:502,json:{error:'Solo se prueba el formulario'}}));
}

test('sin cobertura de suelo conserva el pronóstico, explica el siguiente paso y no pide reintentos inútiles', {timeout:45000},async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL??'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:390,height:844}}),page=await context.newPage();
  await mockWeather(context);
  await context.route('**/api/parcel-sources?**',route=>route.fulfill({json:{soil:null,soilStatus:'no-coverage',moisture:null,smap:null,queriedAt:new Date().toISOString()}}));
  await page.goto(origin+'/consulta?lat=-17.40633&lon=-66.19196&tipo=punto');
  await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  await page.getByRole('heading',{name:'No tenemos información del suelo para este punto',exact:true}).waitFor();
  assert.equal(await page.getByRole('button',{name:'Volver a intentar',exact:true}).count(),0);
  await page.getByRole('link',{name:'Ver las próximas lluvias',exact:true}).click();
  await page.locator('#pronostico-agua').getByRole('heading',{name:'Pronóstico',exact:true}).waitFor();
  assert.equal(new URL(page.url()).hash,'#pronostico-agua');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
 }finally{await browser.close();}
});

test('papa y alfalfa comparten catálogo y fechas entre agua y rotaciones; responsive 1440, 390 y 320', {timeout:60000},async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL??'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),page=await context.newPage();
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await mockWeather(context);
  await context.route('**/api/parcel-sources?**',route=>route.fulfill({json:{soil:{profile:[{top:0,bottom:100,fc:.3,wp:.15,sand:40,clay:25}],point:{latitude:-17.42442,longitude:-66.18272},distanceM:0,source:'Suelo de prueba',url:'https://rest.isric.org',queriedAt:new Date().toISOString()},soilStatus:'available',moisture:{date:date(),root:.22},smap:null,queriedAt:new Date().toISOString()}}));
  let hasDailyMeans=true;
  await context.route('**/api/parcel-sources?kind=history&*',route=>route.fulfill({json:{
    from:'2024-01-01',to:'2025-12-31',elevation:2600,smap:null,url:'https://power.larc.nasa.gov',
    days:Array.from({length:731},(_,index)=>({
      date:new Date(Date.UTC(2024,0,1+index)).toISOString().slice(0,10),
      rain:2,tmin:10,tmax:24,tmean:hasDailyMeans?18:null,rh:60,wind:2,solar:18,rainSource:'IMERG Final vía POWER',
    })),
  }}));
  await page.goto(origin+'/consulta?lat=-17.42442&lon=-66.18272&tipo=parcela&area=1');
  await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  const water=page.locator('#parcel-water');
  const select=water.getByLabel('¿Qué estás cultivando?');
  await select.waitFor();
  assert.equal(await select.locator('optgroup').count(),4);
  assert.equal(await select.locator('option:not([disabled])').count(),12);
  await select.selectOption('Papa');
  await water.getByLabel('¿Cuándo lo sembraste?').fill(date(-30));
  const harvest=water.getByLabel('¿Cuándo esperas cosechar?',{exact:false});
  assert.equal(await harvest.getAttribute('required'),'');
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  assert.equal(await water.getByText('Agua que necesitaría el cultivo',{exact:true}).count(),0);
  await harvest.fill(date(60));
  await mkdir('.data-cache/verification',{recursive:true});
  await water.locator('form').screenshot({path:'.data-cache/verification/cultivos-desktop.png'});
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  await water.getByText('Agua que necesitaría el cultivo',{exact:true}).waitFor();
  await page.getByRole('button',{name:'Quiero planificar qué sembrar después',exact:true}).click();
  const rotations=page.locator('#parcel-rotations');
  assert.equal(await rotations.locator('select[name=crop]').inputValue(),'Papa');
  assert.equal(await rotations.locator('select[name=crop] option:not([disabled])').count(),12);
  assert.equal(await rotations.locator('input[name=harvest]').inputValue(),date(60));
  await rotations.locator('select[name=habitual]').selectOption('Zanahoria');
  await rotations.locator('input[name=harvest]').fill('2027-05-01');
  await rotations.getByRole('button',{name:'Ver qué puedo sembrar'}).click();
  await rotations.getByRole('heading',{name:/Para revisar primero:/}).waitFor();
  assert.equal(await rotations.getByRole('article').count(),3);
  assert.ok(await rotations.getByText('Calendario local por confirmar',{exact:true}).count() >= 1);
  const photos=rotations.getByRole('article').locator('img');
  assert.equal(await photos.count(),3);
  await photos.evaluateAll(images=>Promise.all(images.map(async image=>{image.loading='eager';await image.decode();})));
  const firstCard=rotations.getByRole('article').first();
  const photo=await firstCard.locator('img').boundingBox();
  const title=await firstCard.getByRole('heading').boundingBox();
  assert.ok(photo.x+photo.width<=title.x);
  assert.equal(await firstCard.locator('time[datetime]').count(),2);
  await page.setViewportSize({width:320,height:720});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  const mobilePhoto=await firstCard.locator('img').boundingBox();
  const mobileTitle=await firstCard.getByRole('heading').boundingBox();
  assert.ok(mobilePhoto.y+mobilePhoto.height<=mobileTitle.y);
  await page.setViewportSize({width:1440,height:1000});
  assert.equal(await rotations.getByText('Sin dato',{exact:true}).count(),0);
  await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  await checkSteps(page,4);
  await water.getByRole('button',{name:'Cambiar cultivo o riego'}).click();
  await checkSteps(page,2);
  await select.selectOption('Alfalfa');
  assert.equal(await water.locator('input[name=harvest]').inputValue(),'');
  await water.getByLabel('¿Cuándo fue el último corte?').fill(date(-10));
  await water.getByLabel('¿Cuándo esperas hacer el próximo corte?',{exact:false}).fill(date(25));
  await page.setViewportSize({width:390,height:844});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await water.locator('form').screenshot({path:'.data-cache/verification/cultivos-mobile.png'});
  await page.locator('.consultation-progress').screenshot({path:'.data-cache/verification/pasos-mobile.png'});
  await page.setViewportSize({width:320,height:720});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  await water.getByText('Agua que necesitaría el cultivo',{exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  hasDailyMeans=false;
  await page.reload();
  await page.getByRole('button',{name:'Quiero planificar qué sembrar después',exact:true}).click();
  await rotations.locator('select[name=crop]').selectOption('Papa');
  await rotations.locator('select[name=habitual]').selectOption('Avena forrajera');
  await rotations.locator('input[name=harvest]').fill('2027-01-31');
  await rotations.getByRole('button',{name:'Ver qué puedo sembrar'}).click();
  await rotations.getByRole('heading',{name:/Para revisar primero:/}).waitFor();
  assert.equal(await rotations.getByText('Calendario local por confirmar',{exact:true}).count(),0);
 }finally{await browser.close();}
});

test('recorrido desde el mapa sin manejo prellenado: elegir, completar, calcular y comparar', {timeout:180000},async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL??'chrome'});
 try{
  const context=await browser.newContext({viewport:{width:1440,height:1000},reducedMotion:'reduce'});
  const map=await context.newPage();map.setDefaultTimeout(45000);
  await map.goto(origin+'/');
  assert.equal(await map.getByRole('region',{name:'Demostración guiada'}).count(),0);
  await map.getByRole('button',{name:'La Maica',exact:true}).click();
  assert.equal(await map.locator('#district-selector').inputValue(),'9');
  await map.getByRole('button',{name:'Tirani',exact:true}).click();
  assert.equal(await map.locator('#district-selector').inputValue(),'13');
  await map.getByText('Selecciona un punto o dibuja tu parcela',{exact:true}).waitFor();
  assert.equal(await map.getByRole('link',{name:/Consultar esta parcela|Consultar ubicación/}).count(),0);
  await map.getByRole('button',{name:'Dibujar parcela',exact:true}).click();
  const viewport=map.locator('.leaflet-container');
  const box=await viewport.boundingBox();
  const corners=[[-18,-18],[18,-18],[18,18],[-18,18]];
  for(let i=0;i<corners.length;i++){
    await viewport.click({position:{x:box.width/2+corners[i][0],y:box.height/2+corners[i][1]}});
    await map.getByText(i===3?'4 de 4 puntos · Contorno cerrado':`${i+1} de 4 puntos marcados`,{exact:true}).waitFor();
  }
  const link=map.getByRole('link',{name:'Consultar esta parcela'});
  const query=new URL(await link.getAttribute('href'),origin).searchParams;
  assert.equal(query.get('tipo'),'parcela');
  assert.equal(query.has('demo'),false);
  assert.ok(Math.abs(Number(query.get('lat'))-(-17.34161))<.001);
  assert.ok(Math.abs(Number(query.get('lon'))-(-66.15458))<.001);
  assert.equal(await map.getByRole('button',{name:'Guardar borrador',exact:true}).count(),0);
  await mkdir('.data-cache/verification',{recursive:true});
  await map.locator('.map-section').screenshot({path:'.data-cache/verification/demo-mapa.png'});
  const [report]=await Promise.all([context.waitForEvent('page'),link.click()]);report.setDefaultTimeout(90000);
  await report.getByRole('heading',{name:'Resumen de la parcela',exact:true}).waitFor();
  assert.equal(await report.locator('#parcel-water').count(),0);
  await report.locator('header.consulta-portada + #clima-parcela').waitFor();
  await report.screenshot({path:'.data-cache/verification/demo-elegir.png',fullPage:true});
  await report.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  assert.equal(await report.getByText('Datos de suelo disponibles.',{exact:true}).count(),0);
  const water=report.locator('#parcel-water');
  assert.equal(await water.locator('select[name=crop]').inputValue(),'');
  assert.equal(await water.locator('input[name=planting]').inputValue(),'');
  assert.equal(await water.locator('input[name=depth]').inputValue(),'');
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  assert.equal(await water.getByText('Agua que necesitaría el cultivo',{exact:true}).count(),0);
  await water.locator('select[name=crop]').selectOption('Maíz forrajero');
  await water.locator('input[name=planting]').fill(date(-30));
  await water.getByText('¿Vas a regar? Agrega la fecha y la cantidad',{exact:true}).click();
  await water.locator('input[name=turn]').fill(date(3));
  await water.locator('input[name=depth]').fill('30');
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  await water.getByRole('heading',{name:'¿Qué hago ahora?',exact:true}).waitFor();
  await water.getByText('Agua que necesitaría el cultivo',{exact:true}).waitFor();
  assert.equal(await water.locator('#pronostico-agua').getAttribute('open'),null);
  await water.getByRole('button',{name:'¿Qué pasa si riego 5 días después?'}).click();
  await water.getByText(/Escenario: riego retrasado 5 días/).waitFor();
  await report.getByText('¿De dónde salen los datos de mi terreno?',{exact:true}).click();
  await report.getByText(/Reserva útil estimada hasta 1 m de profundidad: 137,6 litros/).waitFor();
  await report.getByText('¿De dónde salen los datos de mi terreno?',{exact:true}).click();
  await water.screenshot({path:'.data-cache/verification/demo-agua.png'});
  await report.getByRole('button',{name:'Quiero planificar qué sembrar después',exact:true}).click();
  const rotations=report.locator('#parcel-rotations');
  assert.equal(await rotations.locator('select[name=crop]').inputValue(),'Maíz forrajero');
  await rotations.locator('select[name=habitual]').selectOption('Avena forrajera');
  await rotations.getByRole('button',{name:'Ver qué puedo sembrar'}).click();
  await rotations.getByRole('heading',{name:/Para revisar primero:/}).waitFor();
  assert.equal(await rotations.getByRole('article').count(),3);
  await report.evaluate(()=>{window.print=()=>{window.__printed=true;};});
  await report.getByRole('button',{name:'Imprimir o guardar PDF'}).click();
  assert.equal(await report.evaluate(()=>window.__printed),true);
  await report.setViewportSize({width:390,height:844});
  assert.equal(await report.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await report.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  await water.screenshot({path:'.data-cache/verification/demo-agua-mobile.png'});
  await map.setViewportSize({width:390,height:844});
  assert.equal(await map.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  // Selecting a point after drawing returns to the location consultation.
  await map.locator('.leaflet-container').click({position:{x:70,y:100}});
  await map.getByRole('link',{name:'Consultar ubicación',exact:true}).waitFor();
  assert.doesNotMatch(await map.getByRole('link',{name:'Consultar ubicación',exact:true}).getAttribute('href'),/demo=/);
  await report.goto(origin+'/consulta?lat=-17.42104&lon=-66.18233&demo=tunari');
  await report.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).waitFor();
  assert.equal(await report.getByText('Terreno de práctica: Tirani',{exact:true}).count(),0);
 }finally{await browser.close();}
});


test('el camino espera al cálculo, no completa el resultado con datos pendientes y retrocede al editar', {timeout:45000},async()=>{
 const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHROMIUM_CHANNEL??'chrome'});
 try{
  const context=await browser.newContext(),page=await context.newPage();
  let weatherRoute;
  await context.route('**/api/weather?**',route=>{weatherRoute=route;});
  await context.route('**/api/territory?**',route=>route.fulfill({status:502,json:{error:'Prueba de progreso'}}));
  await context.route('**/api/parcel-sources?**',route=>route.fulfill({json:{soil:{profile:[{top:0,bottom:100,fc:.3,wp:.15,sand:40,clay:25}],point:{latitude:-17.34161,longitude:-66.15458},distanceM:0,source:'Suelo de prueba',url:'https://rest.isric.org',queriedAt:new Date().toISOString()},soilStatus:'available',moisture:{date:date(),root:.22},smap:null,queriedAt:new Date().toISOString()}}));
  await page.goto(origin+'/consulta?lat=-17.34161&lon=-66.15458');
  await checkSteps(page,1);
  await page.getByRole('button',{name:'Ya tengo un cultivo y quiero revisar el agua',exact:true}).click();
  await checkSteps(page,2);
  const water=page.locator('#parcel-water');
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  await checkSteps(page,2);
  await water.locator('select[name=crop]').selectOption('Maíz forrajero');
  await water.locator('input[name=planting]').fill(date(-30));
  await water.getByRole('button',{name:'Ver cómo estará el agua'}).click();
  await checkSteps(page,3);
  assert.ok(weatherRoute);
  await weatherRoute.fulfill({json:forecastFixture()});
  await checkSteps(page,4);
  const period=water.getByRole('group',{name:'Periodo del análisis de agua'});
  assert.equal(await period.getByRole('button',{name:'7 días',exact:true}).getAttribute('aria-pressed'),'true');
  const rain=water.locator('.water-metric-rain strong');
  assert.equal(await rain.innerText(),'14 mm');
  assert.equal(await water.locator('.water-day').count(),7);
  await period.getByRole('button',{name:'14 días',exact:true}).click();
  assert.equal(await rain.innerText(),'28 mm');
  assert.equal(await water.locator('.water-day').count(),14);
  await water.locator('.water-day').last().click();
  assert.equal(await water.locator('.water-day').last().getAttribute('aria-pressed'),'true');
  await water.getByRole('button',{name:'Ver aviso para coordinar el riego',exact:true}).click();
  const notice=page.getByRole('dialog',{name:'Aviso para coordinar el riego',exact:true});
  await notice.getByText('28 mm',{exact:true}).waitFor();
  await page.setViewportSize({width:390,height:844});
  assert.equal(await notice.evaluate(n=>n.scrollWidth<=n.clientWidth),true);
  await notice.screenshot({path:'.data-cache/verification/aviso-mobile.png'});
  await notice.getByRole('button',{name:'Cerrar aviso'}).click();
  await period.getByRole('button',{name:'7 días',exact:true}).click();
  assert.equal(await water.locator('.water-day').count(),7);
  assert.equal(await water.locator('.water-day[aria-pressed=true]').count(),1);
  await water.screenshot({path:'.data-cache/verification/agua-dias-mobile.png'});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth),true);
  await water.getByRole('button',{name:'Cambiar cultivo o riego'}).click();
  await checkSteps(page,2);
 }finally{await browser.close();}
});
