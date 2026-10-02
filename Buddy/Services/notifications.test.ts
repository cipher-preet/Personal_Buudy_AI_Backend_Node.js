import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { groupItems, insertedAt } from "./Notifications.services.js";

const at = (iso: string) => new Date(iso);

test("insertedAt uses the ObjectId time for manual items without a meeting", () => {
  const _id = mongoose.Types.ObjectId.createFromTime(Math.floor(Date.UTC(2026, 9, 2, 9, 30) / 1000));
  const doc = { _id, source: "manual", createdAt: at("2026-10-02T12:00:00Z") };
  assert.equal(insertedAt(doc).toISOString(), "2026-10-02T09:30:00.000Z");
});

test("insertedAt keeps createdAt for meeting-extracted items", () => {
  const _id = new mongoose.Types.ObjectId("f149a50600e6319f2ec76160");
  const doc = {
    _id,
    source: "manual",
    conversationId: new mongoose.Types.ObjectId(),
    createdAt: at("2026-10-02T05:39:01Z"),
  };
  assert.equal(insertedAt(doc).toISOString(), "2026-10-02T05:39:01.000Z");
});

test("insertedAt ignores implausible ObjectId timestamps", () => {
  const _id = new mongoose.Types.ObjectId("f149a50600e6319f2ec76160");
  const doc = { _id, source: "manual", createdAt: at("2026-10-01T10:00:00Z") };
  assert.equal(insertedAt(doc).toISOString(), "2026-10-01T10:00:00.000Z");
});

test("groupItems folds same-type items from one conversation created together", () => {
  const conversationId = "c1";
  const item = (id: string, type: "task" | "note", iso: string, conv: string | null = conversationId) => ({
    type,
    doc: { _id: id, conversationId: conv },
    createdAt: at(iso),
  });

  const groups = groupItems([
    item("n1", "note", "2026-10-02T10:00:00Z"),
    item("t1", "task", "2026-10-02T10:00:00Z"),
    item("n2", "note", "2026-10-02T09:59:00Z"),
    item("m1", "note", "2026-10-02T09:58:00Z", null),
    item("n3", "note", "2026-10-02T09:00:00Z"),
  ]);

  assert.deepEqual(
    groups.map((group) => group.members.map((member) => member.doc._id)),
    [["n1", "n2"], ["t1"], ["m1"], ["n3"]],
  );
});
