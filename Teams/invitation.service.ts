import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import mongoose from "mongoose";

import { STATUS_CODE } from "../Api/index.js";
import User from "../Authentication/Modals/user.modal.js";
import { CreateSpace } from "../Buddy/Modals/Home.Modal.js";
import { getEmailAdapter } from "../Mail/getEmailAdapter.js";
import { MailConfigError, MailDeliveryError } from "../Mail/zohoEmailAdapter.js";
import { SpaceShare } from "./Modals/SpaceShare.modal.js";
import { TeamInvitation } from "./Modals/TeamInvitation.modal.js";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const INVITE_DAYS = 7;

export class InvitationError extends Error {
  status: number;

  constructor(message: string, status = STATUS_CODE.BAD_REQUEST) {
    super(message);
    this.name = "InvitationError";
    this.status = status;
  }
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const publicAppUrl = () => (process.env.APP_PUBLIC_URL || "http://127.0.0.1:5173").replace(/\/$/, "");

const inviteLink = (token: string) => `${publicAppUrl()}/#/invite/${token}`;

const loadUser = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) {
    throw new InvitationError("Sign in again to continue.", STATUS_CODE.UNAUTHORIZED);
  }
  const user = await User.findById(userId).select("name email").lean();
  if (!user) {
    throw new InvitationError("Sign in again to continue.", STATUS_CODE.UNAUTHORIZED);
  }
  return user;
};

const ownedSpaces = async (ownerId: string, spaceIds: string[]) => {
  const unique = [...new Set(spaceIds.filter((id) => mongoose.isValidObjectId(id)))];
  if (unique.length === 0) {
    throw new InvitationError("Select at least one space.");
  }
  const spaces = await CreateSpace.find({
    _id: { $in: unique },
    userId: ownerId,
    deletedAt: null,
  })
    .select("spacename")
    .lean();
  if (spaces.length === 0) {
    throw new InvitationError("Those spaces are no longer available.");
  }
  return spaces;
};

const isExpired = (invite: { status: string; expiresAt: Date }) =>
  invite.status === "pending" && new Date(invite.expiresAt).getTime() <= Date.now();

const presentInvite = async (invite: {
  _id: unknown;
  token: string;
  status: string;
  expiresAt: Date;
  inviteeEmail: string;
  inviterUserId: unknown;
  spaceIds: unknown[];
}) => {
  const [inviter, spaces] = await Promise.all([
    User.findById(invite.inviterUserId).select("name email").lean(),
    CreateSpace.find({ _id: { $in: invite.spaceIds }, deletedAt: null }).select("spacename").lean(),
  ]);
  const expired = isExpired(invite);
  return {
    id: String(invite._id),
    token: invite.token,
    status: expired ? "expired" : invite.status,
    expiresAt: invite.expiresAt,
    inviteeEmail: invite.inviteeEmail,
    inviter: {
      id: String(invite.inviterUserId),
      name: inviter?.name || inviter?.email || "KukuNotes user",
      email: inviter?.email || "",
    },
    spaces: spaces.map((space) => ({ id: String(space._id), name: space.spacename || "Space" })),
  };
};

const logoFilePath = () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "Mail/assets/kukunotes-icon.png"),
    path.resolve(here, "../Mail/assets/kukunotes-icon.png"),
    path.resolve(here, "../../Mail/assets/kukunotes-icon.png"),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
};

const logoAttachment = (filePath: string) => ({
  filename: "kukunotes-icon.png",
  path: filePath,
  cid: "kukunotes-logo",
  contentType: "image/png",
});

const spaceRows = (names: string[]) =>
  names
    .map(
      (name) => `
        <tr>
          <td style="padding:11px 14px;border-top:1px solid #e7edf5;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.4;font-weight:600;color:#101828;">
            ${escapeHtml(name)}
          </td>
        </tr>`,
    )
    .join("");

