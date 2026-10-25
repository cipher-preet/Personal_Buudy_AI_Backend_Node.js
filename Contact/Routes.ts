import { Router } from "express";
import { submitContactController } from "./Controllers/Contact.Controller.js";

const router = Router();

router.post("/", submitContactController);

export default router;
