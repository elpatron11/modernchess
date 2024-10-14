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
     
        { name: 'Robinhood', price: 10, maxSupply: 10, currentSupply: 10 }
      //  { name: 'Orc', price: 10, maxSupply: 10, currentSupply: 10 }
        

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