const inviteEmailHtml = (input: {
  inviterName: string;
  spaceNames: string[];
  link: string;
  includeLogo: boolean;
}) => {
  const name = escapeHtml(input.inviterName);
  const link = escapeHtml(input.link);
  const spaces =
    input.spaceNames.length > 0
      ? spaceRows(input.spaceNames)
      : `<tr><td style="padding:11px 14px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;color:#667085;">The spaces in this invitation will be listed on the invitation page.</td></tr>`;

  return `<!DOCTYPE html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f6f8fc;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="width:100%;max-width:560px;background:#ffffff;border:1px solid #dbe2ec;border-radius:14px;">
            <tr>
              <td style="padding:28px 32px 0;">
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="vertical-align:middle;">
                      ${input.includeLogo ? '<img src="cid:kukunotes-logo" width="40" height="40" alt="KukuNotes" style="display:block;width:40px;height:40px;border:0;border-radius:10px;" />' : ""}
                    </td>
                    <td style="padding-left:12px;vertical-align:middle;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:18px;line-height:1;font-weight:700;color:#101828;">
                      Kuku<span style="color:#7c3aed;">Notes</span>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:22px 32px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.4;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#1355ff;">
                Space invitation
              </td>
            </tr>
            <tr>
              <td style="padding:8px 32px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:26px;line-height:1.25;font-weight:700;letter-spacing:-0.02em;color:#101828;">
                ${name} invited you
              </td>
            </tr>
            <tr>
              <td style="padding:12px 32px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:15px;line-height:1.6;color:#667085;">
                ${name} shared work with you on KukuNotes. You can view the spaces below. This access is view only, so the notes, tasks, meetings, documents, and mind maps stay as they are.
              </td>
            </tr>
            <tr>
              <td style="padding:20px 32px 0;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fc;border:1px solid #e7edf5;border-radius:10px;">
                  <tr>
                    <td style="padding:11px 14px 4px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:11px;line-height:1.4;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#667085;">
                      Spaces
                    </td>
                  </tr>
                  ${spaces}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0;">
                <a href="${link}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#1355ff;color:#ffffff;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:14px;line-height:1.2;font-weight:700;text-decoration:none;">
                  View invitation
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 0;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:13px;line-height:1.6;color:#667085;">
                This invitation expires in 7 days. Sign in with this email address before you accept. If the button does not open, use this link:<br />
                <a href="${link}" style="color:#1355ff;word-break:break-all;">${link}</a>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 28px;font-family:Inter,Segoe UI,Arial,sans-serif;font-size:12px;line-height:1.5;color:#94a3b8;">
                Sent by KukuNotes for ${name}.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const sendInviteEmail = async (input: {
  email: string;
  inviterName: string;
  spaceNames: string[];
  token: string;
}) => {
  const link = inviteLink(input.token);
  const spaceLine = input.spaceNames.length > 0 ? input.spaceNames.join(", ") : "their spaces";
  const logo = logoFilePath();
  if (!logo) {
    console.warn("Invitation logo was not found. Sending the email without the image.");
  }
  const mail = getEmailAdapter();
  await mail.send({
    to: [input.email],
    subject: `${input.inviterName} invited you to KukuNotes`,
    text: [
      `${input.inviterName} invited you to view ${spaceLine} on KukuNotes.`,
      "",
      "This access is view only. You can look through the work, and you cannot edit or delete it.",
      "",
      "View the invitation:",
      link,
      "",
      "This link expires in 7 days. Sign in with this email address before you accept.",
    ].join("\n"),
    html: inviteEmailHtml({
      inviterName: input.inviterName,
      spaceNames: input.spaceNames,
      link,
      includeLogo: Boolean(logo),
    }),
    ...(logo ? { attachments: [logoAttachment(logo)] } : {}),
  });
};

export const sendInvitation = async (
  inviterUserId: string,
  body: { email?: unknown; spaceIds?: unknown },
) => {
  const inviter = await loadUser(inviterUserId);
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const spaceIds = Array.isArray(body.spaceIds)
    ? body.spaceIds.filter((id): id is string => typeof id === "string")
    : [];

  if (!EMAIL_PATTERN.test(email)) {
    throw new InvitationError("Enter a valid email address.");
  }
  if (inviter.email && inviter.email.toLowerCase() === email) {
    throw new InvitationError("You cannot invite your own email.");
  }

  const spaces = await ownedSpaces(inviterUserId, spaceIds);
  const ids = spaces.map((space) => space._id);
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 24 * 60 * 60 * 1000);

  let invite = await TeamInvitation.findOne({
    inviterUserId,
    inviteeEmail: email,
    status: "pending",
    expiresAt: { $gt: new Date() },
  });

  if (invite) {
    const merged = new Map<string, (typeof ids)[number]>();
    [...invite.spaceIds, ...ids].forEach((id) => merged.set(String(id), id));
    invite.spaceIds = [...merged.values()];
    invite.expiresAt = expiresAt;
    await invite.save();
  } else {
    invite = await TeamInvitation.create({
      token: crypto.randomBytes(24).toString("hex"),
      inviterUserId,
      inviteeEmail: email,
      spaceIds: ids,
      status: "pending",
      expiresAt,
    });
  }

  const invitedSpaces = await CreateSpace.find({
    _id: { $in: invite.spaceIds },
    deletedAt: null,
  })
    .select("spacename")
    .lean();
  const spaceNames = invitedSpaces.map((space) => space.spacename || "Space");

  try {
    await sendInviteEmail({
      email,
      inviterName: inviter.name || inviter.email || "A KukuNotes user",
      spaceNames,
      token: invite.token,
    });
  } catch (error) {
    if (error instanceof MailConfigError || error instanceof MailDeliveryError) {
      throw new InvitationError(error.message, STATUS_CODE.INTERNAL_SERVER_ERROR);
    }
    throw error;
  }

  return presentInvite(invite);
};

export const listIncomingInvitations = async (userId: string) => {
  const user = await loadUser(userId);
  if (!user.email) {
    return [];
  }
  const invites = await TeamInvitation.find({
    inviteeEmail: user.email.toLowerCase(),
    status: "pending",
    expiresAt: { $gt: new Date() },
  })
    .sort({ createdAt: -1 })
    .lean();

  return Promise.all(invites.map((invite) => presentInvite(invite)));
};

export const listSentInvitations = async (userId: string) => {
  if (!userId) {
    return [];
  }
  const invites = await TeamInvitation.find({ inviterUserId: userId })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  return Promise.all(invites.map((invite) => presentInvite(invite)));
};

export const previewInvitation = async (token: string) => {
  const invite = await TeamInvitation.findOne({ token }).lean();
  if (!invite) {
    throw new InvitationError("This invitation link is not valid.", STATUS_CODE.NOT_FOUND);
  }
  return presentInvite(invite);
};

const loadInviteForActor = async (token: string, userId: string) => {
  const user = await loadUser(userId);
  if (!user.email) {
    throw new InvitationError(
      "This account has no email. Sign in with the invited email address to respond.",
    );
  }
  const invite = await TeamInvitation.findOne({ token });
  if (!invite) {
    throw new InvitationError("This invitation link is not valid.", STATUS_CODE.NOT_FOUND);
  }
  if (invite.inviteeEmail !== user.email.toLowerCase()) {
    throw new InvitationError(
      `This invitation was sent to ${invite.inviteeEmail}. Sign in with that email to respond.`,
      STATUS_CODE.FORBIDDEN,
    );
  }
  return { user, invite };
};

export const acceptInvitation = async (token: string, userId: string) => {
  const { invite } = await loadInviteForActor(token, userId);
  if (invite.status === "revoked") {
    throw new InvitationError("This invitation was revoked.");
  }
  if (invite.status === "accepted") {
    return { alreadyAccepted: true, invitation: await presentInvite(invite) };
  }
  if (invite.status === "rejected") {
    throw new InvitationError("This invitation was declined. Ask for a new one.");
  }
  if (isExpired(invite)) {
    throw new InvitationError("This invitation has expired.");
  }

  const claimed = await TeamInvitation.findOneAndUpdate(
    { _id: invite._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "accepted", acceptedAt: new Date() } },
    { new: true },
  );
  if (!claimed) {
    const latest = await TeamInvitation.findById(invite._id);
    if (latest?.status === "accepted") {
      return { alreadyAccepted: true, invitation: await presentInvite(latest) };
    }
    if (latest?.status === "revoked") {
      throw new InvitationError("This invitation was revoked.");
    }
    if (latest?.status === "rejected") {
      throw new InvitationError("This invitation was declined. Ask for a new one.");
    }
    throw new InvitationError("This invitation has expired.");
  }

  const fresh = await TeamInvitation.findById(claimed._id);
  if (!fresh || fresh.status !== "accepted") {
    throw new InvitationError("This invitation was revoked.");
  }

  const spaces = await CreateSpace.find({
    _id: { $in: fresh.spaceIds },
    userId: fresh.inviterUserId,
    deletedAt: null,
  })
    .select("_id")
    .lean();

  if (spaces.length === 0) {
    const reverted = await TeamInvitation.findOneAndUpdate(
      { _id: fresh._id, status: "accepted" },
      { $set: { status: "pending", acceptedAt: null } },
    );
    if (!reverted) {
      throw new InvitationError("This invitation was revoked.");
    }
    throw new InvitationError("Those spaces are no longer available.");
  }

  const liveIds = new Set(spaces.map((space) => String(space._id)));
  const missing = fresh.spaceIds.filter((id) => !liveIds.has(String(id)));
  if (missing.length > 0) {
    await TeamInvitation.updateOne(
      { _id: fresh._id, status: "accepted" },
      { $pull: { spaceIds: { $in: missing } } },
    );
  }

  await Promise.all(
    spaces.map((space) =>
      SpaceShare.updateOne(
        { spaceId: space._id, memberUserId: userId },
        {
          $set: {
            ownerUserId: fresh.inviterUserId,
            memberEmail: fresh.inviteeEmail,
            role: "viewer",
            status: "active",
          },
        },
        { upsert: true },
      ),
    ),
  );

  const after = await TeamInvitation.findById(fresh._id);
  if (!after || after.status !== "accepted") {
    await releaseSharedSpaces(
      String(fresh.inviterUserId),
      fresh.inviteeEmail,
      spaces.map((space) => String(space._id)),
    );
    throw new InvitationError("This invitation was revoked.");
  }

  const kept = new Set(after.spaceIds.map((id) => String(id)));
  const dropped = spaces.map((space) => String(space._id)).filter((id) => !kept.has(id));
  if (dropped.length > 0) {
    await releaseSharedSpaces(String(fresh.inviterUserId), fresh.inviteeEmail, dropped);
  }

  return { alreadyAccepted: false, invitation: await presentInvite(after) };
};

export const rejectInvitation = async (token: string, userId: string) => {
  const { invite } = await loadInviteForActor(token, userId);
  if (invite.status === "revoked") {
    throw new InvitationError("This invitation was revoked.");
  }
  if (invite.status === "accepted") {
    throw new InvitationError("This invitation was already accepted.");
  }
  if (invite.status === "rejected") {
    return { alreadyRejected: true, invitation: await presentInvite(invite) };
  }
  if (isExpired(invite)) {
    throw new InvitationError("This invitation has expired.");
  }

  const updated = await TeamInvitation.findOneAndUpdate(
    { _id: invite._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "rejected", rejectedAt: new Date() } },
    { new: true },
  );
  if (!updated) {
    const latest = await TeamInvitation.findById(invite._id);
    if (latest?.status === "rejected") {
      return { alreadyRejected: true, invitation: await presentInvite(latest) };
    }
    if (latest?.status === "revoked") {
      throw new InvitationError("This invitation was revoked.");
    }
    if (latest?.status === "accepted") {
      throw new InvitationError("This invitation was already accepted.");
    }
    throw new InvitationError("This invitation has expired.");
  }

  return { alreadyRejected: false, invitation: await presentInvite(updated) };
};

const requireOwnedInvite = async (inviterUserId: string, invitationId: string) => {
  if (!mongoose.isValidObjectId(inviterUserId) || !mongoose.isValidObjectId(invitationId)) {
    throw new InvitationError("This invitation was not found.", STATUS_CODE.NOT_FOUND);
  }
  const invite = await TeamInvitation.findOne({ _id: invitationId, inviterUserId });
  if (!invite) {
    throw new InvitationError("This invitation was not found.", STATUS_CODE.NOT_FOUND);
  }
  return invite;
};

const releaseSharedSpaces = async (inviterUserId: string, inviteeEmail: string, spaceIds: string[]) => {
  const unique = [...new Set(spaceIds.filter((id) => mongoose.isValidObjectId(id)))];
  if (unique.length === 0) {
    return;
  }

  const stillShared = await TeamInvitation.find({
    inviterUserId,
    inviteeEmail,
    status: "accepted",
    spaceIds: { $in: unique },
  })
    .select("spaceIds")
    .lean();

  const covered = new Set<string>();
  stillShared.forEach((item) => {
    item.spaceIds.forEach((id) => {
      const key = String(id);
      if (unique.includes(key)) {
        covered.add(key);
      }
    });
  });

  const toDrop = unique.filter((id) => !covered.has(id));
  if (toDrop.length === 0) {
    return;
  }

  const member = await User.findOne({ email: inviteeEmail }).select("_id").lean();
  if (!member) {
    return;
  }

  await SpaceShare.deleteMany({
    ownerUserId: inviterUserId,
    memberUserId: member._id,
    spaceId: { $in: toDrop },
  });
};

export const revokeInvitation = async (inviterUserId: string, invitationId: string) => {
  const invite = await requireOwnedInvite(inviterUserId, invitationId);
  if (invite.status === "revoked") {
    return { alreadyRevoked: true, invitation: await presentInvite(invite) };
  }
  if (invite.status === "rejected") {
    throw new InvitationError("This invitation was declined, so it cannot be revoked.");
  }

  const previousSpaceIds = invite.spaceIds.map((id) => String(id));
  const updated = await TeamInvitation.findOneAndUpdate(
    { _id: invite._id, inviterUserId, status: { $in: ["pending", "accepted"] } },
    { $set: { status: "revoked", revokedAt: new Date() } },
    { new: false },
  );
  if (!updated) {
    const latest = await TeamInvitation.findById(invite._id);
    if (latest?.status === "revoked") {
      return { alreadyRevoked: true, invitation: await presentInvite(latest) };
    }
    throw new InvitationError("This invitation can no longer be revoked.");
  }

  if (updated.status === "accepted") {
    await releaseSharedSpaces(inviterUserId, updated.inviteeEmail, previousSpaceIds);
  }

  const latest = await TeamInvitation.findById(invite._id);
  return { alreadyRevoked: false, invitation: await presentInvite(latest || updated) };
};

export const removeInvitationSpace = async (
  inviterUserId: string,
  invitationId: string,
  spaceIdRaw: unknown,
) => {
  const spaceId = typeof spaceIdRaw === "string" ? spaceIdRaw : "";
  if (!mongoose.isValidObjectId(spaceId)) {
    throw new InvitationError("Choose a space on this invitation.");
  }

  const invite = await requireOwnedInvite(inviterUserId, invitationId);
  if (invite.status === "revoked") {
    return { alreadyRevoked: true, removed: false, invitation: await presentInvite(invite) };
  }
  if (invite.status === "rejected") {
    throw new InvitationError("This invitation was declined, so its spaces cannot be changed.");
  }
  if (!invite.spaceIds.some((id) => String(id) === spaceId)) {
    throw new InvitationError("That space is not on this invitation.");
  }
  if (invite.spaceIds.length <= 1) {
    const revoked = await revokeInvitation(inviterUserId, invitationId);
    return { ...revoked, removed: true };
  }

  const spaceObjectId = new mongoose.Types.ObjectId(spaceId);
  const updated = await TeamInvitation.findOneAndUpdate(
    {
      _id: invite._id,
      inviterUserId,
      status: { $in: ["pending", "accepted"] },
      spaceIds: spaceObjectId,
    },
    { $pull: { spaceIds: spaceObjectId } },
    { new: true },
  );
  if (!updated) {
    const latest = await TeamInvitation.findById(invite._id);
    if (!latest) {
      throw new InvitationError("This invitation was not found.", STATUS_CODE.NOT_FOUND);
    }
    if (latest.status === "revoked") {
      return { alreadyRevoked: true, removed: false, invitation: await presentInvite(latest) };
    }
    if (!latest.spaceIds.some((id) => String(id) === spaceId)) {
      return { alreadyRevoked: false, removed: true, invitation: await presentInvite(latest) };
    }
    throw new InvitationError("That space could not be removed.");
  }

  if (updated.status === "accepted") {
    await releaseSharedSpaces(inviterUserId, updated.inviteeEmail, [spaceId]);
  }

  if (updated.spaceIds.length === 0) {
    await TeamInvitation.updateOne(
      { _id: updated._id, inviterUserId, status: { $in: ["pending", "accepted"] } },
      { $set: { status: "revoked", revokedAt: new Date() } },
    );
  }

  const latest = await TeamInvitation.findById(updated._id);
  return {
    alreadyRevoked: latest?.status === "revoked" && updated.spaceIds.length === 0,
    removed: true,
    invitation: await presentInvite(latest || updated),
  };
};

export const listTeamPeople = async (userId: string) => {
  if (!mongoose.isValidObjectId(userId)) {
    return [];
  }

  const [asMember, asOwner] = await Promise.all([
    SpaceShare.find({ memberUserId: userId, status: "active" }).lean(),
    SpaceShare.find({ ownerUserId: userId, status: "active" }).lean(),
  ]);

  const spaceIds = [...asMember, ...asOwner].map((share) => share.spaceId);
  const spaces = await CreateSpace.find({ _id: { $in: spaceIds }, deletedAt: null })
    .select("spacename")
    .lean();
  const spaceName = new Map(spaces.map((space) => [String(space._id), space.spacename || "Space"]));
  const liveIds = new Set(spaces.map((space) => String(space._id)));

  type Person = {
    id: string;
    name: string;
    email: string;
    permission: "Owner" | "Can view";
    spaceIds: string[];
    spaceNames: string[];
  };
  const people = new Map<string, Person>();

  const ensure = (id: string, permission: Person["permission"]) => {
    const current = people.get(id);
    if (current) {
      return current;
    }
    const created: Person = { id, name: "KukuNotes user", email: "", permission, spaceIds: [], spaceNames: [] };
    people.set(id, created);
    return created;
  };

  asMember.forEach((share) => {
    const spaceId = String(share.spaceId);
    if (!liveIds.has(spaceId)) {
      return;
    }
    const person = ensure(String(share.ownerUserId), "Owner");
    if (!person.spaceIds.includes(spaceId)) {
      person.spaceIds.push(spaceId);
      person.spaceNames.push(spaceName.get(spaceId) || "Space");
    }
  });

  asOwner.forEach((share) => {
    const spaceId = String(share.spaceId);
    if (!liveIds.has(spaceId)) {
      return;
    }
    const person = ensure(String(share.memberUserId), "Can view");
    if (!person.spaceIds.includes(spaceId)) {
      person.spaceIds.push(spaceId);
      person.spaceNames.push(spaceName.get(spaceId) || "Space");
    }
  });

  const users = await User.find({ _id: { $in: [...people.keys()] } }).select("name email").lean();
  users.forEach((user) => {
    const person = people.get(String(user._id));
    if (!person) {
      return;
    }
    person.name = user.name || user.email || person.name;
    person.email = user.email || "";
  });

  return [...people.values()];
};
