const express = require('express');
const mongoose = require('mongoose');
const app = express();
const cors = require('cors');
const multer = require('multer');
const bcrypt = require('bcrypt');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken'); 
const stripe = require('stripe');
const  authMiddleware = require('./Middleware/AuthMiddleWare')
const corsconfig={
    origin:"*",
    credential:true,
    methods:["GET","POST","PUT","DELETE"]


}
require('dotenv').config();

const fooddata = require('./Schemas/Foodschema'); 
const Registerdata = require("./Schemas/Registerdata");
const Logindata = require("./Schemas/Login");
const Order = require("./Schemas/Order");

const Router = express.Router();
const PORT = process.env.PORT;
const JWT_SECRET = process.env.JWT_SECRET;
const Stripe = new stripe(process.env.StripeSecreatKey);
app.use("/images", express.static('Uploads'));
app.use(express.json());
app.use(cors(corsconfig));

// Function to create JWT token
const createToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, {
        expiresIn: '1h'
    });
};

mongoose.connect(process.env.uri, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }).then(() => {
    console.log('Connected to MongoDB Atlas');
  }).catch((error) => {
    console.error('Error connecting to MongoDB Atlas:', error);
  });
app.get('/abc', (req, res) => {
    res.send('Hello World')
  })
// Food data
const storage = multer.diskStorage({
    destination: "Uploads",
    filename: (req, file, cb) => {
        return cb(null, `${Date.now()}${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

app.post('/menudata', upload.single("image"), async function (req, res) {
    const image_filename = `${req.file.filename}`;
    const food = new fooddata({
        name: req.body.name,
        description: req.body.description,
        price: req.body.price,
        category: req.body.category,
        image: image_filename
    });
    try {
        await food.save();
        res.json({ success: true, message: "FOOD ADDED" });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error adding food" });
    }
});

app.get('/list', async function (req, res) {
    try {
        const foods = await fooddata.find({});
        res.json({ success: true, data: foods });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error fetching foods" });
    }
});

// Remove menu data
app.delete('/delete/:id', function (req, res) {
    const id = req.params.id;
    fooddata.findByIdAndDelete({ _id: id })
        .then(users => res.json(users))
        .catch(err => res.status(500).json({ success: false, message: "Error deleting food" }));
});

// Register page
app.post("/register", async function (req, res) {
    const { name, email, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);
    const data = {
        name: name,
        email: email,
        password: hashedpassword,
        cartdata: {} // Initialize cartdata
    };

    try {
        const check = await Registerdata.findOne({ email: email });
        if (check) {
            res.json("exist");
        } else {
            await Registerdata.insertMany([data]);
            res.json("not exist");
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error registering user" });
    }
});

// Login page
app.post('/Login', async function (req, res) {
    const { email, password } = req.body;

    try {
        const user = await Registerdata.findOne({ email: email });

        if (user) {
            const validPassword = await bcrypt.compare(password, user.password);
            if (validPassword) {
                const token = createToken(user._id);
                res.json({ success: "exist", token });
                const loginData = {
                    email: email,
                    password: user.password 
                };
                await Logindata.insertMany([loginData]);
            } else {
                res.json("incorrect password");
            }
        } else {
            res.json("not exist");
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error logging in" });
    }
});

// Add to cart
app.post('/add', authMiddleware, async function(req, res) {
    try {
        let userData = await Registerdata.findOne({_id: req.body.userId});
        if (!userData.cartdata) {
            userData.cartdata = {}; // Initialize cartdata if not present
        }
        let cartdata = userData.cartdata;
        if (!cartdata[req.body.itemId]) {
            cartdata[req.body.itemId] = 1;
        } else {
            cartdata[req.body.itemId] += 1;
        }
        await Registerdata.findByIdAndUpdate(req.body.userId, { cartdata });
        res.json({ success: true, cartdata });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error adding to cart" });
    }
});

// Remove from cart
app.post('/remove', authMiddleware, async function(req, res) {
    try {
        let userData = await Registerdata.findOne({_id: req.body.userId});
        if (!userData.cartdata) {
            userData.cartdata = {}; // Initialize cartdata if not present
        }
        let cartdata = userData.cartdata;
        if (cartdata[req.body.itemId]) {
            cartdata[req.body.itemId] -= 1;
            if (cartdata[req.body.itemId] <= 0) {
                delete cartdata[req.body.itemId];
            }
        }
        await Registerdata.findByIdAndUpdate(req.body.userId, { cartdata });
        res.json({ success: true, cartdata });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error removing from cart" });
    }
});

// Get cart data
app.post('/get', authMiddleware, async function(req, res) {
    try {
        let userData = await Registerdata.findOne({_id: req.body.userId});
        let cartdata = userData.cartdata || {}; // Ensure cartdata is an object
        res.json({ success: true, cartdata });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error fetching cart data" });
    }
});

// Place order
app.post('/place', authMiddleware, async function(req, res) {
    try {
        const newOrder = new Order({
            userId: req.body.userId,
            items: req.body.items,
            amount: req.body.amount,
            address: req.body.address
        });
        await newOrder.save();
        await Registerdata.findByIdAndUpdate(req.body.userId, { cartdata: {} });

        const lineitems = req.body.items.map((item) => ({
            price_data: {
                currency: "inr",
                product_data: {
                    name: item.name
                },
                unit_amount: item.price * 100
            },
            quantity: item.quantity
        }));
        lineitems.push({
            price_data: {
                currency: "inr",
                product_data: {
                    name: "Delivery Charge"
                },
                unit_amount: 200 // Delivery charge in smallest currency unit
            },
            quantity: 1
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineitems,
            mode: 'payment',
            success_url: `http://${url}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `http://${url}/verify?success=false&orderId=${newOrder._id}`
        });

        res.json({ success: true, sessionUrl: session.url });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error placing order" });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
