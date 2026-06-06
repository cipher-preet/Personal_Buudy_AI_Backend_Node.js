import mongoose from "mongoose";

const createSpaceSchema = new mongoose.Schema(
  {
    spacename: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "New",
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    isListining: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

const CreateSpace = mongoose.model("Space", createSpaceSchema);

export { CreateSpace };
