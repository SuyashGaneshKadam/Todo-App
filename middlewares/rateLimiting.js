const accessModel = require("../models/accessModel");

const rateLimiting = async (req, res, next) => {
  const sessionId = req.session.id;
  try {
    const accessDb = await accessModel.findOne({ sessionId });

    // Checking if its a first request
    if (!accessDb) {
      const accessObj = new accessModel({ sessionId, time: Date.now() });

      // Create entry in DB
      await accessObj.save();
      next();
      return;
    }
    const diff = (Date.now() - accessDb.time) / 1000; // Time in seconds
    if (diff < 5) {
      console.log()
      return res.send({
        status: 400,
        message: "Too many requests, please wait for some time",
      });
    }
    await accessModel.findOneAndUpdate({ sessionId }, { time: Date.now() });
    next();
  } catch (error) {
    return res.send({
      status: 500,
      message: "Database error in ratelimitng",
      error: error,
    });
  }
};

module.exports = rateLimiting;
