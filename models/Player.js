const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true
  }, password: {
    type: String,
    required: true
  },
  rating: {
    type: Number,
    default: 1200  // Starting rating for a new player
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  ownedGenerals: { type: [String], default: ['GW'] }  // GW is the default general for all users
});

// Pre-save middleware to hash password before saving it to the database



// Compile and export the model
const Player = mongoose.model('Player', playerSchema);
module.exports = Player;