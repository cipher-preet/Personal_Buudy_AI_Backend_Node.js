import crypto from "crypto";
import { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";

import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import User from "../Modals/user.modal.js";
import { saveOptionalAuthDeviceToken } from "../../Buddy/Repository/DeviceToken.repository.js";
import { buildAuthPayload, setAuthSession, upsertGoogleUser } from "./Auth.controller.js";

/*
  Browser-based Google sign-in for the desktop app. In-app Google Identity Services only works when the
  app's loopback origin is registered with Google; this flow only needs CALLBACK_PATH registered as a
  redirect URI on the same OAuth client:
  1. /start (opened in the system browser) redirects to Google with a signed state holding a PKCE-style challenge.
  2. /callback verifies Google's code, then redirects to the app's fixed loopback URL with a short-lived handoff code.
  3. /exchange trades the handoff code plus the verifier, which only the app instance that started has, for a session.
*/
const CALLBACK_PATH = "/api/v1/auth/google/desktop/callback";
const DEFAULT_RETURN_URL = "http://127.0.0.1:41731/auth/google/complete";
const STATE_TTL_SECONDS = 10 * 60;
const HANDOFF_TTL_SECONDS = 2 * 60;
const CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STATE_PURPOSE = "desktop-login";
const HANDOFF_PURPOSE = "desktop-handoff";

const readConfig = () => {
  const clientId = process.env.GOOGLE_WEB_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret =
    process.env.GOOGLE_WEB_CLIENT_SECRET ||
    (clientId === process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_SECRET || "" : "");

  return {
    clientId,
    clientSecret,
    redirectUri: process.env.GOOGLE_DESKTOP_LOGIN_REDIRECT_URI || "",
    // Never taken from the request, so the callback cannot be turned into an open redirect.
    returnUrl: process.env.DESKTOP_LOGIN_RETURN_URL || DEFAULT_RETURN_URL,
  };
};

// Derived key keeps these tokens unusable as auth tokens or calendar connect state, which share the base secret.
const signingKey = () => {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("Auth token secret is not configured");
  }
  return crypto.createHash("sha256").update(`${secret}:google-desktop-login`).digest();
};

const nowSeconds = () => Math.floor(Date.now() / 1000);

const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};

const signToken = (payload: Record<string, unknown>, ttlSeconds: number) => {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      nonce: crypto.randomBytes(8).toString("hex"),
      exp: nowSeconds() + ttlSeconds,
    }),
  ).toString("base64url");
  const signature = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  return `${body}.${signature}`;
};

const verifyToken = <T extends Record<string, unknown>>(token: unknown, purpose: string): T | null => {
  const [body, signature] = String(token || "").split(".");
  if (!body || !signature) {
    return null;
  }

  const expected = crypto.createHmac("sha256", signingKey()).update(body).digest("base64url");
  if (!safeEqual(signature, expected)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload?.purpose !== purpose || typeof payload.exp !== "number" || payload.exp < nowSeconds()) {
      return null;
    }
    return payload as T;
  } catch {
    return null;
  }
};

const requestOrigin = (req: Request) => `${req.protocol}://${req.get("host")}`;

const redirectToApp = (res: Response, params: Record<string, string>) => {
  const url = new URL(readConfig().returnUrl);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return res.redirect(302, url.toString());
};

export const startGoogleDesktopLoginController = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const challenge = typeof req.query.challenge === "string" ? req.query.challenge : "";
    if (!CHALLENGE_PATTERN.test(challenge)) {
      return ErrorResponse(
        res,
        STATUS_CODE.BAD_REQUEST,
        "Invalid sign-in request. Start again from KukuNotes.",
      );
    }

    const config = readConfig();
    if (!config.clientId || !config.clientSecret) {
      return ErrorResponse(
        res,
        STATUS_CODE.INTERNAL_SERVER_ERROR,
        "Google login is not configured",
      );
    }

    const redirectUri = config.redirectUri || `${requestOrigin(req)}${CALLBACK_PATH}`;
    const client = new OAuth2Client({
      clientId: config.clientId,
      clientSecret: config.clientSecret,
      redirectUri,
    });

    const authUrl = client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state: signToken({ purpose: STATE_PURPOSE, ch: challenge, redirectUri }, STATE_TTL_SECONDS),
    });

    return res.redirect(302, authUrl);
  } catch (error) {
    next(error);
  }
};

export const googleDesktopLoginCallbackController = async (req: Request, res: Response) => {
  const state = verifyToken<{ ch: string; redirectUri: string }>(req.query.state, STATE_PURPOSE);
  if (!state) {
    return redirectToApp(res, { error: "This sign-in link has expired. Start again from KukuNotes." });
  }

  if (req.query.error) {
    return redirectToApp(res, {
      error:
        req.query.error === "access_denied"
          ? "Google sign-in was cancelled."
          : "Google sign-in failed. Please try again.",
    });
  }

  const code = typeof req.query.code === "string" ? req.query.code : "";
  if (!code) {
    return redirectToApp(res, { error: "Google did not return a sign-in code. Please try again." });
  }

  try {
    const { clientId, clientSecret } = readConfig();
    const client = new OAuth2Client({ clientId, clientSecret, redirectUri: state.redirectUri });
    const { tokens } = await client.getToken(code);
    if (!tokens.id_token) {
      throw new Error("Google did not return an ID token");
    }

    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload?.email || !payload.sub) {
      return redirectToApp(res, { error: "Invalid Google account." });
    }

    const { user, isNewUser } = await upsertGoogleUser({
      sub: payload.sub,
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      email_verified: payload.email_verified,
    });

    return redirectToApp(res, {
      code: signToken(
        { purpose: HANDOFF_PURPOSE, uid: user._id.toString(), isNewUser, ch: state.ch },
        HANDOFF_TTL_SECONDS,
      ),
    });
  } catch (error) {
    // Only the message: Google client errors carry the token request, including the client secret.
    console.log("Google desktop login callback failed:", error instanceof Error ? error.message : String(error));
    return redirectToApp(res, { error: "Google sign-in failed. Please try again." });
  }
};

export const exchangeGoogleDesktopLoginController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { code, verifier } = (req.body ?? {}) as { code?: unknown; verifier?: unknown };
    const handoff = verifyToken<{ uid: string; isNewUser?: boolean; ch: string }>(code, HANDOFF_PURPOSE);
    const isVerifierValid =
      typeof verifier === "string" && verifier.length >= 43 && verifier.length <= 128;

    if (
      !handoff ||
      !isVerifierValid ||
      !safeEqual(crypto.createHash("sha256").update(verifier).digest("base64url"), handoff.ch) ||
      !mongoose.isValidObjectId(handoff.uid)
    ) {
      return ErrorResponse(
        res,
        STATUS_CODE.UNAUTHORIZED,
        "This sign-in has expired. Please try again.",
      );
    }

    const user = await User.findById(handoff.uid);
    if (!user) {
      return ErrorResponse(res, STATUS_CODE.NOT_FOUND, "User not found");
    }

    setAuthSession(req, user);
    await saveOptionalAuthDeviceToken(user._id.toString(), req.body);

    return SuccessResponse(res, STATUS_CODE.OK, buildAuthPayload(user, Boolean(handoff.isNewUser)));
  } catch (error) {
    next(error);
  }
};
