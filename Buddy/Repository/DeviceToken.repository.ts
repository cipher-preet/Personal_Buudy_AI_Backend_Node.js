import mongoose from "mongoose";
import { STATUS_CODE } from "../../Api/index.js";
import { DeviceToken } from "../Modals/DeviceToken.Modal.js";

const createIdFilter = (id: string) => {
  if (!mongoose.isValidObjectId(id)) {
    return id;
  }

  return {
    $in: [id, new mongoose.Types.ObjectId(id)],
  };
};

export const upsertDeviceTokenRepository = async (
  userId: string,
  token: string,
  platform: "android" | "ios" | "web",
) => {
  try {
    if (!mongoose.isValidObjectId(userId)) {
      return {
        status: STATUS_CODE.BAD_REQUEST,
        message: "Invalid user.",
      };
    }

    const saved = await DeviceToken.findOneAndUpdate(
      { token },
      {
        $set: {
          userId: new mongoose.Types.ObjectId(userId),
          token,
          platform,
        },
      },
      { upsert: true, new: true },
    );

    return {
      status: STATUS_CODE.OK,
      message: "Device token registered.",
      data: {
        tokenId: String(saved._id),
        platform: saved.platform,
      },
    };
  } catch (error) {
    console.log("error in DeviceToken repository Layer ", error);
    throw error;
  }
};

export const deleteDeviceTokenRepository = async (
  userId: string,
  token: string,
) => {
  try {
    const deleted = await DeviceToken.findOneAndDelete({
      token,
      userId: createIdFilter(userId),
    });

    if (!deleted) {
      return {
        status: STATUS_CODE.NOT_FOUND,
        message: "Device token not found.",
      };
    }

    return {
      status: STATUS_CODE.OK,
      message: "Device token removed.",
      data: {
        tokenId: String(deleted._id),
      },
    };
  } catch (error) {
    console.log("error in DeviceToken repository Layer ", error);
    throw error;
  }
};

const DEVICE_TOKEN_BODY_KEYS = ["fcmToken", "deviceToken", "fcm_token"] as const;
const PLATFORMS = new Set(["android", "ios", "web"]);

export const saveOptionalAuthDeviceToken = async (
  userId: string,
  body: Record<string, unknown> | undefined,
) => {
  if (!userId || !body) {
    return;
  }

  let token = "";
  for (const key of DEVICE_TOKEN_BODY_KEYS) {
    const value = body[key];
    if (typeof value === "string" && value.trim()) {
      token = value.trim();
      break;
    }
  }

  if (!token || token.length < 8 || token.length > 4096) {
    return;
  }

  const platformRaw =
    typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "android";
  const platform = PLATFORMS.has(platformRaw)
    ? (platformRaw as "android" | "ios" | "web")
    : "android";

  try {
    await upsertDeviceTokenRepository(userId, token, platform);
  } catch (error) {
    console.log("optional auth device token save failed", error);
  }
};
