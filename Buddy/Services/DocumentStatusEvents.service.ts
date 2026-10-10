import { Response } from "express";
import mongoose from "mongoose";
import type { CustomRequest } from "../../types/types.js";
import {
  recordSseClose,
  recordSseOpen,
  recordSsePoll,
} from "./sseDiagnostics.js";

type DocumentStatusEvent = {
  eventType: string;
  userId: string;
  spaceId: string;
  jobId?: string;
  documentId: string;
  templateCode?: string;
  status?: string;
  stage?: string;
  progress?: number;
  message?: string;
  error?: string | null;
  updatedAt?: unknown;
};

const POLL_INTERVAL_MS = 2000;
const TERMINAL_STATUSES = new Set(["READY", "FAILED"]);

const writeSseEvent = (res: Response, event: DocumentStatusEvent) => {
  res.write("event: document.status\n");
  res.write(`data: ${JSON.stringify(event)}\n\n`);
};

const idCandidates = (value: string) => {
  if (mongoose.isValidObjectId(value)) {
    return [value, new mongoose.Types.ObjectId(value)];
  }
  return [value];
};

const identityClause = (fields: string[], value: string) => ({
  $or: fields.map(field => ({
    [field]: {
      $in: idCandidates(value),
    },
  })),
});

const getDocumentId = (document: Record<string, unknown>, ...keys: string[]) => {
  for (const key of keys) {
    if (document[key]) {
      return String(document[key]);
    }
  }
  return "";
};

const eventSignature = (event: DocumentStatusEvent) =>
  [
    event.documentId,
    event.jobId || "",
    event.status || "",
    event.stage || "",
    String(event.progress ?? ""),
    event.message || "",
    event.error || "",
  ].join("|");

const buildDocumentEvent = (document: Record<string, unknown>): DocumentStatusEvent => ({
  eventType: "document.status.changed",
  userId: getDocumentId(document, "userId", "user_id"),
  spaceId: getDocumentId(document, "spaceId", "space_id"),
  jobId: document.jobId ? String(document.jobId) : undefined,
  documentId: getDocumentId(document, "_id", "documentId"),
  templateCode: document.templateCode ? String(document.templateCode) : undefined,
  status: document.status ? String(document.status) : undefined,
  stage: document.stage ? String(document.stage) : undefined,
  progress:
    typeof document.progress === "number"
      ? document.progress
      : document.progress != null
        ? Number(document.progress)
        : undefined,
  message: document.message ? String(document.message) : undefined,
  error: document.error == null ? null : String(document.error),
  updatedAt: document.updatedAt,
});

export const streamDocumentStatusEvents = (req: CustomRequest, res: Response) => {
  const authUserId = req.authUser?.id || req.session?.user?.id;
  const requestedUserId = String(req.query.userId || "");
  const requestedSpaceId = String(req.query.spaceId || "").trim();
  const requestedJobId = String(req.query.jobId || "").trim();
  const requestedDocumentId = String(req.query.documentId || "").trim();

  if (!authUserId) {
    res.status(401).json({ success: false, message: "Unauthorized" });
    return;
  }

  if (requestedUserId && requestedUserId !== authUserId) {
    res.status(403).json({ success: false, message: "Forbidden" });
    return;
  }

  if (requestedSpaceId && !mongoose.isValidObjectId(requestedSpaceId)) {
    res.status(400).json({
      success: false,
      message: "Invalid 'spaceId' query parameter.",
    });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  res.write(": connected\n\n");
  recordSseOpen();

  const seenEvents = new Map<string, string>();
  let isPolling = false;
  let terminalSeen = false;
  const keepAliveTimer = setInterval(() => {
    res.write(": keep-alive\n\n");
  }, 15000);

  const emitChangedEvent = (event: DocumentStatusEvent) => {
    if (!event.spaceId || !event.documentId) {
      return;
    }

    const key = event.documentId;
    const signature = eventSignature(event);
    const previousSignature = seenEvents.get(key);
    seenEvents.set(key, signature);

    if (previousSignature !== signature) {
      writeSseEvent(res, event);
    }

    if (event.status && TERMINAL_STATUSES.has(event.status)) {
      terminalSeen = true;
    }
  };

  const pollStatusChanges = async () => {
    if (isPolling || res.destroyed || terminalSeen) {
      return;
    }

    isPolling = true;
    const pollStarted = Date.now();

    try {
      const queryClauses: Record<string, unknown>[] = [
        identityClause(["userId", "user_id"], authUserId),
      ];

      if (requestedSpaceId) {
        queryClauses.push(identityClause(["spaceId", "space_id"], requestedSpaceId));
      }
      if (requestedJobId) {
        queryClauses.push({ jobId: requestedJobId });
      }
      if (requestedDocumentId) {
        queryClauses.push({
          _id: { $in: idCandidates(requestedDocumentId) },
        });
      }

      const docs = await mongoose.connection
        .collection("spaceDocuments")
        .find({ $and: queryClauses })
        .sort({ updatedAt: -1, _id: -1 })
        .limit(10)
        .toArray();

      docs.forEach(document => {
        emitChangedEvent(buildDocumentEvent(document as Record<string, unknown>));
      });
    } catch (error) {
      console.log("Document status polling error:", error);
      res.write(
        `event: document.status.error\ndata: ${JSON.stringify({
          message: "Status polling failed.",
        })}\n\n`,
      );
    } finally {
      recordSsePoll(Date.now() - pollStarted);
      isPolling = false;
    }
  };

  pollStatusChanges().catch(error => {
    console.log("Initial document status poll failed:", error);
  });

  const pollTimer = setInterval(() => {
    if (terminalSeen) {
      clearInterval(pollTimer);
      return;
    }
    pollStatusChanges().catch(error => {
      console.log("Document status poll failed:", error);
    });
  }, POLL_INTERVAL_MS);

  req.on("close", () => {
    clearInterval(keepAliveTimer);
    clearInterval(pollTimer);
    recordSseClose();
  });
};
