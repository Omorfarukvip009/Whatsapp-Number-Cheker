const mongoose = require("mongoose");

const ConfigSchema = new mongoose.Schema({
  apiUrl: String,
  apiToken: String
});

module.exports = mongoose.model("Config", ConfigSchema);