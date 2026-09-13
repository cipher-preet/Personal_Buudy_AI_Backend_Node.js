import type { DeliveryType } from "./constants.js";

/** Resolve schedule delivery. Notification-only is no longer supported. */
export const deliveryTypeFromFlags = (flags: {
  aiCalling: boolean;
  beeping: boolean;
  notification?: boolean;
}): DeliveryType | null => {
  if (flags.aiCalling) {
    return "AI_CALL";
  }
  if (flags.beeping) {
    return "ALARM_NOTIFICATION";
  }
  // Legacy: old rows with only notification:true deliver as alarm.
  if (flags.notification) {
    return "ALARM_NOTIFICATION";
  }
  return null;
};

/** Coerce write payload onto supported delivery channels. */
export const normalizeDeliveryFlags = (flags: {
  aiCalling: boolean;
  beeping: boolean;
  notification?: boolean;
}) => {
  const aiCalling = Boolean(flags.aiCalling);
  let beeping = Boolean(flags.beeping);
  // Drop notification; migrate notification-only to alarm sound.
  if (!aiCalling && !beeping && flags.notification) {
    beeping = true;
  }
  if (!aiCalling && !beeping) {
    beeping = true;
  }
  return {
    aiCalling,
    beeping,
    notification: false as const,
  };
};
