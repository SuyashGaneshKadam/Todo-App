const validator = require("validator");

const userDataValidation = ({ name, email, username, password }) => {
  return new Promise((resolve, reject) => {
    if (!name || !username || !email || !password)
      reject("Missing credentials");

    if (typeof name !== "string") reject("Name is not a text");
    if (typeof username !== "string") reject("Username is not a text");
    if (typeof email !== "string") reject("Email is not a text");
    if (typeof password !== "string") reject("Password is not a text");

    if (username.length <= 2 || username.length > 20)
      reject("Username length should be 3-20");

    if (password.length <= 2 || password.length > 20)
      reject("Password length should be 3-20");

    if (!validator.isEmail(email)) reject("Email format is incorrect");

    resolve();
  });
};

module.exports = { userDataValidation };
