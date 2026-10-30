import mongoose from "mongoose";

import { CreateSpace } from "../Buddy/Modals/Home.Modal.js";
import { SpaceShare } from "./Modals/SpaceShare.modal.js";

const idFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }
  return { $in: [id, new mongoose.Types.ObjectId(id)] };
};

export type SpaceAccess = {
  ownerUserId: string;
  role: "owner" | "viewer";
};

export const resolveSpaceAccess = async (
  viewerId: string,
  spaceId: string,
): Promise<SpaceAccess | null> => {
  if (!mongoose.isValidObjectId(viewerId) || !mongoose.isValidObjectId(spaceId)) {
    return null;
  }

  const owned = await CreateSpace.findOne({
    _id: spaceId,
    userId: idFilter(viewerId),
    deletedAt: null,
  })
    .select("_id userId")
    .lean();

  if (owned) {
    return { ownerUserId: String(owned.userId), role: "owner" };
  }

  const share = await SpaceShare.findOne({
    spaceId,
    memberUserId: viewerId,
    status: "active",
  })
    .select("ownerUserId")
    .lean();

  if (!share) {
    return null;
  }

  const space = await CreateSpace.exists({ _id: spaceId, deletedAt: null });
  if (!space) {
    return null;
  }

  return { ownerUserId: String(share.ownerUserId), role: "viewer" };
};

export const listActiveSharesForMember = async (memberUserId: string) => {
  if (!mongoose.isValidObjectId(memberUserId)) {
    return [];
  }
  return SpaceShare.find({ memberUserId, status: "active" }).lean();
};
