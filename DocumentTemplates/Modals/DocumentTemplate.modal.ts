import mongoose, { Document } from "mongoose";

export interface IDocumentTemplateScope {
  label: string;
  detail: string;
}

export interface IDocumentTemplateExampleSection {
  heading: string;
  body?: string;
  bullets?: string[];
}

export interface IDocumentTemplate extends Document {
  code: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  scopes: IDocumentTemplateScope[];
  exampleSections: IDocumentTemplateExampleSection[];
  /** Avoid schema field name `isNew` — reserved on mongoose Document. */
  showNewBadge: boolean;
  isActive: boolean;
  sortOrder: number;
}

const scopeSchema = new mongoose.Schema<IDocumentTemplateScope>(
  {
    label: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },
  },
  { _id: false },
);

const exampleSectionSchema = new mongoose.Schema<IDocumentTemplateExampleSection>(
  {
    heading: { type: String, required: true, trim: true },
    body: { type: String, trim: true },
    bullets: { type: [String], default: undefined },
  },
  { _id: false },
);

const documentTemplateSchema = new mongoose.Schema<IDocumentTemplate>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    tagline: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    features: { type: [String], default: [] },
    scopes: { type: [scopeSchema], default: [] },
    exampleSections: { type: [exampleSectionSchema], default: [] },
    showNewBadge: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0, index: true },
  },
  { timestamps: true },
);

documentTemplateSchema.index({ isActive: 1, sortOrder: 1 });

if (mongoose.models.DocumentTemplate) {
  mongoose.deleteModel("DocumentTemplate");
}

const DocumentTemplate = mongoose.model<IDocumentTemplate>(
  "DocumentTemplate",
  documentTemplateSchema,
);

export default DocumentTemplate;
