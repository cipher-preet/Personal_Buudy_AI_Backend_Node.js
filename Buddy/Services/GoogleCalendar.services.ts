import crypto from "crypto";
import mongoose from "mongoose";
import { OAuth2Client } from "google-auth-library";
import User from "../../Authentication/Modals/user.modal.js";
import { CalendarEvent } from "../Modals/CalendarEvent.Modal.js";
import { CalendarIntegration } from "../Modals/CalendarIntegration.Modal.js";
import { DEFAULT_REMINDER_TIMEZONE } from "../reminderSchedule/constants.js";
import { decryptSecret, encryptSecret } from "../../utils/secretBox.js";

const PROVIDER = "google";
const SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/calendar.readonly",
];
const CALLBACK_PATH = "/api/v1/integrations/google-calendar/callback";
const STATE_TTL_SECONDS = 15 * 60;
const SYNC_PAST_DAYS = 30;
const SYNC_FUTURE_DAYS = 180;
const MAX_CALENDARS = 15;
const MAX_EVENTS_PER_CALENDAR = 1500;
const MAX_ALL_DAY_SPAN_DAYS = 14;
const SYNC_LOCK_STALE_MS = 5 * 60_000;
const AUTO_SYNC_INTERVAL_MS = 15 * 60_000;
const SCHEDULER_TICK_MS = 5 * 60_000;
const CONNECT_ERROR_TTL_MS = 10 * 60_000;
const API_BASE = "https://www.googleapis.com/calendar/v3";

type GoogleEventTime = { date?: string; dateTime?: string; timeZone?: string };

type GoogleEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  eventType?: string;
  start?: GoogleEventTime;
  end?: GoogleEventTime;
  attendees?: Array<{ self?: boolean; responseStatus?: string }>;
};

type GoogleCalendarListEntry = {
  id?: string;
  summary?: string;
  primary?: boolean;
  selected?: boolean;
  hidden?: boolean;
  deleted?: boolean;
};

type SyncedEventRow = {
  externalId: string;
  externalCalendarId: string;
  externalUrl: string;
  title: string;
  description: string;
  location: string;
  dateKey: string;
  dateLabel: string;
  startTimeLabel: string;
  endTimeLabel: string;
  allDay: boolean;
};

export class GoogleCalendarError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/* ---------- Config + OAuth client ---------- */

const readConfig = () => ({
  clientId:
    process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CLIENT_ID || "",
  clientSecret:
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "",
  redirectUri: process.env.GOOGLE_CALENDAR_REDIRECT_URI || "",
});

export const isGoogleCalendarConfigured = () => {
  const { clientId, clientSecret } = readConfig();
  return Boolean(clientId && clientSecret);
};

const createOAuthClient = (redirectUri?: string) => {
  const { clientId, clientSecret } = readConfig();
  if (!clientId || !clientSecret) {
    throw new GoogleCalendarError(
      "Google Calendar is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
      503,
    );
  }
  return new OAuth2Client({ clientId, clientSecret, redirectUri });
};

export const resolveRedirectUri = (requestOrigin: string) =>
  readConfig().redirectUri || `${requestOrigin.replace(/\/+$/, "")}${CALLBACK_PATH}`;

/* ---------- Signed OAuth state ---------- */

const stateSecret = () => {
  const secret = process.env.AUTH_TOKEN_SECRET || process.env.SESSION_SECRET;
  if (!secret) {
    throw new GoogleCalendarError("Auth token secret is not configured", 500);
  }
  return secret;
};

const signState = (payload: { uid: string; redirectUri: string }) => {
  const body = Buffer.from(
    JSON.stringify({
      ...payload,
      purpose: "gcal",
      nonce: crypto.randomBytes(8).toString("hex"),
      exp: Math.floor(Date.now() / 1000) + STATE_TTL_SECONDS,
    }),
  ).toString("base64url");
  const signature = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  return `${body}.${signature}`;
};

