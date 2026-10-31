import mongoose from 'mongoose';
const schema=new mongoose.Schema({day:{type:String,required:true},event:{type:String,required:true},count:{type:Number,default:0}},{versionKey:false});
schema.index({day:1,event:1},{unique:true});
export default mongoose.model('PlanningMetric',schema);
