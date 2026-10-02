import { Response } from "express";
import type { CustomRequest } from "../../types/types.js";
import { ErrorResponse, STATUS_CODE, SuccessResponse } from "../../Api/index.js";
import {
  buildGoogleCalendarConnectUrl,
  completeGoogleCalendarConnect,
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
  GoogleCalendarError,
  syncGoogleCalendarForUser,
} from "../Services/GoogleCalendar.services.js";

const getAuthenticatedUserId = (req: CustomRequest) =>
  req.authUser?.id || req.session?.user?.id;

const requestOrigin = (req: CustomRequest) => `${req.protocol}://${req.get("host")}`;

const handleError = (res: Response, error: unknown, fallback: string) => {
  if (error instanceof GoogleCalendarError) {
    return ErrorResponse(res, error.status, error.message);
  }
  console.log("google calendar controller error", error);
  return ErrorResponse(res, STATUS_CODE.INTERNAL_SERVER_ERROR, fallback);
};

export const getGoogleCalendarStatusController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    return SuccessResponse(res, STATUS_CODE.OK, await getGoogleCalendarStatus(String(userId)));
  } catch (error) {
    return handleError(res, error, "Unable to load Google Calendar status.");
  }
};

export const getGoogleCalendarConnectUrlController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const url = buildGoogleCalendarConnectUrl(String(userId), requestOrigin(req));
    return SuccessResponse(res, STATUS_CODE.OK, { url });
  } catch (error) {
    return handleError(res, error, "Unable to start Google Calendar connection.");
  }
};

export const syncGoogleCalendarController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const result = await syncGoogleCalendarForUser(String(userId));
    const status = await getGoogleCalendarStatus(String(userId));
    return SuccessResponse(res, STATUS_CODE.OK, {
      message: result.skipped ? "A sync is already running." : "Google Calendar synced.",
      ...status,
    });
  } catch (error) {
    return handleError(res, error, "Google Calendar sync failed.");
  }
};

export const disconnectGoogleCalendarController = async (req: CustomRequest, res: Response) => {
  const userId = getAuthenticatedUserId(req);
  if (!userId) {
    return ErrorResponse(res, STATUS_CODE.UNAUTHORIZED, "Unauthorized");
  }

  try {
    const result = await disconnectGoogleCalendar(String(userId));
    return SuccessResponse(res, STATUS_CODE.OK, {
      message: "Google Calendar disconnected.",
      ...result,
    });
  } catch (error) {
    return handleError(res, error, "Unable to disconnect Google Calendar.");
  }
};

const escapeHtml = (value: string) =>
  value.replace(/[&<>"']/g, (char) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] as string,
  );

const renderResultPage = (ok: boolean, message: string) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${ok ? "Google Calendar connected" : "Connection failed"} · KukuNotes</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f5f6fb;
    font-family: Inter, "Segoe UI", system-ui, sans-serif; color: #101828; }
  .card { width: min(420px, calc(100vw - 32px)); padding: 32px 28px; border-radius: 18px; background: #fff;
    box-shadow: 0 18px 50px rgb(15 23 42 / 0.08); text-align: center; }
  .badge { width: 56px; height: 56px; margin: 0 auto 16px; border-radius: 50%; display: grid; place-items: center;
    font-size: 26px; color: #fff; background: ${ok ? "linear-gradient(135deg,#12b76a,#0f8b63)" : "linear-gradient(135deg,#f04438,#b42318)"}; }
  h1 { margin: 0 0 8px; font-size: 20px; }
  p { margin: 0; color: #475467; font-size: 14px; line-height: 1.5; }
  .brand { margin-top: 22px; font-size: 13px; font-weight: 700; color: #344054; }
  .brand span { background: linear-gradient(90deg,#7c3aed,#a855f7); -webkit-background-clip: text; background-clip: text; color: transparent; }
</style>
</head>
<body>
  <main class="card">
    <div class="badge">${ok ? "&#10003;" : "!"}</div>
    <h1>${ok ? "Google Calendar connected" : "Couldn't connect Google Calendar"}</h1>
    <p>${escapeHtml(message)}</p>
    <div class="brand">Kuku<span>Notes</span></div>
  </main>
</body>
</html>`;

export const googleCalendarCallbackController = async (req: CustomRequest, res: Response) => {
  const pick = (value: unknown) => (typeof value === "string" ? value : undefined);

  res.setHeader("Cache-Control", "no-store");
  try {
    const { accountEmail } = await completeGoogleCalendarConnect({
      code: pick(req.query.code),
      state: pick(req.query.state),
      error: pick(req.query.error),
    });
    return res
      .status(200)
      .type("html")
      .send(
        renderResultPage(
          true,
          `${accountEmail ? `${accountEmail} is now linked. ` : ""}Your events are syncing — you can close this tab and return to KukuNotes.`,
        ),
      );
  } catch (error) {
    const message =
      error instanceof GoogleCalendarError
        ? error.message
        : "Something went wrong. Please try again from KukuNotes.";
    return res.status(400).type("html").send(renderResultPage(false, message));
  }
};
