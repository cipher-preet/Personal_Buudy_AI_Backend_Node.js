import { createZohoEmailAdapter, readZohoMailConfig } from "./zohoEmailAdapter.js";
import type { EmailAdapter } from "./types.js";

let adapter: EmailAdapter | null = null;

/** Shared sender for any feature that needs to email someone. */
export const getEmailAdapter = (): EmailAdapter => {
  if (!adapter) {
    adapter = createZohoEmailAdapter(readZohoMailConfig());
  }
  return adapter;
};