const verifyState = (state: string) => {
  const [body, signature] = String(state || "").split(".");
  if (!body || !signature) {
    return null;
  }
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(body)
    .digest("base64url");
  const given = Buffer.from(signature);
  const wanted = Buffer.from(expected);
  if (given.length !== wanted.length || !crypto.timingSafeEqual(given, wanted)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as {
      uid?: string;
      redirectUri?: string;
      purpose?: string;
      exp?: number;
    };
    if (
      payload.purpose !== "gcal" ||
      !payload.uid ||
      !payload.redirectUri ||
      !payload.exp ||
      payload.exp < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return { uid: payload.uid, redirectUri: payload.redirectUri };
  } catch {
    return null;
  }
};

/* ---------- Connect attempt errors (shown to the desktop while it polls) ---------- */

const connectErrors = new Map<string, { message: string; at: number }>();

const rememberConnectError = (userId: string, message: string) => {
  connectErrors.set(userId, { message, at: Date.now() });
};

const readConnectError = (userId: string) => {
  const entry = connectErrors.get(userId);
  if (!entry) {
    return null;
  }
  if (Date.now() - entry.at > CONNECT_ERROR_TTL_MS) {
    connectErrors.delete(userId);
    return null;
  }
  return entry;
};

/* ---------- Public API ---------- */

export const buildGoogleCalendarConnectUrl = (userId: string, requestOrigin: string) => {
  const redirectUri = resolveRedirectUri(requestOrigin);
  const client = createOAuthClient(redirectUri);
  connectErrors.delete(userId);

  return client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: true,
    scope: SCOPES,
    state: signState({ uid: userId, redirectUri }),
  });
};

export const completeGoogleCalendarConnect = async (input: {
  code?: string;
  state?: string;
  error?: string;
}) => {
  const state = verifyState(input.state || "");
  if (!state) {
    throw new GoogleCalendarError(
      "This connect link has expired. Start again from KukuNotes.",
    );
  }

  const userId = state.uid;

  try {
    if (input.error) {
      throw new GoogleCalendarError(
        input.error === "access_denied"
          ? "Google Calendar access was not granted."
          : `Google returned an error: ${input.error}`,
      );
    }
    if (!input.code) {
      throw new GoogleCalendarError("Google did not return an authorization code.");
    }
    if (!mongoose.isValidObjectId(userId)) {
      throw new GoogleCalendarError("Invalid user.");
    }

    const client = createOAuthClient(state.redirectUri);
    const { tokens } = await client.getToken(input.code);

    const grantedScope = tokens.scope || "";
    if (!grantedScope.includes("calendar.readonly")) {
      throw new GoogleCalendarError(
        "Calendar permission was not granted. Tick the calendar checkbox on Google's consent screen.",
      );
    }

    let accountEmail = "";
    if (tokens.id_token) {
      try {
        const ticket = await client.verifyIdToken({
          idToken: tokens.id_token,
          audience: readConfig().clientId,
        });
        accountEmail = ticket.getPayload()?.email || "";
      } catch {
        accountEmail = "";
      }
    }

    const existing = await CalendarIntegration.findOne({ userId, provider: PROVIDER })
      .select("+refreshToken")
      .lean<{ refreshToken?: string } | null>();

    const refreshToken = tokens.refresh_token
      ? encryptSecret(tokens.refresh_token)
      : existing?.refreshToken;

    if (!refreshToken) {
      throw new GoogleCalendarError(
        "Google did not return offline access. Remove KukuNotes from your Google account permissions and connect again.",
      );
    }

    await CalendarIntegration.findOneAndUpdate(
      { userId, provider: PROVIDER },
      {
        $set: {
          refreshToken,
          accountEmail,
          scope: grantedScope,
          status: "active",
          lastError: "",
          syncInProgressSince: null,
        },
        $setOnInsert: { userId: new mongoose.Types.ObjectId(userId), provider: PROVIDER },
      },
      { upsert: true, new: true },
    );

    connectErrors.delete(userId);
    // Awaited: Cloud Run throttles CPU once the response is sent.
    await syncGoogleCalendarForUser(userId).catch((error) => {
      console.log("google calendar initial sync failed", error);
    });

    return { userId, accountEmail };
  } catch (error) {
    const message =
      error instanceof GoogleCalendarError
        ? error.message
        : "Could not connect Google Calendar. Please try again.";
    if (!(error instanceof GoogleCalendarError)) {
      console.log("google calendar connect failed", error);
    }
    rememberConnectError(userId, message);
    throw error instanceof GoogleCalendarError ? error : new GoogleCalendarError(message, 500);
  }
};

