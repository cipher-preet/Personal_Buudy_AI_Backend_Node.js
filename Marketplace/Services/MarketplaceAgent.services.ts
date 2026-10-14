import { STATUS_CODE } from "../../Api/index.js";
import MarketplaceAgent, {
  type MarketplaceAgentTone,
  type MarketplaceInstallTier,
} from "../Modals/MarketplaceAgent.modal.js";

type SeedAgent = {
  code: string;
  title: string;
  description: string;
  author: string;
  installs: string;
  tone: MarketplaceAgentTone;
  icon: string;
  installTier: MarketplaceInstallTier;
  sortOrder: number;
};

/** Featured marketplace catalog — keep in sync with desktop Hire Agent list. */
const defaultMarketplaceAgents: SeedAgent[] = [
  {
    code: "competitor-analysis",
    title: "Competitor Analysis",
    description:
      "Tracks competitor moves, pricing shifts, and messaging so you can spot gaps and respond faster.",
    author: "Kuku Labs",
    installs: "1.2K",
    tone: "navy",
    icon: "pie-chart",
    installTier: "pro",
    sortOrder: 1,
  },
  {
    code: "instagram-automation",
    title: "Instagram Automation",
    description:
      "Drafts captions, schedules posts, and suggests reply angles so your Instagram stays consistent.",
    author: "Kuku Labs",
    installs: "2.8K",
    tone: "purple",
    icon: "zap",
    installTier: "pro",
    sortOrder: 2,
  },
  {
    code: "linkedin-automation",
    title: "LinkedIn Automation",
    description:
      "Writes LinkedIn posts, comment starters, and outreach drafts tailored to your audience.",
    author: "Kuku Labs",
    installs: "3.1K",
    tone: "blue",
    icon: "users",
    installTier: "pro",
    sortOrder: 3,
  },
  {
    code: "hiring-screener",
    title: "Hiring Screener",
    description:
      "Reviews resumes against the role, writes a short scorecard, and suggests interview questions.",
    author: "Camille Dubois",
    installs: "533",
    tone: "red",
    icon: "users",
    installTier: "business",
    sortOrder: 4,
  },
  {
    code: "product-recommendation",
    title: "Product Recommendation Agent",
    description:
      "Guides shoppers to the right product based on needs, budget, and past conversation context.",
    author: "Alex Rivera",
    installs: "2.4K",
    tone: "orange",
    icon: "target",
    installTier: "business",
    sortOrder: 5,
  },
  {
    code: "weekly-ops-reporter",
    title: "Weekly Ops Reporter",
    description:
      "Pulls goals, meetings, and open tasks into a Friday report your leadership team can scan in minutes.",
    author: "Taylor Nguyen",
    installs: "1.9K",
    tone: "purple",
    icon: "clipboard",
    installTier: "business",
    sortOrder: 6,
  },
  {
    code: "context-planner",
    title: "Context Planner",
    description:
      "Builds a shared context pack from notes, meetings, and goals before your next planning session.",
    author: "Kuku Labs",
    installs: "876",
    tone: "teal",
    icon: "layers",
    installTier: "pro",
    sortOrder: 7,
  },
  {
    code: "time-management-strategies",
    title: "Time Management Strategies",
    description:
      "Turns your calendar and task load into a realistic weekly plan with focus blocks and buffers.",
    author: "Kuku Labs",
    installs: "1.5K",
    tone: "green",
    icon: "calendar",
    installTier: "pro",
    sortOrder: 8,
  },
  {
    code: "email-automation",
    title: "Email Automation",
    description:
      "Drafts follow-ups, triages inboxes, and keeps reply sequences moving without the busywork.",
    author: "Kuku Labs",
    installs: "2.2K",
    tone: "blue",
    icon: "mail",
    installTier: "pro",
    sortOrder: 9,
  },
  {
    code: "startup-coo",
    title: "Startup COO",
    description:
      "Keeps ops, hiring, and priorities aligned so founders stay focused on the work that matters.",
    author: "Kuku Labs",
    installs: "1.1K",
    tone: "navy",
    icon: "briefcase",
    installTier: "business",
    sortOrder: 10,
  },
  {
    code: "project-manager",
    title: "Project Manager",
    description:
      "Breaks goals into milestones, tracks owners, and flags blockers before deadlines slip.",
    author: "Kuku Labs",
    installs: "2.6K",
    tone: "teal",
    icon: "check-square",
    installTier: "pro",
    sortOrder: 11,
  },
  {
    code: "personal-brand-context-strategies",
    title: "Personal Brand Context Strategies",
    description:
      "Shapes your voice, content pillars, and posting cadence from your real work and wins.",
    author: "Kuku Labs",
    installs: "940",
    tone: "orange",
    icon: "sparkles",
    installTier: "pro",
    sortOrder: 12,
  },
  {
    code: "linkedin-contact-brain",
    title: "LinkedIn Contact Brain",
    description:
      "Remembers who you met, why they matter, and what to say next in your LinkedIn network.",
    author: "Kuku Labs",
    installs: "1.3K",
    tone: "blue",
    icon: "message",
    installTier: "pro",
    sortOrder: 13,
  },
  {
    code: "ocr-scanner",
    title: "OCR Scanner",
    description:
      "Extracts text from screenshots and scans, then turns it into searchable notes you can act on.",
    author: "Kuku Labs",
    installs: "718",
    tone: "red",
    icon: "scan",
    installTier: "pro",
    sortOrder: 14,
  },
  {
    code: "morning-briefing",
    title: "Morning Briefing",
    description:
      "Summarizes today’s meetings, priorities, and open loops into a one-page morning brief.",
    author: "Noah Patel",
    installs: "1.7K",
    tone: "purple",
    icon: "sun",
    installTier: "pro",
    sortOrder: 15,
  },
  {
    code: "follow-up-reminder",
    title: "Follow Up Reminder Agent",
    description:
      "Tracks promises from meetings and drafts timely reminders so nothing falls through the cracks.",
    author: "Kuku Labs",
    installs: "1.4K",
    tone: "orange",
    icon: "bell",
    installTier: "pro",
    sortOrder: 16,
  },
  {
    code: "help-to-build-brand",
    title: "Help to Build Brand",
    description:
      "Helps you define positioning, proof points, and content ideas that make your brand clearer.",
    author: "Kuku Labs",
    installs: "652",
    tone: "green",
    icon: "target",
    installTier: "pro",
    sortOrder: 17,
  },
  {
    code: "entrepreneur-agent",
    title: "Entrepreneur Agent",
    description:
      "A founder co-pilot for decisions, weekly priorities, and the next move when everything feels urgent.",
    author: "Kuku Labs",
    installs: "2.0K",
    tone: "navy",
    icon: "activity",
    installTier: "business",
    sortOrder: 18,
  },
];

