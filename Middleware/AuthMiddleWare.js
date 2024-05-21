const jwt =require("jsonwebtoken")
const AuthMiddleWare =async function(req,res,next){
const {token}=req.headers
if(!token){
    return res.json({success:false,message:"Not authorized"})
}
try {
    const tokendecode =jwt.verify(token,process.env.JWT_SECRET )
    req.body.userId=tokendecode.id
    next()
} catch (error) {
    console.log(Error)
    
}
}
module.exports=AuthMiddleWare