export const getGoogleCalendarStatus = async (userId: string) => {
  const integration = await CalendarIntegration.findOne({
    userId,
    provider: PROVIDER,
  }).lean<Record<string, any> | null>();

  const connectError = readConnectError(userId);
  const syncing =
    Boolean(integration?.syncInProgressSince) &&
    Date.now() - new Date(integration!.syncInProgressSince).getTime() < SYNC_LOCK_STALE_MS;

  return {
    provider: PROVIDER,
    configured: isGoogleCalendarConfigured(),
    connected: Boolean(integration),
    status: integration?.status ?? null,
    accountEmail: integration?.accountEmail || "",
    lastError: integration?.lastError || "",
    lastSyncedAt: integration?.lastSyncedAt ?? null,
    lastSyncEventCount: integration?.lastSyncEventCount ?? 0,
    calendarCount: integration?.calendarCount ?? 0,
    connectedAt: integration?.createdAt ?? null,
    syncing,
    connectError: connectError?.message ?? null,
    connectErrorAt: connectError ? new Date(connectError.at).toISOString() : null,
  };
};

export const disconnectGoogleCalendar = async (userId: string) => {
  const integration = await CalendarIntegration.findOne({ userId, provider: PROVIDER })
    .select("+refreshToken")
    .lean<{ _id: unknown; refreshToken?: string } | null>();

  if (integration?.refreshToken) {
    try {
      await createOAuthClient().revokeToken(decryptSecret(integration.refreshToken));
    } catch (error) {
      // Already-revoked tokens fail here; disconnect still proceeds locally.
      console.log("google calendar token revoke failed", (error as Error)?.message);
    }
  }

  await CalendarIntegration.deleteOne({ userId, provider: PROVIDER });
  const removed = await CalendarEvent.deleteMany({
    userId: new mongoose.Types.ObjectId(userId),
    source: PROVIDER,
  });
  connectErrors.delete(userId);

  return { removedEvents: removed.deletedCount ?? 0 };
};

/* ---------- Sync ---------- */

const tzParts = (instant: Date, timeZone: string) => {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(instant)
      .map((part) => [part.type, part.value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
};

const toTimeLabel = (hour: number, minute: number) => {
  const hour12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
};

const toDateLabel = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
};

const addDaysToKey = (dateKey: string, days: number) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days, 12)).toISOString().slice(0, 10);
};

const clip = (value: string | undefined, max: number) => {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
};

