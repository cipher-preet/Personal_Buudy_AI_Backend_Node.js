import { Request } from "express";
import { Session, SessionData } from "express-session";

export interface CustomRequest extends Request {
  session: Session &
    Partial<SessionData> & {
      userId?: string;
      email?: string;
      name?: string;
    };
}