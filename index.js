const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const clc = require("cli-color");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const session = require("express-session");
const mongoDbSession = require("connect-mongodb-session")(session);
const multer = require("multer");

// File imports
const { userDataValidation } = require("./utils/authUtil");
const userModel = require("./models/userModel");
const { isAuth } = require("./middlewares/authMiddleware");
const todoModel = require("./models/todoModel");
const rateLimiting = require("./middlewares/rateLimiting");

// Constants
const app = express();
const PORT = process.env.PORT;
const MONGO_URI = process.env.MONGO_URI;
const store = new mongoDbSession({
  uri: process.env.MONGO_URI,
  collection: "sessions",
});

// Multer Config (Store in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
});

// Middlewares
app.set("view engine", "ejs");
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(
  session({
    secret: process.env.SECRET_KEY,
    resave: false,
    saveUninitialized: false,
    store,
  })
);
app.use(express.static("public"));

// DB connection
mongoose
  .connect(MONGO_URI)
  .then(() => console.log(clc.yellowBright.bold("MongoDB connected")))
  .catch((err) => console.log(clc.redBright("Error: ", err)));

// APIs
app.get("/", (req, res) => res.render("homePage"));
app.get("/register", (req, res) => res.render("registerPage"));
app.get("/login", (req, res) => res.render("loginPage"));
app.get("/dashboard", isAuth, (req, res) => res.render("dashboardPage"));

// User Registration
app.post("/register", async (req, res) => {
  const { name, email, username, password } = req.body;

  // Data validation
  try {
    await userDataValidation({ name, email, username, password });
  } catch (error) {
    return res.send({ status: 400, message: "Invalid user data", error });
  }

  // Check if email or username exists
  if (await userModel.findOne({ email })) return res.send({ status: 400, message: "Email already exists" });
  if (await userModel.findOne({ username })) return res.send({ status: 400, message: "Username already exists" });

  // Hash password & store in DB
  const hashedPassword = await bcrypt.hash(password, parseInt(process.env.SALT));
  const userObj = new userModel({ name, email, username, password: hashedPassword });

  try {
    await userObj.save();
    return res.redirect("/login");
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

// User Login
app.post("/login", async (req, res) => {
  const { loginId, password } = req.body;
  let userDb;

  try {
    userDb = validator.isEmail(loginId) ? await userModel.findOne({ email: loginId }) : await userModel.findOne({ username: loginId });

    if (!userDb) return res.send({ status: 400, message: "User not found, please register" });

    if (!(await bcrypt.compare(password, userDb.password)))
      return res.send({ status: 400, message: "Password is incorrect" });

    // Session Auth
    req.session.isAuth = true;
    req.session.user = { userId: userDb._id, email: userDb.email, username: userDb.username };

    return res.redirect("/dashboard");
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

// Logout
app.post("/logout", isAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) return res.send({ status: 500, message: "Logout failed" });
    return res.redirect("/login");
  });
});

// Logout from all devices
app.post("/logout_from_all_devices", isAuth, async (req, res) => {
  const sessionModel = mongoose.model("session", new mongoose.Schema({ _id: String }, { strict: false }));

  try {
    await sessionModel.deleteMany({ "session.user.username": req.session.user.username });
    return res.redirect("/login");
  } catch (error) {
    return res.status(500).json(error);
  }
});

// Create Todo (Supports Text + Image)
app.post("/create-item", isAuth, upload.single("image"), async (req, res) => {
  const { todo } = req.body;
  const username = req.session.user.username;
  const image = req.file;

  if (!todo && !image) return res.status(400).json("Todo text or image is required");

  const todoObj = new todoModel({
    todo: todo || null,
    username,
    image: image ? { data: image.buffer, contentType: image.mimetype } : null,
  });

  try {
    const todoDb = await todoObj.save();
    return res.send({
      status: 201,
      message: "Todo saved successfully",
      data: { _id: todoDb._id, todo: todoDb.todo, hasImage: !!image },
    });
  } catch (error) {
    res.send({ status: 500, message: "Database error", error });
  }
});

// Fetch Todos (With Image URLs)
app.get("/read-item", isAuth, async (req, res) => {
  try {
    const todos = await todoModel.find({ username: req.session.user.username });
    if (todos.length === 0) return res.send({ status: 400, message: "No Todos found" });

    const formattedTodos = todos.map(todo => ({
      _id: todo._id,
      todo: todo.todo,
      hasImage: !!todo.image?.data,
      imageUrl: todo.image?.data ? `/download-image/${todo._id}` : null,
    }));

    return res.send({ status: 200, message: "Data fetched successfully", data: formattedTodos });
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

// Download Image
app.get("/download-image/:id", isAuth, async (req, res) => {
  try {
    const todo = await todoModel.findById(req.params.id);
    if (!todo || !todo.image?.data) return res.status(404).send("Image not found");

    res.set("Content-Type", todo.image.contentType);
    res.set("Content-Disposition", `attachment; filename=image.${todo.image.contentType.split('/')[1]}`);
    res.send(todo.image.data);
  } catch (error) {
    res.status(500).send("Error downloading image");
  }
});

// Delete Todo
app.post("/delete-item", isAuth, async (req, res) => {
  try {
    const todoDb = await todoModel.findOne({ _id: req.body.id });
    if (!todoDb) return res.send({ status: 400, message: "Todo not found" });
    if (req.session.user.username !== todoDb.username) return res.send({ status: 403, message: "Not authorized" });

    await todoModel.findByIdAndDelete(req.body.id);
    res.send({ status: 200, message: "Todo deleted successfully" });
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

app.listen(PORT, () => {
  console.log(clc.blue("Server started on:"), clc.cyan.underline.bold(`http://localhost:${PORT}`));
});
