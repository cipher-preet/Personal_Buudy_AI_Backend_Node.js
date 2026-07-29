import mongoose from "mongoose";

const stagedNotesSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: "stagedNotes",
  },
);

const stagedTasksSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: "stagedTasks",
  },
);

const StagedNotes =
  mongoose.models.StagedNotes ||
  mongoose.model("StagedNotes", stagedNotesSchema, "stagedNotes");

const StagedTasks =
  mongoose.models.StagedTasks ||
  mongoose.model("StagedTasks", stagedTasksSchema, "stagedTasks");

export { StagedNotes, StagedTasks };
