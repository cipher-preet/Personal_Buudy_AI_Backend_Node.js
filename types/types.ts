import { Request } from "express";
import { Session, SessionData } from "express-session";

export interface CustomRequest extends Request {
  session: Session &
    Partial<SessionData> & {
      user?: {
        id: string;
        email?: string;
        phone?: number;
        name?: string;
      };
    };
  authUser?: {
    id: string;
    email?: string;
    phone?: number;
    name?: string;
    provider?: string;
  };
}
