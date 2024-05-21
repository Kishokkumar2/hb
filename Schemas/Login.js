const mongoose = require('mongoose')
const  Login =mongoose.Schema({

    name:String,
    email:String,
    password:String,
    cartdata:{type:Object,default:{}}

},{minimize:false})
const Logindata =  mongoose.models.Logindata || mongoose.model("Logindata",Login)
module.exports=Logindata