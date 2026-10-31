import express from 'express';
import { validateOptimizationInput, optimizeAnnualLeave } from '../services/annualOptimizer.js';
import { validateCalendarInput } from '../services/calendarModel.js';
import { loadHolidayCatalog } from '../services/holidayCatalog.js';
import { authenticateSession } from '../services/sessionService.js';
import { localizeOptimization, OPTIMIZER_LANGS, optimizerError } from '../services/optimizerMessages.js';
import { optimizerICS } from '../services/optimizerExport.js';
import OptimizerPlan from '../models/OptimizerPlan.js';
import PlanningMetric from '../models/PlanningMetric.js';
import { PREVIEW_COUNTRIES } from '../services/previewService.js';

const fields=['country','region','lang','year','availableDays','strategy','horizon','workingDays','companyHolidays','approvedLeave','excludedDates','holidayWorkingDates','preferredMonths','minBreakLength','maxBreakLength','preferredBreakLength','maxBreaks','minSeparationDays','seasonalWeight','requiredSummerBreak','lockedBreaks'];
const advanced=['horizon','workingDays','companyHolidays','holidayWorkingDates','preferredMonths','minBreakLength','maxBreakLength','preferredBreakLength','maxBreaks','minSeparationDays','seasonalWeight','requiredSummerBreak'];
const events=['opened','generated','strategy_selected','recommendation_accepted','regenerated','saved','export_requested','upgrade_initiated','purchase_completed'];
function normalize(body) {
  if (!body || typeof body!=='object' || Array.isArray(body) || Object.keys(body).some(key=>!fields.includes(key))) throw new Error('Use only the documented optimization fields');
  const input={...body,strategy:body.strategy??'balanced',lang:body.lang??'en'};
  if (!PREVIEW_COUNTRIES.includes(input.country) || !OPTIMIZER_LANGS.includes(input.lang)) throw new Error('Unsupported country or language');
  if (input.region!==undefined && (typeof input.region!=='string' || input.region.length>20)) throw new Error('Invalid region');
  validateOptimizationInput(input);validateCalendarInput(input);
  return input;
}
export function createOptimizerRouter({loadHolidays=loadHolidayCatalog,authenticate=authenticateSession,plans=OptimizerPlan,metrics=PlanningMetric,now=Date.now}={}) {
  const router=express.Router();let start=now(),total=0;const clients=new Map();
  router.use((req,res,next)=>{
    res.set('Cache-Control','no-store');res.set('X-Robots-Tag','noindex');
    if(now()-start>=60000){start=now();total=0;clients.clear();}
    const count=clients.get(req.ip)||0;
    if(count>=30||total>=300){res.set('Retry-After','60');return res.status(429).json({error:{code:'RATE_LIMITED',message:optimizerError('RATE_LIMITED',req.body?.lang)}});}
    clients.set(req.ip,count+1);total++;next();
  });
  const fail=(res,status,code,lang,details)=>res.status(status).json({error:{code,message:optimizerError(code,lang),...(details?{details}: {})}});
  async function identity(req) {
    const user=await authenticate(req);
    if(req.headers.authorization && !user)throw Object.assign(new Error('Invalid session'),{status:401,code:'AUTH_REQUIRED'});
    return user;
  }
  function permit(input,user) {
    if((input.strategy!=='balanced'||advanced.some(key=>Object.hasOwn(input,key))) && user?.isPremium!==true)throw Object.assign(new Error('Premium required'),{status:403,code:'PREMIUM_REQUIRED'});
  }
  async function generate(input,user) {
    permit(input,user);
    const catalog=await loadHolidays(input.year,input.country,input.region||undefined);
    let optimized;
    try { optimized=optimizeAnnualLeave(input,catalog.holidays); }
    catch(error) { throw Object.assign(error,{status:400,code:'INVALID_INPUT'}); }
    const result=localizeOptimization(optimized,input.lang);
    const query=new URLSearchParams({country:input.country,year:String(input.year),availableDays:String(input.availableDays),strategy:input.strategy,...(input.region?{region:input.region}:{})});
    return {...result,input,source:catalog.source,regions:catalog.regions,previewUrl:`https://www.hopladay.com/${input.lang}/optimize?${query}`,linkScope:'basic-inputs-only'};
  }
  const handle=fn=>async(req,res)=>{try{await fn(req,res);}catch(error){const status=error.status??503;fail(res,status,error.code??(status===400?'INVALID_INPUT':'SERVICE_UNAVAILABLE'),req.body?.lang);}};
  router.get('/session',handle(async(req,res)=>{const user=await identity(req);res.json({authenticated:!!user,premium:user?.isPremium===true});}));
  router.get('/holidays/:year',handle(async(req,res)=>{
    if(Object.keys(req.query).some(key=>!['country','region'].includes(key)) || typeof req.query.country!=='string' || (req.query.region!==undefined && typeof req.query.region!=='string'))return fail(res,400,'INVALID_INPUT');
    const year=Number(req.params.year);if(!/^\d{4}$/.test(req.params.year))return fail(res,400,'INVALID_INPUT');
    res.json(await loadHolidays(year,req.query.country,req.query.region));
  }));
  router.post('/optimize',handle(async(req,res)=>{
    let input;try{input=normalize(req.body);}catch(error){return fail(res,400,'INVALID_INPUT',req.body?.lang,error.message);}
    res.json(await generate(input,await identity(req)));
  }));
  router.post('/plans',handle(async(req,res)=>{
    const user=await identity(req);if(!user)return fail(res,401,'AUTH_REQUIRED',req.body?.input?.lang);
    if(!req.body || Object.keys(req.body).some(k=>!['input','title'].includes(k)) || (req.body.title!==undefined && (typeof req.body.title!=='string'||req.body.title.length>120)))return fail(res,400,'INVALID_INPUT');
    let input;try{input=normalize(req.body.input);}catch(error){return fail(res,400,'INVALID_INPUT',req.body.input?.lang,error.message);}
    const result=await generate(input,user);if(result.status!=='ok')return fail(res,400,'INVALID_INPUT',input.lang,'Infeasible plans cannot be saved');
    res.status(201).json(await plans.create({userId:user._id,version:2,input,result,title:req.body.title??''}));
  }));
  router.get('/plans',handle(async(req,res)=>{
    const user=await identity(req);if(!user)return fail(res,401,'AUTH_REQUIRED');
    res.json(await plans.find({userId:user._id}).sort({createdAt:-1}).limit(30).lean());
  }));
  router.post('/plans/:id/export',handle(async(req,res)=>{
    const user=await identity(req);if(!user)return fail(res,401,'AUTH_REQUIRED');
    if(user.isPremium!==true)return fail(res,403,'PREMIUM_REQUIRED');
    if(!/^[a-f0-9]{24}$/i.test(req.params.id)||!req.body||Object.keys(req.body).some(k=>k!=='mode')||!['leave','breaks'].includes(req.body.mode))return fail(res,400,'INVALID_INPUT');
    const plan=await plans.findOne({_id:req.params.id,userId:user._id});if(!plan)return res.status(404).json({error:{code:'NOT_FOUND',message:'Plan not found'}});
    res.type('text/calendar').set('Content-Disposition',`attachment; filename="hopladay-${plan.result.year}-${req.body.mode}.ics"`).send(optimizerICS(plan.result,req.body.mode,String(plan._id)));
  }));
  router.post('/events',handle(async(req,res)=>{
    if(!req.body||Object.keys(req.body).length!==1||!events.includes(req.body.event))return fail(res,400,'INVALID_INPUT');
    // The client sends this only after opt-in; persist daily counts, never planning data or identity.
    await metrics.updateOne({day:new Date(now()).toISOString().slice(0,10),event:req.body.event},{$inc:{count:1}},{upsert:true});
    res.status(204).end();
  }));
  return router;
}
export default createOptimizerRouter();
