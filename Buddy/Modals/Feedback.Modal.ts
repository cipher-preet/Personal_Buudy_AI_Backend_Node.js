import mongoose from "mongoose";

const feedbackSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    topicId: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    topicLabel: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200,
    },
  },
  {
    timestamps: true,
    collection: "feedback",
  },
);

feedbackSchema.index({ userId: 1, createdAt: -1 });

const Feedback =
  mongoose.models.Feedback || mongoose.model("Feedback", feedbackSchema);

export { Feedback };
