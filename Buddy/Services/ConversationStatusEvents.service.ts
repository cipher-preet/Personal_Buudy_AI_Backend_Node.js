import { Response } from "express";
import mongoose from "mongoose";
import type { CustomRequest } from "../../types/types.js";

type StatusEvent = {
  eventType: string;
  userId: string;
  spaceId: string;
  conversationId: string;
  status?: string;
  extractionRunId?: string;
  extractionRunStatus?: string;
  updatedAt?: unknown;
};

const POLL_INTERVAL_MS = 2000;
const STATUS_LOOKBACK_LIMIT = 50;
const TERMINAL_STATUSES = new Set([
  "COMPLETED",
  "PARTIAL",
  "FAILED",
  "PUBLISHED",
]);

const writeSseEvent = (res: Response, event: StatusEvent) => {
  res.write("event: conversation.status\n");
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const idCandidates = (value: string) => {
  if (mongoose.isValidObjectId(value)) {
    return [value, new mongoose.Types.ObjectId(value)];
  }

  return [value];
};

const getDocumentId = (document: Record<string, unknown>, key: string) =>
  document[key] ? String(document[key]) : "";

const eventSignature = (event: StatusEvent) =>
  [
    event.eventType,
    event.conversationId,
    event.extractionRunId || "",
    event.status || "",
    event.extractionRunStatus || "",
  ].join("|");

const isTerminalEvent = (event: StatusEvent) => {
  const status = event.extractionRunStatus || event.status;

  return status ? TERMINAL_STATUSES.has(status) : false;
};

const buildConversationEvent = (
  document: Record<string, unknown>,
): StatusEvent => ({
  eventType: "conversation.status.changed",
  userId: getDocumentId(document, "userId"),
  spaceId: getDocumentId(document, "spaceId"),
  conversationId: getDocumentId(document, "_id"),
  status: document.status ? String(document.status) : undefined,
  updatedAt: document.updatedAt,
});

const buildExtractionRunEvent = (
  document: Record<string, unknown>,
): StatusEvent => ({
  eventType: "extraction_run.status.changed",
  userId: getDocumentId(document, "userId"),
  spaceId: getDocumentId(document, "spaceId"),
  conversationId: getDocumentId(document, "conversationId"),
  extractionRunId: getDocumentId(document, "_id"),
  extractionRunStatus: document.status ? String(document.status) : undefined,
  updatedAt: document.updatedAt,
});

export const streamConversationStatusEvents = (
  req: CustomRequest,
  res: Response,
) => {
  const authUserId = req.authUser?.id || req.session?.user?.id;
  const requestedUserId = String(req.query.userId || "");

  if (!authUserId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (requestedUserId && requestedUserId !== authUserId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(": connected\n\n");

  const seenEvents = new Map<string, string>();
  let isPolling = false;
  const keepAliveTimer = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  const emitChangedEvent = (event: StatusEvent, emitInitial: boolean) => {
    if (!event.spaceId) {
      return;
    }

    const key = [
      event.eventType,
      event.conversationId,
      event.extractionRunId || "",
    ].join("|");
    const signature = eventSignature(event);
    const previousSignature = seenEvents.get(key);

    seenEvents.set(key, signature);

    if (!previousSignature && !emitInitial && isTerminalEvent(event)) {
      return;
    }

    if (previousSignature !== signature) {
      writeSseEvent(res, event);
    }
  };

  const pollStatusChanges = async (emitInitial = false) => {
    if (isPolling || res.destroyed) {
      return;
    }

    isPolling = true;

    try {
      const query = {
        userId: {
          $in: idCandidates(authUserId),
        },
      };
      const [conversations, extractionRuns] = await Promise.all([
        mongoose.connection
          .collection("conversations")
          .find(query)
          .sort({ updatedAt: -1, _id: -1 })
          .limit(STATUS_LOOKBACK_LIMIT)
          .toArray(),
        mongoose.connection
          .collection("extraction_runs")
          .find(query)
          .sort({ updatedAt: -1, _id: -1 })
          .limit(STATUS_LOOKBACK_LIMIT)
          .toArray(),
      ]);

      conversations.forEach(document => {
        emitChangedEvent(
          buildConversationEvent(document as Record<string, unknown>),
          emitInitial,
        );
      });

      extractionRuns.forEach(document => {
        emitChangedEvent(
          buildExtractionRunEvent(document as Record<string, unknown>),
          emitInitial,
        );
      });
    } catch (error) {
      console.log("Conversation status polling error:", error);
      res.write(
        `event: conversation.status.error\ndata: ${JSON.stringify({
          message: "Status polling failed.",
        })}\n\n`,
      );
    } finally {
      isPolling = false;
    }
  };

  pollStatusChanges(true).catch(error => {
    console.log("Initial conversation status poll failed:", error);
  });

  const pollTimer = setInterval(() => {
    pollStatusChanges().catch(error => {
      console.log("Conversation status poll failed:", error);
    });
  }, POLL_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    clearInterval(pollTimer);
  });
};
