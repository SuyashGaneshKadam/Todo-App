const mongoose = require("mongoose");
const Schema = mongoose.Schema;

const todoSchema = new Schema({
  todo: { type: String, required: false }, // Made optional to support image-only todos
  username: { type: String, required: true },
  image: {
    data: Buffer, // Stores image data as binary
    contentType: String, // Stores MIME type (e.g., 'image/png')
  },
});

module.exports = mongoose.model("todo", todoSchema);
