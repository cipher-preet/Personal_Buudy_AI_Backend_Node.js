import { Request } from "express";
import { Session } from "express-session";


export interface CustomRequest extends Request {
  session: Session & {
    userId?: string;
  };
}