const plainText = (value: string | undefined) =>
  String(value || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

export const mapGoogleEvent = (
  event: GoogleEvent,
  calendarId: string,
  timeZone: string,
): SyncedEventRow[] => {
  if (!event.id || event.status === "cancelled" || event.eventType === "workingLocation") {
    return [];
  }
  if (event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined")) {
    return [];
  }

  const base = {
    externalCalendarId: calendarId,
    externalUrl: event.htmlLink || "",
    title: clip(event.summary, 80) || "(No title)",
    description: clip(plainText(event.description), 500),
    location: clip(event.location, 120),
  };

  if (event.start?.date) {
    const startKey = event.start.date;
    const endExclusive = event.end?.date && event.end.date > startKey ? event.end.date : addDaysToKey(startKey, 1);
    const rows: SyncedEventRow[] = [];
    for (
      let dateKey = startKey, index = 0;
      dateKey < endExclusive && index < MAX_ALL_DAY_SPAN_DAYS;
      dateKey = addDaysToKey(dateKey, 1), index += 1
    ) {
      rows.push({
        ...base,
        externalId: `${event.id}:${dateKey}`,
        dateKey,
        dateLabel: toDateLabel(dateKey),
        startTimeLabel: "12:00 AM",
        endTimeLabel: "11:59 PM",
        allDay: true,
      });
    }
    return rows;
  }

  if (!event.start?.dateTime) {
    return [];
  }

  const start = new Date(event.start.dateTime);
  const end = event.end?.dateTime ? new Date(event.end.dateTime) : new Date(start.getTime() + 30 * 60_000);
  if (Number.isNaN(start.getTime())) {
    return [];
  }

  const startParts = tzParts(start, timeZone);
  const endParts = Number.isNaN(end.getTime()) ? null : tzParts(end, timeZone);
  const endsSameDay = endParts && endParts.dateKey === startParts.dateKey;
  const startMinutes = startParts.hour * 60 + startParts.minute;
  let endLabel = endsSameDay ? toTimeLabel(endParts.hour, endParts.minute) : "11:59 PM";
  if (endsSameDay && endParts.hour * 60 + endParts.minute <= startMinutes) {
    const bumped = Math.min(startMinutes + 30, 23 * 60 + 59);
    endLabel = toTimeLabel(Math.floor(bumped / 60), bumped % 60);
  }

  return [
    {
      ...base,
      externalId: event.id,
      dateKey: startParts.dateKey,
      dateLabel: toDateLabel(startParts.dateKey),
      startTimeLabel: toTimeLabel(startParts.hour, startParts.minute),
      endTimeLabel: endLabel,
      allDay: false,
    },
  ];
};

const isInvalidGrant = (error: unknown) => {
  const err = error as { response?: { data?: { error?: string } }; message?: string };
  return (
    err?.response?.data?.error === "invalid_grant" ||
    /invalid_grant/i.test(err?.message || "")
  );
};

const listCalendars = async (client: OAuth2Client) => {
  const response = await client.request<{ items?: GoogleCalendarListEntry[] }>({
    url: `${API_BASE}/users/me/calendarList`,
    params: { minAccessRole: "reader", maxResults: 250 },
  });

  const items = (response.data.items ?? []).filter(
    (calendar) => calendar.id && !calendar.deleted && !calendar.hidden && (calendar.primary || calendar.selected),
  );
  items.sort((a, b) => Number(Boolean(b.primary)) - Number(Boolean(a.primary)));
  return items.slice(0, MAX_CALENDARS);
};

const listCalendarEvents = async (
  client: OAuth2Client,
  calendarId: string,
  timeMin: string,
  timeMax: string,
) => {
  const events: GoogleEvent[] = [];
  let pageToken: string | undefined;

  do {
    const response = await client.request<{ items?: GoogleEvent[]; nextPageToken?: string }>({
      url: `${API_BASE}/calendars/${encodeURIComponent(calendarId)}/events`,
      params: {
        timeMin,
        timeMax,
        singleEvents: true,
        orderBy: "startTime",
        showDeleted: false,
        maxResults: 250,
        pageToken,
        fields:
          "nextPageToken,items(id,status,summary,description,location,htmlLink,eventType,start,end,attendees(self,responseStatus))",
      },
    });
    events.push(...(response.data.items ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken && events.length < MAX_EVENTS_PER_CALENDAR);

  return events;
};

const acquireSyncLock = async (userId: string) =>
  CalendarIntegration.findOneAndUpdate(
    {
      userId,
      provider: PROVIDER,
      $or: [
        { syncInProgressSince: null },
        { syncInProgressSince: { $lt: new Date(Date.now() - SYNC_LOCK_STALE_MS) } },
      ],
    },
    { $set: { syncInProgressSince: new Date() } },
    { new: true, projection: "+refreshToken" },
  ).lean<{ refreshToken?: string } | null>();

export const syncGoogleCalendarForUser = async (userId: string) => {
  const locked = await acquireSyncLock(userId);
  if (!locked) {
    const exists = await CalendarIntegration.exists({ userId, provider: PROVIDER });
    if (!exists) {
      throw new GoogleCalendarError("Google Calendar is not connected.", 404);
    }
    return { skipped: true as const, reason: "already_syncing" };
  }

  try {
    if (!locked.refreshToken) {
      throw new GoogleCalendarError("Google Calendar is not connected.", 404);
    }

    const user = await User.findById(userId).select("timezone").lean<{ timezone?: string } | null>();
    let timeZone = user?.timezone?.trim() || DEFAULT_REMINDER_TIMEZONE;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone });
    } catch {
      timeZone = DEFAULT_REMINDER_TIMEZONE;
    }

    const client = createOAuthClient();
    client.setCredentials({ refresh_token: decryptSecret(locked.refreshToken) });

    const now = Date.now();
    const timeMin = new Date(now - SYNC_PAST_DAYS * 86_400_000).toISOString();
    const timeMax = new Date(now + SYNC_FUTURE_DAYS * 86_400_000).toISOString();
    const windowFrom = tzParts(new Date(timeMin), timeZone).dateKey;
    const windowTo = tzParts(new Date(timeMax), timeZone).dateKey;

    const calendars = await listCalendars(client);
    const rows = new Map<string, SyncedEventRow>();
    for (const calendar of calendars) {
      const events = await listCalendarEvents(client, calendar.id!, timeMin, timeMax);
      for (const event of events) {
        for (const row of mapGoogleEvent(event, calendar.id!, timeZone)) {
          // The same invite can appear on several of the user's calendars.
          if (!rows.has(row.externalId)) {
            rows.set(row.externalId, row);
          }
        }
      }
    }

    const ownerId = new mongoose.Types.ObjectId(userId);
    const synced = [...rows.values()];

    if (synced.length > 0) {
      await CalendarEvent.bulkWrite(
        synced.map((row) => ({
          updateOne: {
            filter: { userId: ownerId, source: PROVIDER, externalId: row.externalId },
            update: {
              $set: { ...row },
              $setOnInsert: {
                userId: ownerId,
                source: PROVIDER,
                tone: "cyan",
                aiReminder: false,
                aiCalling: false,
                notification: false,
                beeping: false,
                remindBeforeMinutes: 0,
                reminderId: null,
              },
            },
            upsert: true,
          },
        })),
        { ordered: false },
      );
    }

    await CalendarEvent.deleteMany({
      userId: ownerId,
      source: PROVIDER,
      dateKey: { $gte: windowFrom, $lte: windowTo },
      externalId: { $nin: synced.map((row) => row.externalId) },
    });

    await CalendarIntegration.updateOne(
      { userId, provider: PROVIDER },
      {
        $set: {
          status: "active",
          lastError: "",
          lastSyncedAt: new Date(),
          lastSyncEventCount: synced.length,
          calendarCount: calendars.length,
          syncInProgressSince: null,
        },
      },
    );

    return { skipped: false as const, events: synced.length, calendars: calendars.length };
  } catch (error) {
    const message = isInvalidGrant(error)
      ? "Google access was revoked or expired. Reconnect Google Calendar."
      : error instanceof GoogleCalendarError
        ? error.message
        : "Google Calendar sync failed. It will retry automatically.";

    if (!isInvalidGrant(error) && !(error instanceof GoogleCalendarError)) {
      console.log("google calendar sync failed", error);
    }

    await CalendarIntegration.updateOne(
      { userId, provider: PROVIDER },
      { $set: { status: "error", lastError: message, syncInProgressSince: null } },
    );

    throw new GoogleCalendarError(message, isInvalidGrant(error) ? 401 : 502);
  }
};

