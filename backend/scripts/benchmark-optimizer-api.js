import assert from 'node:assert/strict';
import express from 'express';
import { performance } from 'node:perf_hooks';
import { readFile } from 'node:fs/promises';
import { createOptimizerRouter } from '../src/routes/optimizer.js';
import { createHolidayCatalog } from '../src/services/holidayCatalog.js';

const fixture=JSON.parse(await readFile(new URL('../test/fixtures/holiday-NO-2027.json',import.meta.url),'utf8'));
const app=express();app.use(express.json());
app.use('/api/v2',createOptimizerRouter({loadHolidays:createHolidayCatalog({fetchRows:async()=>fixture.rows}),authenticate:async()=>({_id:'benchmark',isPremium:true})}));
const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
console.log(JSON.stringify({scope:'Local HTTP roundtrip including fixture provider/cache, engine, serialization and JSON parse. Authentication fixture; excludes real provider, MongoDB and productionnetwork.',node:process.version}));
try {
 for(const strategy of ['balanced','maximum_time_off','longest_vacation']){
  const samples=[];
  for(let i=0;i<6;i++){
   const start=performance.now();const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v2/optimize`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({country:'NO',year:2027,availableDays:25,strategy})});const result=await response.json();const elapsed=performance.now()-start;
   assert.equal(response.status,200);assert.equal(result.status,'ok');assert.ok(result.usedDays<=25);if(i)samples.push(elapsed);
  }
  samples.sort((a,b)=>a-b);console.log(JSON.stringify({strategy,medianMs:+samples[2].toFixed(2),maxMs:+samples.at(-1).toFixed(2),samples:5}));
 }
} finally { await new Promise(r=>server.close(r)); }