const AGENT_LIST_PROJECTION =
  "code title description author installs tone icon installTier sortOrder -_id";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 50;

/** Flip to true when hire flow is ready for users. */
const MARKETPLACE_HIRE_ENABLED = false;

let seedPromise: Promise<void> | null = null;

const mapAgentForClient = (agent: {
  code?: string | null;
  title?: string | null;
  description?: string | null;
  author?: string | null;
  installs?: string | null;
  tone?: string | null;
  icon?: string | null;
  installTier?: string | null;
}) => ({
  id: String(agent.code || "").trim(),
  title: String(agent.title || "").trim(),
  description: String(agent.description || "").trim(),
  author: String(agent.author || "Kuku Labs").trim(),
  installs: String(agent.installs || "0").trim(),
  tone: String(agent.tone || "blue").trim(),
  icon: String(agent.icon || "sparkles").trim(),
  installTier: String(agent.installTier || "pro").trim(),
  hireEnabled: MARKETPLACE_HIRE_ENABLED,
});

const clampLimit = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return DEFAULT_LIMIT;
  }
  return Math.min(Math.floor(parsed), MAX_LIMIT);
};

const clampPage = (value: unknown) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 1;
  }
  return Math.floor(parsed);
};

/**
 * Upserts the featured catalog and deactivates any agents no longer in the seed list.
 */
export const seedDefaultMarketplaceAgents = async () => {
  if (!seedPromise) {
    const activeCodes = defaultMarketplaceAgents.map((agent) => agent.code);

    seedPromise = Promise.all([
      ...defaultMarketplaceAgents.map((agent) =>
        MarketplaceAgent.updateOne(
          { code: agent.code },
          {
            $set: {
              ...agent,
              isActive: true,
            },
          },
          { upsert: true },
        ),
      ),
      MarketplaceAgent.updateMany(
        { code: { $nin: activeCodes } },
        { $set: { isActive: false } },
      ),
    ])
      .then(() => undefined)
      .catch((error) => {
        seedPromise = null;
        throw error;
      });
  }

  await seedPromise;
};

const ensureCatalogSeeded = async () => {
  const expected = defaultMarketplaceAgents.length;
  const activeCount = await MarketplaceAgent.countDocuments({ isActive: true }).exec();

  // Seed when empty or when the featured set changed (add/remove agents).
  if (activeCount !== expected) {
    await seedDefaultMarketplaceAgents();
  }
};

export const getMarketplaceAgentsService = async (query: {
  page?: unknown;
  limit?: unknown;
}) => {
  await ensureCatalogSeeded();

  const page = clampPage(query.page);
  const limit = clampLimit(query.limit);
  const skip = (page - 1) * limit;
  const filter = { isActive: true };

  const [total, agents] = await Promise.all([
    MarketplaceAgent.countDocuments(filter).exec(),
    MarketplaceAgent.find(filter)
      .select(AGENT_LIST_PROJECTION)
      .sort({ sortOrder: 1 })
      .skip(skip)
      .limit(limit)
      .lean()
      .exec(),
  ]);

  const totalPages = total === 0 ? 0 : Math.ceil(total / limit);

  return {
    status: STATUS_CODE.OK,
    data: {
      agents: agents.map(mapAgentForClient),
      page,
      limit,
      total,
      totalPages,
      hasMore: page < totalPages,
      hireEnabled: MARKETPLACE_HIRE_ENABLED,
    },
  };
};

export const getMarketplaceAgentByCodeService = async (code: string) => {
  const normalized = String(code || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Agent id is required.",
    };
  }

  await ensureCatalogSeeded();

  let agent = await MarketplaceAgent.findOne({
    code: normalized,
    isActive: true,
  })
    .select(AGENT_LIST_PROJECTION)
    .lean()
    .exec();

  if (!agent) {
    await seedDefaultMarketplaceAgents();
    agent = await MarketplaceAgent.findOne({
      code: normalized,
      isActive: true,
    })
      .select(AGENT_LIST_PROJECTION)
      .lean()
      .exec();
  }

  if (!agent) {
    return {
      status: STATUS_CODE.NOT_FOUND,
      message: "Marketplace agent not found.",
    };
  }

  return {
    status: STATUS_CODE.OK,
    data: {
      agent: mapAgentForClient(agent),
    },
  };
};