/**
 * Request-driven sync for hosts where background timers don't run while idle
 * (Cloud Run with CPU throttling). Never throws.
 */
export const syncGoogleCalendarIfStale = async (userId: string) => {
  if (!isGoogleCalendarConfigured() || !mongoose.isValidObjectId(userId)) {
    return;
  }

  try {
    const due = await CalendarIntegration.exists({
      userId,
      provider: PROVIDER,
      lastError: { $not: /reconnect/i },
      $or: [
        { lastSyncedAt: null },
        { lastSyncedAt: { $lt: new Date(Date.now() - AUTO_SYNC_INTERVAL_MS) } },
      ],
    });
    if (due) {
      await syncGoogleCalendarForUser(userId);
    }
  } catch {
    // Failure is recorded on the integration and shown on the Integrations page.
  }
};

/* ---------- Background sync ---------- */

let schedulerTimer: NodeJS.Timeout | null = null;

export const startGoogleCalendarSyncScheduler = () => {
  if (schedulerTimer) {
    return;
  }

  const tick = async () => {
    if (!isGoogleCalendarConfigured() || mongoose.connection.readyState !== 1) {
      return;
    }

    try {
      const due = await CalendarIntegration.find({
        provider: PROVIDER,
        $or: [
          { lastSyncedAt: null },
          { lastSyncedAt: { $lt: new Date(Date.now() - AUTO_SYNC_INTERVAL_MS) } },
        ],
      })
        .select("userId")
        .sort({ lastSyncedAt: 1 })
        .limit(25)
        .lean<Array<{ userId: unknown }>>();

      for (const integration of due) {
        try {
          await syncGoogleCalendarForUser(String(integration.userId));
        } catch {
          // Failure is recorded on the integration; keep going with other users.
        }
      }
    } catch (error) {
      console.log("google calendar scheduler tick failed", error);
    }
  };

  schedulerTimer = setInterval(() => {
    void tick();
  }, SCHEDULER_TICK_MS);
  schedulerTimer.unref();
  setTimeout(() => void tick(), 30_000).unref();
};
