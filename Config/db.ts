import mongoose from "mongoose";

import dotenv from "dotenv";

dotenv.config();

const MONGO_URI = process.env.MONGO_URI;

const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI as string);
    console.log("MongoDB Connected succesfully");
  } catch (error) {
    console.error("MongoDB connection   Error", error);
    process.exit(1);
  }
};

export default connectDB;
