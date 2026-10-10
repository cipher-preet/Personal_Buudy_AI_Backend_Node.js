import { Router } from "express";
import {
  getDocumentTemplateByIdController,
  getDocumentTemplatesController,
} from "./Controllers/DocumentTemplate.Controller.js";

const router = Router();

// Public catalog — same pattern as GET /api/v1/plans
router.get("/", getDocumentTemplatesController);
router.get("/:id", getDocumentTemplateByIdController);

export default router;
