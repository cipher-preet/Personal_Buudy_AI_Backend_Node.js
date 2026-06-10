import mongoose from "mongoose";

const aiMemoryNotesSchema = new mongoose.Schema(
  {},
  {
    strict: false,
    collection: "ai_memory_notes",
  },
);

const AiMemoryNotes = mongoose.model(
  "AiMemoryNotes",
  aiMemoryNotesSchema,
  "ai_memory_notes",
);

export { AiMemoryNotes };
