require('dotenv').config();
const mongoose = require('mongoose');
const Player = require('./models/Player'); // Ensure the path is correct

mongoose.connect(process.env.DB_URL, {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => {
    console.log("MongoDB connected!");
    adjustRatings();
}).catch(err => console.error("MongoDB connection error:", err));

async function adjustRatings() {
    try {
        const result = await Player.updateMany(
            { rating: { $gte: 1400 } },  // Condition: rating is 1400 or more
            { $inc: { rating: -25 } }   // Action: decrement rating by 25
        );
        console.log(`Ratings decreased for ${result.nModified} players.`);
    } catch (error) {
        console.error('Failed to decrease ratings:', error);
    } finally {
        mongoose.disconnect();
    }
}
