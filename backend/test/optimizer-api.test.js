import {test} from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import {createOptimizerRouter} from '../src/routes/optimizer.js';
import {optimizerICS} from '../src/services/optimizerExport.js';
const input={country:'NO',year:2027,availableDays:20,strategy:'balanced',lang:'en'};
const catalog={holidays:[{date:'2027-05-06',name:'Holiday',localName:'Helligdag',countryCode:'NO',global:true,counties:[],types:['Public']}],regions:['NO-01'],source:{name:'Fixture',url:'https://example.org',retrievedAt:'2026-10-31T00:00:00Z',region:null,scope:'nationwide-public-holidays'}};
async function serve(t,{premium=false,authenticated=false,loadHolidays=async()=>catalog}={}) {
 const saved=[];const user={_id:'owner',isPremium:premium};
 const plans={create:async doc=>{const p={...doc,_id:'a'.repeat(24)};saved.push(p);return p;},find:()=>({sort(){return this},limit(){return this},lean:async()=>saved}),findOne:async query=>saved.find(p=>p._id===query._id&&p.userId===query.userId)};
 const app=express();app.use(express.json());app.use('/api/v2',createOptimizerRouter({loadHolidays,authenticate:async()=>authenticated?user:null,plans,metrics:{updateOne:async(query,update)=>{assert.deepEqual(Object.keys(query).sort(),['day','event']);assert.deepEqual(Object.keys(update),['$inc']);}}}));
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));t.after(()=>new Promise(r=>server.close(r)));
 return async(path,body,method='POST')=>{const res=await fetch(`http://127.0.0.1:${server.address().port}/api/v2${path}`,{method,headers:{'Content-Type':'application/json'},...(body===undefined?{}:{body:JSON.stringify(body)})});return {res,body:res.headers.get('content-type')?.includes('json')?await res.json():await res.text()};};
}
test('anonymous balanced generation is versioned, structured and nonpersistent',async t=>{
 const request=await serve(t);const {res,body}=await request('/optimize',input);assert.equal(res.status,200);assert.equal(body.version,2);assert.equal(body.input.country,'NO');assert.ok(body.calendar.length===365);assert.ok(body.constraintsSatisfied);assert.ok(body.usedDays<=20);assert.equal(body.source.region,null);assert.equal((await request('/plans',undefined,'GET')).res.status,401);
});
test('Premium strategies/settings/export reject anonymous and nonpremium callers',async t=>{
 const request=await serve(t);for(const extra of [{strategy:'maximum_time_off'},{workingDays:[1,2,3,4]},{requiredSummerBreak:{minDays:14}},{preferredMonths:[7]}])assert.equal((await request('/optimize',{...input,...extra})).res.status,403);
 assert.equal((await request('/optimize',{...input,isPremium:true})).res.status,400);
 const free=await serve(t,{authenticated:true});assert.equal((await free('/optimize',{...input,strategy:'longest_vacation'})).res.status,403);assert.equal((await free('/plans/'+'a'.repeat(24)+'/export',{mode:'leave'})).res.status,403);
});
test('Premium user constraints and localization are applied, and version2 saves retain snapshots',async t=>{
 const request=await serve(t,{authenticated:true,premium:true});const custom={...input,lang:'nl',strategy:'longest_vacation',workingDays:[1,2,3,4],approvedLeave:['2027-07-01'],companyHolidays:['2027-07-02']};
 const generated=await request('/optimize',custom);assert.equal(generated.res.status,200);assert.match(generated.body.suggestions[0].description,/verlofdagen/);
 const saved=await request('/plans',{input:custom,title:'Summer'});assert.equal(saved.res.status,201);assert.equal(saved.body.version,2);assert.equal(saved.body.result.version,2);
 const list=await request('/plans',undefined,'GET');assert.equal(list.body.length,1);assert.deepEqual(list.body[0].result,saved.body.result);
 const exported=await request('/plans/'+saved.body._id+'/export',{mode:'leave'});assert.equal(exported.res.status,200);assert.match(exported.body,/DTSTART;VALUE=DATE:/);assert.ok(!exported.body.includes('TZID'));
 assert.equal((await request('/plans/'+'b'.repeat(24)+'/export',{mode:'breaks'})).res.status,404);
});
test('invalid dates fail before provider requests and upstream failure is explicit',async t=>{
 let calls=0;const request=await serve(t,{loadHolidays:async()=>{calls++;throw Object.assign(new Error('upstream'),{status:503});}});
 assert.equal((await request('/optimize',{...input,approvedLeave:['2027-02-30']})).res.status,400);assert.equal(calls,0);assert.equal((await request('/optimize',input)).res.status,503);
});
test('calendar export separates all-day leave from whole breaks and uses exclusive end dates',()=>{
 const plan={suggestions:[{startDate:'2028-02-28',endDate:'2028-03-01',leaveDates:['2028-02-29']}]};
 const leave=optimizerICS(plan,'leave','stable');assert.match(leave,/DTSTART;VALUE=DATE:20280229/);assert.match(leave,/DTEND;VALUE=DATE:20280301/);assert.match(leave,/STATUS:TENTATIVE/);
 const breaks=optimizerICS(plan,'breaks','stable');assert.match(breaks,/DTSTART;VALUE=DATE:20280228/);assert.match(breaks,/DTEND;VALUE=DATE:20280302/);assert.throws(()=>optimizerICS(plan,'other','id'));
});

test('malformed locked intervals are input errors rather than provider outages',async t=>{
 const request=await serve(t);
 assert.equal((await request('/optimize',{...input,lockedBreaks:[{startDate:'2027-02-30',endDate:'2027-03-02'}]})).res.status,400);
});


test('analytics accepts event counts and rejects personal planning details',async t=>{
 const request=await serve(t);
 assert.equal((await request('/events',{event:'generated'})).res.status,204);
 assert.equal((await request('/events',{event:'generated',leaveDates:['2027-07-01']})).res.status,400);
 assert.equal((await request('/events',{event:'arbitrary'})).res.status,400);
});

test('malformed language objects cannot break structured input errors',async t=>{
 const request=await serve(t);
 for(const lang of ['constructor','__proto__',{toString:'invalid',valueOf:'invalid'}]){
  const {res,body}=await request('/optimize',{...input,lang});assert.equal(res.status,400);assert.equal(typeof body.error.message,'string');
 }
});

test('iCalendar folds content lines to the interoperable 75-octet limit',()=>{
 const ics=optimizerICS({suggestions:[{startDate:'2027-05-06',endDate:'2027-05-09',leaveDates:['2027-05-07']}]},'leave','stable');
 assert.ok(ics.split('\r\n').every(line=>Buffer.byteLength(line,'utf8')<=75));
 const unfolded=ics.replace(/\r\n /g,'');assert.match(unfolded,/UID:[a-f0-9]{64}@hopladay.com/);
});
