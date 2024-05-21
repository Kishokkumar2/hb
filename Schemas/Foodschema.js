const mongoose = require('mongoose')
const  Foodschema =mongoose.Schema({

    name:String,
    description:String,
    price:Number,
    image:String,
    category:Object

})
const fooddata = mongoose.models.food || mongoose.model("MENU DATA",Foodschema)
module.exports=fooddata