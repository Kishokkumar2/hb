const mongoose = require('mongoose')
const  orderSchema =mongoose.Schema({
      userId:String,
      items:Array,
      amount:Number,
      address:Object,
      status:{type:Date,default:"Food Processing"},
      date:{type:Date,default:Date.now()},
      payment:Boolean


})
const Order =  mongoose.models.order || mongoose.model("order", orderSchema)
module.exports=Order