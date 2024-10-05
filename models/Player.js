const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

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
  }
});

// Middleware to hash password before saving
playerSchema.pre('save', async function(next) {
    if (this.isModified('password') || this.isNew) {
      this.password = await bcrypt.hash(this.password, 10);
    }
    next();
  });
  
  module.exports = mongoose.model('Player', playerSchema);
