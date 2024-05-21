const mongoose = require('mongoose')
const  Register =mongoose.Schema({

    name:String,
    email:String,
    password:String,
    cartdata:{type:Object,default:{}}

},{minimize:false})
const Registerdata =    mongoose.models.Resisterdata ||mongoose.model("RegisterData",Register)
module.exports=Registerdata