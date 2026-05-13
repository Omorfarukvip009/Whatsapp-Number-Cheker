const express = require("express");
const User = require("../models/User");
const Config = require("../models/Config");

const router = express.Router();

// DASHBOARD
router.get("/dashboard", async (req, res) => {

  const users = await User.find();

  const topUsers = users
    .sort((a,b) => b.totalChecked - a.totalChecked)
    .slice(0,10);

  const config = await Config.findOne();

  res.render("dashboard", { users, topUsers, config });
});

// BAN
router.get("/ban/:id", async (req,res)=>{
  await User.findOneAndUpdate({ userId: req.params.id }, { banned: true });
  res.redirect("/admin/dashboard");
});

// UNBAN
router.get("/unban/:id", async (req,res)=>{
  await User.findOneAndUpdate({ userId: req.params.id }, { banned: false });
  res.redirect("/admin/dashboard");
});

// APPROVE
router.get("/approve/:id", async (req,res)=>{
  await User.findOneAndUpdate({ userId: req.params.id }, { approved: true });
  res.redirect("/admin/dashboard");
});

// SAVE API CONFIG
router.post("/config", async (req,res)=>{
  const { apiUrl, apiToken } = req.body;

  await Config.findOneAndUpdate(
    {},
    { apiUrl, apiToken },
    { upsert: true }
  );

  res.redirect("/admin/dashboard");
});

module.exports = router;