const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema({
  userId: { type: String, unique: true },
  name: String,

  approved: { type: Boolean, default: false },
  banned: { type: Boolean, default: false },

  totalChecked: { type: Number, default: 0 }
});

module.exports = mongoose.model("User", UserSchema);