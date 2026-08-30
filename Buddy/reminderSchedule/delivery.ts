import type { DeliveryType } from "./constants.js";

export const deliveryTypeFromFlags = (flags: {
  aiCalling: boolean;
  beeping: boolean;
  notification: boolean;
}): DeliveryType | null => {
  if (flags.aiCalling) {
    return "AI_CALL";
  }
  if (flags.beeping) {
    return "ALARM_NOTIFICATION";
  }
  if (flags.notification) {
    return "NORMAL_NOTIFICATION";
  }
  return null;
};
