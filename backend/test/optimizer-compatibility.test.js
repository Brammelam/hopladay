import {test} from 'node:test';
import assert from 'node:assert/strict';
import LegacyPlan from '../src/models/HolidayPlan.js';
import OptimizerPlan from '../src/models/OptimizerPlan.js';
import {buildPreview} from '../src/services/previewService.js';
import {optimizeAnnualLeave} from '../src/services/annualOptimizer.js';

test('old persisted plans remain readable in their original collection and date schema',()=>{
 const existing=new LegacyPlan({_id:'a'.repeat(24),userId:'b'.repeat(24),year:2027,countryCode:'NO',availableDays:20,usedDays:1,totalDaysOff:4,preference:'balanced',suggestions:[{startDate:'2027-05-06',endDate:'2027-05-09',vacationDaysUsed:1,totalDaysOff:4,description:'Original saved explanation'}]});
 assert.equal(existing.validateSync(),undefined);assert.equal(existing.suggestions[0].description,'Original saved explanation');assert.equal(existing.usedDays,1);assert.equal(existing.suggestions[0].startDate.toISOString().slice(0,10),'2027-05-06');assert.notEqual(OptimizerPlan.collection.name,LegacyPlan.collection.name);
 assert.equal(existing.toObject().version,undefined);
});
test('public v1 still returns its original string version and bridge-only response contract',()=>{
 const input={country:'NO',year:2027,availableDays:20,preference:'balanced',lang:'en'};
 const rows=[{date:'2027-05-06',name:'Ascension',localName:'Kristi himmelfartsdag'}];
 const legacy=buildPreview(input,rows,'2026-10-31T00:00:00Z');assert.equal(legacy.version,'1');assert.equal(legacy.tier,'free');assert.ok(!Object.hasOwn(legacy,'calendar'));assert.equal(legacy.input.preference,'balanced');
 const result=optimizeAnnualLeave({...input,strategy:'balanced'},rows);assert.equal(result.version,2);assert.equal(legacy.version,'1');
});
