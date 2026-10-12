export type MilestoneInput = {
  title?: string;
  successCriteria?: string[];
  dueLabel?: string;
  dependencies?: string[];
};

export type EvidenceInput = {
  _id?: unknown;
  category?: string;
  verification?: string;
  text?: string;
  milestoneTitle?: string;
  sourceType?: string;
  sourceId?: string;
  createdAt?: Date | string;
};

export const COUNTED = new Set(["SOURCE_SUPPORTED", "USER_CONFIRMED", "SYSTEM_VERIFIED"]);

export const numericProgress = (
  actual: number | null,
  baseline: number | null,
  target: number | null,
  direction: string,
) => {
  if (actual == null || baseline == null || target == null) return null;
  const increase = direction !== "DECREASE";
  const gap = increase ? target - baseline : baseline - target;
  if (!Number.isFinite(gap) || gap === 0) return null;
  const moved = increase ? actual - baseline : baseline - actual;
  return Math.max(0, Math.min(100, Math.round((moved / gap) * 100)));
};

const related = (milestoneTitle: string, evidence: EvidenceInput[]) =>
  evidence.filter((item) => {
    const title = (item.milestoneTitle || "").trim().toLowerCase();
    const text = (item.text || "").toLowerCase();
    const key = milestoneTitle.trim().toLowerCase();
    return title === key || (key.length > 0 && text.includes(key));
  });

export const milestoneStates = (milestones: MilestoneInput[], evidence: EvidenceInput[]) =>
  milestones.map((milestone) => {
    const title = milestone.title || "Milestone";
    const rows = related(title, evidence).filter((item) => item.verification !== "RETRACTED");
    const blocked = rows.some((item) => item.category === "BLOCKER" && COUNTED.has(item.verification || ""));
    const done =
      !blocked &&
      rows.some((item) => item.category === "OUTPUT" && COUNTED.has(item.verification || ""));
    return {
      title,
      dueLabel: milestone.dueLabel || "",
      successCriteria: milestone.successCriteria || [],
      dependencies: milestone.dependencies || [],
      status: done ? "DONE" : blocked ? "BLOCKED" : "PENDING",
      evidenceIds: rows.map((item) => String(item._id || "")).filter(Boolean),
    };
  });

export const healthFor = (input: {
  outcomeProgress: number | null;
  blocked: boolean;
  doneCount: number;
  total: number;
  outcomeConfirmed?: boolean;
}) => {
  if (input.outcomeConfirmed) return "ACHIEVED";
  if (input.blocked) return "BLOCKED";
  if (input.total > 0 && input.doneCount >= input.total) return "ON_TRACK";
  if (input.outcomeProgress != null && input.outcomeProgress >= 100) return "ON_TRACK";
  if (input.outcomeProgress == null) return "INSUFFICIENT_DATA";
  if (input.total > 0 && input.doneCount * 2 < input.total) return "AT_RISK";
  return "ON_TRACK";
};
