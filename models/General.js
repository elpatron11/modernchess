const mongoose = require('mongoose');

const GeneralSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        unique: true
    },
    price: {
        type: Number,
        required: true
    },
    maxSupply: {
        type: Number,
        required: true
    },
    currentSupply: {
        type: Number,
        required: true
    },
});

module.exports = mongoose.model('General', GeneralSchema);
