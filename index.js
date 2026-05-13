const express = require("express");
const session = require("express-session");

const connectDB = require("./db");
const bot = require("./bot");
const adminRoutes = require("./routes/admin");

const app = express();

app.set("view engine", "ejs");

app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false
}));

// LOGIN PAGE
app.get("/admin/login", (req,res)=>{
  res.render("login", { error:null });
});

// LOGIN
app.post("/admin/login", (req,res)=>{

  if(
    req.body.username === process.env.ADMIN_USERNAME &&
    req.body.password === process.env.ADMIN_PASSWORD
  ){
    req.session.admin = true;
    return res.redirect("/admin/dashboard");
  }

  res.render("login",{ error:"Invalid login" });
});

// AUTH
function auth(req,res,next){
  if(req.session.admin) return next();
  res.redirect("/admin/login");
}

app.use("/admin", auth, adminRoutes);

// HOME
app.get("/", (req,res)=>{
  res.render("home");
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
  await connectDB();
  bot.launch();
  console.log("Server running");
});