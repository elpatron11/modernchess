const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const playerSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 5,  // Minimum length of the username
    maxlength: 12, // Maximum length of the username
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9]+$/.test(v);  // Allows only alphanumeric characters
      },
      message: props => `${props.value} is not a valid username! Only alphanumeric characters are allowed.`
    }
  
  
  }, 
  
  
  password: {
    type: String,
    required: true,
    minlength: 8,  // Minimum length of the password
    maxlength: 12, // Maximum length of the password
    validate: {
      validator: function(v) {
        return /^[a-zA-Z0-9]+$/.test(v);  // Allows only alphanumeric characters
      },
      message: props => `Password must be between 8 and 12 characters long and can only contain alphanumeric characters.`
    }
  },
  rating: {
    type: Number,
    default: 1200  // Starting rating for a new player
  },
  gamesPlayed: {
    type: Number,
    default: 0
  },
  ownedGenerals: { type: [String], default: ['GM'] },
  ownedCards: {type: [String], default: ['Tower Defense'] }, // Array to store the cards owned by the player
  balance: {
    type: Number,
    default: 0
  },

  generalsCoin: {
    type: Number,
    default: 20
  },
  
  ownedAvatars: { type: [String], default: ['/resources/images/avatars/default.png'] }, // Array of owned avatars
  selectedAvatar: { type: String, default: '/resources/images/avatars/default.png' },  // Active avatar
    

});

// Pre-save middleware to hash password before saving it to the database



// Compile and export the model
const Player = mongoose.model('Player', playerSchema);
module.exports = Player;