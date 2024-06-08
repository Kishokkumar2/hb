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
const authMiddleware = require('./Middleware/AuthMiddleWare');
require('dotenv').config();

const fooddata = require('./Schemas/Foodschema'); 
const Registerdata = require("./Schemas/Registerdata");
const Logindata = require("./Schemas/Login");
const Order = require("./Schemas/Order");

const Router = express.Router();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
const Stripe = stripe(process.env.StripeSecreatKey);

const corsconfig = {
    origin: "*",
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE"]
};

app.use("/images", express.static('Uploads'));
app.use(express.json());
app.use(cors(corsconfig));

app.options("", cors(corsconfig));

// Function to create JWT token
const createToken = (id) => {
    return jwt.sign({ id }, JWT_SECRET, {
        expiresIn: '1h'
    });
};

mongoose.connect(process.env.uri).then(function () {
    console.log("connected")
  }).catch(function () { console.log('error') })
app.get('/abc', (req, res) => {
    res.send('Hello World');
});

// Food data
const storage = multer.diskStorage({
    destination: "Uploads",
    filename: (req, file, cb) => {
        return cb(null, `${Date.now()}${file.originalname}`);
    }
});
const upload = multer({ storage: storage });

app.post('/menudata', upload.single("image"), async (req, res) => {
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

app.get('/list', async (req, res) => {
    try {
        const foods = await fooddata.find({});
        res.json({ success: true, data: foods });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error fetching foods" });
    }
});

app.delete('/delete/:id', async (req, res) => {
    const id = req.params.id;
    try {
        const result = await fooddata.findByIdAndDelete(id);
        res.json({ success: true, result });
    } catch (error) {
        res.status(500).json({ success: false, message: "Error deleting food" });
    }
});

app.post("/register", async (req, res) => {
    const { name, email, password } = req.body;
    const salt = await bcrypt.genSalt(10);
    const hashedpassword = await bcrypt.hash(password, salt);
    const data = new Registerdata({
        name,
        email,
        password: hashedpassword,
        cartdata: {}
    });

    try {
        const check = await Registerdata.findOne({ email });
        if (check) {
            res.json("exist");
        } else {
            await data.save();
            res.json("not exist");
        }
    } catch (error) {
        res.status(500).json({ success: false, message: "Error registering user" });
    }
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const user = await Registerdata.findOne({ email });
        if (user) {
            const validPassword = await bcrypt.compare(password, user.password);
            if (validPassword) {
                const token = createToken(user._id);
                res.json({ success: "exist", token });
                const loginData = new Logindata({
                    email,
                    password: user.password
                });
                await loginData.save();
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

app.post('/add', authMiddleware, async (req, res) => {
    try {
        let userData = await Registerdata.findById(req.body.userId);
        if (!userData.cartdata) {
            userData.cartdata = {};
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

app.post('/remove', authMiddleware, async (req, res) => {
    try {
        let userData = await Registerdata.findById(req.body.userId);
        if (!userData.cartdata) {
            userData.cartdata = {};
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

app.post('/get', authMiddleware, async (req, res) => {
    try {
        let userData = await Registerdata.findById(req.body.userId);
        let cartdata = userData.cartdata || {};
        res.json({ success: true, cartdata });
    } catch (error) {
        console.log(error);
        res.status(500).json({ success: false, message: "Error fetching cart data" });
    }
});

app.post('/place', authMiddleware, async (req, res) => {
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
                unit_amount: 200
            },
            quantity: 1
        });

        const session = await Stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: lineitems,
            mode: 'payment',
            success_url: `http://localhost:${PORT}/verify?success=true&orderId=${newOrder._id}`,
            cancel_url: `http://localhost:${PORT}/verify?success=false&orderId=${newOrder._id}`
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
