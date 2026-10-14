import { Router } from "express";
import {
  getMarketplaceAgentByIdController,
  getMarketplaceAgentsController,
} from "./Controllers/MarketplaceAgent.Controller.js";

const router = Router();

// Public catalog — same pattern as GET /api/v1/document-templates
router.get("/agents", getMarketplaceAgentsController);
router.get("/agents/:id", getMarketplaceAgentByIdController);

export default router;
