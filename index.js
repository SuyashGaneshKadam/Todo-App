const express = require("express");
require("dotenv").config();
const mongoose = require("mongoose");
const clc = require("cli-color");
const bcrypt = require("bcryptjs");
const validator = require("validator");
const session = require("express-session");
const mongoDbSession = require("connect-mongodb-session")(session);

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

//DB connection
mongoose
  .connect(MONGO_URI)
  .then(() => console.log(clc.yellowBright.bold("MongoDB connected")))
  .catch((err) => console.log(clc.redBright("Error: ", err)));

//APIs
app.get("/", (req, res) => {
  return res.render("homePage");
});

app.get("/register", (req, res) => {
  return res.render("registerPage");
});

app.get("/login", (req, res) => {
  return res.render("loginPage");
});

app.post("/register", async (req, res) => {
  const { name, email, username, password } = req.body;
  // console.log(name, email, username, password);

  // Data validation
  try {
    await userDataValidation({ name, email, username, password });
  } catch (error) {
    return res.send({ status: 400, message: "Invalid user data", error });
  }

  // Checking if email already exists
  const emailExists = await userModel.findOne({ email });
  if (emailExists) {
    return res.send({ status: 400, message: "Email already exists" });
  }

  // Checking if username already exists
  const usernameExists = await userModel.findOne({ username });
  if (usernameExists) {
    return res.send({ status: 400, message: "Username already exists" });
  }

  // Hashed password
  const hashedPasword = await bcrypt.hash(password, parseInt(process.env.SALT));

  // Storing in the database
  const userObj = new userModel({
    name,
    email,
    username,
    password: hashedPasword,
  });
  try {
    const userDb = await userObj.save();
    // res.send({status: 200, message:"User data saved successfully", data: userDb});
    return res.redirect("/login");
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

app.post("/login", async (req, res) => {
  const { loginId, password } = req.body;
  let userDb;
  // Search for the user
  try {
    if (validator.isEmail(loginId)) {
      userDb = await userModel.findOne({ email: loginId });
    } else {
      userDb = await userModel.findOne({ username: loginId });
    }

    if (!userDb) {
      return res.send({
        status: 400,
        message: "User not found, please register",
      });
    }
    // console.log(userDb);

    // Comparing passwords
    const isMatched = await bcrypt.compare(password, userDb.password);
    if (!isMatched) {
      return res.send({ status: 400, message: "Password is incorrect" });
    }
    // if (password !== userDb.password) {
    //   return res.send({ status: 400, message: "Password is incorrect" });
    // }

    // Session based Auth
    req.session.isAuth = true;
    req.session.user = {
      userId: userDb._id,
      email: userDb.email,
      username: userDb.username,
    };

    return res.redirect("/dashboard");
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error: error });
  }
});

app.get("/dashboard", isAuth, (req, res) => {
  return res.render("dashboardPage");
});

app.post("/logout", isAuth, (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.send({ status: 500, message: "Log out failed" });
    } else {
      return res.redirect("/login");
    }
  });
});

app.post("/logout_from_all_devices", isAuth, async (req, res) => {
  const username = req.session.user.username;
  // console.log(username);

  // Session schema
  const sessionSchema = new mongoose.Schema({ _id: String }, { strict: false });
  const sessionModel = mongoose.model("session", sessionSchema);

  try {
    const deletedDb = await sessionModel.deleteMany({
      "session.user.username": username,
    });
    // console.log(deletedDb);
    return res.status(200).redirect("/login");
  } catch (error) {
    return res.status(500).json(error);
  }
});

app.post("/create-item", isAuth, rateLimiting, async (req, res) => {
  const { todo } = req.body;
  const username = req.session.user.username;

  //Data validation
  if (!todo) {
    return res.status(400).json("Todo text is missing");
  } else if (typeof todo !== "string") {
    return res.status(400).json("Todo is not a text");
  } else if (todo.length < 3 || todo.length > 500) {
    return res.status(400).json("Todo length should be 3-500");
  }

  // Creating todo object
  const todoObj = new todoModel({
    todo,
    username,
  });

  //Saving todo in the Database
  try {
    const todoDb = await todoObj.save();
    return res.send({
      status: 201,
      message: "Todo saved successfully",
      data: todoDb,
    });
  } catch (error) {
    res.send({ status: 500, message: "Database error", error });
  }
});

app.get("/read-item", isAuth, async (req, res) => {
  // Code before using Pagination
  const username = req.session.user.username;
  try {
    const todos = await todoModel.find({ username });
    // console.log(todos);
    if (todos.length === 0) {
      return res.send({
        status: 400,
        message: "No Todos found",
      });
    }
    return res.send({
      status: 200,
      message: "Data fetched successfully",
      data: todos,
    });
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }

  // --------------------------------------------------------------------------------
  
  // Code after using Pagination
  // const username = req.session.user.username;
  // const SKIP = Number(req.query.skip) || 0;
  // const LIMIT = 3;

  // // MongoDB aggregate, skip, limit, match
  // try {
  //   const todos = await todoModel.aggregate([
  //     {
  //       $match: { username: username },
  //     },
  //     {
  //       $facet: {
  //         data: [
  //           {
  //             $skip: SKIP,
  //           },
  //           {
  //             $limit: LIMIT,
  //           },
  //         ],
  //       },
  //     },
  //   ]);
  //   // console.log(todos);
  //   if (todos[0].data.length === 0) {
  //     return res.send({
  //       status: 404,
  //       message: SKIP === 0 ? "No todos found" : "No more todos",
  //       data: todos[0].data,
  //     });
  //   }
  //   return res.send({
  //     status: 200,
  //     message: "Data fetched successfully",
  //     data: todos[0].data,
  //   });
  // } catch (error) {
  //   return res.send({ status: 500, message: "Database error", error });
  // }
});

app.post("/edit-item", isAuth, async (req, res) => {
  const { id, newData } = req.body;
  const username = req.session.user.username;
  try {
    // Searching for the todo
    const todoDb = await todoModel.findOne({ _id: id });

    if (!todoDb) return res.send({ status: 400, message: "Todo not found" });

    // Checking ownership
    if (username !== todoDb.username)
      return res.send({ status: 403, message: "You are not authorized" });

    // Updating the todo
    const prevTodo = await todoModel.findOneAndUpdate(
      { _id: id },
      { todo: newData }
    );

    return res.send({
      status: 200,
      message: "Todo updated successfully",
      data: prevTodo,
    });
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

app.post("/delete-item", isAuth, async (req, res) => {
  const { id } = req.body;
  const username = req.session.user.username;
  // console.log("id:", id);

  try {
    // Searching for todo
    const todoDb = await todoModel.findOne({ _id: id });
    // console.log(todoDb);

    if (!todoDb) {
      return res.send({ status: 400, message: "Todo not found" });
    }

    // Checking ownership
    if (username !== todoDb.username) {
      return res.send({ status: 403, message: "You are not authorized" });
    }

    // Deleting the todo
    const deletedTodo = await todoModel.findOneAndDelete({ _id: id });

    res.send({
      status: 200,
      message: "Todo deleted successfully",
      data: deletedTodo,
    });
  } catch (error) {
    return res.send({ status: 500, message: "Database error", error });
  }
});

app.listen(PORT, () => {
  console.log(
    clc.blue("Server started on:"),
    clc.cyan.underline.bold(`http://localhost:${PORT}`)
  );
});
