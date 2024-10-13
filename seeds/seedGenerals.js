const mongoose = require('mongoose');
const General = require('../models/General');
require('dotenv').config();

mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log("MongoDB connected!"))
.catch(err => console.error("MongoDB connection error:", err));



const seedGenerals = async () => {
    const generals = [
        { name: 'GW', price: 0, maxSupply: Infinity, currentSupply: Infinity },
        { name: 'GH', price: 5, maxSupply: 100, currentSupply: 100 },
        { name: 'GA', price: 5, maxSupply: 50, currentSupply: 50 },
        { name: 'GM', price: 20, maxSupply: 10, currentSupply: 10 },
        { name: 'Barbarian', price: 10, maxSupply: 10, currentSupply: 10 },
        { name: 'Paladin', price: 10, maxSupply: 10, currentSupply: 10 }
        

    ];

    try {
        await General.insertMany(generals);
        console.log('Generals seeded successfully');
        mongoose.connection.close();
    } catch (error) {
        console.error('Error seeding generals:', error);
        mongoose.connection.close();
    }
};

seedGenerals();
