import { STATUS_CODE } from "../../Api/index.js";
import DocumentTemplate from "../Modals/DocumentTemplate.modal.js";

type SeedTemplate = {
  code: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  scopes: Array<{ label: string; detail: string }>;
  exampleSections: Array<{
    heading: string;
    body?: string;
    bullets?: string[];
  }>;
  showNewBadge?: boolean;
  sortOrder: number;
};

/** Catalog seed — keep in sync with Document-it gallery cards. */
const defaultDocumentTemplates: SeedTemplate[] = [
  {
    code: "meeting-recap",
    title: "Meeting Recap",
    tagline: "Turn transcripts into clear summaries, decisions, and owned action items.",
    description:
      "Scan the selected meeting or transcript and draft a clean recap with summary, decisions, discussion points, owners, and deadlines ready to share.",
    features: [
      "Capture key decisions with owners",
      "Extract action items and deadlines",
      "Keep discussion points short and clear",
      "Highlight blockers called out in the meeting",
      "Format a shareable recap in one pass",
    ],
    scopes: [
      { label: "Meeting", detail: "Use a recorded meeting or transcript" },
      { label: "Notes", detail: "Pull supporting notes from the space" },
      { label: "Full Space", detail: "Include recent related context" },
    ],
    showNewBadge: true,
    sortOrder: 1,
    exampleSections: [
      {
        heading: "Summary",
        body: "Reviewed attendance rules and agreed Flexible Shift for the next release.",
      },
      {
        heading: "Action items",
        bullets: [
          "Finalize grace-period flow — Preet · Fri",
          "Fix Shift Edit placement — Design · Tue",
        ],
      },
    ],
  },
  {
    code: "meeting-prep",
    title: "Meeting Prep",
    tagline: "Build a focused agenda from previous decisions, open tasks, and risks.",
    description:
      "Pull previous meetings and notes to prepare agenda items, pending tasks, questions to ask, and risks before the next sync.",
    features: [
      "Assemble agenda from prior meetings",
      "Surface unresolved decisions",
      "List pending tasks and owners",
      "Suggest questions to ask",
      "Call out risks before the meeting",
    ],
    scopes: [
      { label: "Previous meetings", detail: "Use recent meeting history" },
      { label: "Notes", detail: "Include linked notes and follow-ups" },
      { label: "Tasks", detail: "Bring open tasks into prep" },
    ],
    sortOrder: 2,
    exampleSections: [
      {
        heading: "Agenda",
        body: "Align on attendance status, leave limits, and overtime rules before kickoff.",
      },
      {
        heading: "Open questions",
        bullets: [
          "Who owns suspension policy decisions?",
          "What is demo scope for Thursday?",
        ],
      },
    ],
  },
  {
    code: "weekly-task-planner",
    title: "Weekly Task Planner",
    tagline: "Organize this week's work by priority, owner, deadline, and status.",
    description:
      "Combine tasks and notes into a weekly plan grouped by priority with clear owners, deadlines, and status for the whole team.",
    features: [
      "Group tasks by priority",
      "Show owner and deadline together",
      "Flag overdue and blocked work",
      "Balance load across the week",
      "Keep status easy to scan",
    ],
    scopes: [
      { label: "Tasks", detail: "Use open and upcoming tasks" },
      { label: "Notes", detail: "Add context from weekly notes" },
      { label: "Full Space", detail: "Plan across the whole space" },
    ],
    showNewBadge: true,
    sortOrder: 3,
    exampleSections: [
      {
        heading: "This week",
        body: "Priorities for Product and Engineering across the Buddy workspace.",
      },
      {
        heading: "By priority",
        bullets: [
          "High · Ship Document templates",
          "Medium · Polish Mindmap nodes",
        ],
      },
    ],
  },
  {
    code: "weekly-review",
    title: "Weekly Review",
    tagline: "Reflect on completed work, blockers, decisions, and next-week priorities.",
    description:
      "Review the week's meetings and tasks to summarize what shipped, what is pending, blockers, key decisions, and next-week focus.",
    features: [
      "Summarize completed work",
      "List pending and blocked items",
      "Capture important decisions",
      "Set next-week priorities",
      "Keep the review concise and shareable",
    ],
    scopes: [
      { label: "Week meetings", detail: "Use this week's meeting notes" },
      { label: "Tasks", detail: "Include completed and open tasks" },
      { label: "Full Space", detail: "Pull broader weekly context" },
    ],
    sortOrder: 4,
    exampleSections: [
      {
        heading: "Completed",
        body: "Mindmap canvas, home date groups, and full note content shipped.",
      },
      {
        heading: "Next week",
        bullets: [
          "Wire template to document flow",
          "Start Achieve Goal first screen",
        ],
      },
    ],
  },
  {
    code: "one-on-one-prep",
    title: "1:1 Meeting Prep",
    tagline: "Prepare 1:1s with commitments, wins, blockers, and questions.",
    description:
      "Use previous 1:1 history to surface commitments, unresolved topics, achievements, blockers, and discussion questions.",
    features: [
      "Track previous commitments",
      "Highlight unresolved topics",
      "Celebrate recent achievements",
      "Surface blockers early",
      "Suggest useful questions",
    ],
    scopes: [
      { label: "Previous 1:1s", detail: "Use prior 1:1 notes and actions" },
      { label: "Tasks", detail: "Include personal open tasks" },
      { label: "Notes", detail: "Bring related personal notes" },
    ],
    sortOrder: 5,
    exampleSections: [
      {
        heading: "Commitments",
        body: "Carry forward last week's agreements and check progress together.",
      },
      {
        heading: "Discuss",
        bullets: [
          "Bandwidth for Achieve Goal phase",
          "Need Design support for templates",
        ],
      },
    ],
  },
  {
    code: "project-status",
    title: "Project Status Report",
    tagline: "Report progress, milestones, risks, and next steps for a project space.",
    description:
      "Generate a project status report from the space with progress, milestones, completed work, pending items, blockers, risks, and next steps.",
    features: [
      "Summarize progress and milestones",
      "Separate completed and pending work",
      "Call out blockers and risks",
      "Recommend clear next steps",
      "Keep stakeholders aligned",
    ],
    scopes: [
      { label: "Project Space", detail: "Use the selected project space" },
      { label: "Meetings", detail: "Include recent project meetings" },
      { label: "Tasks", detail: "Reflect task completion status" },
    ],
    showNewBadge: true,
    sortOrder: 6,
    exampleSections: [
      {
        heading: "Progress",
        body: "Phase 2 UI is live for Mindmap and Document template gallery.",
      },
      {
        heading: "Risks",
        bullets: [
          "Large spaces may slow note fetch",
          "Generated document API still pending",
        ],
      },
    ],
  },
  {
    code: "client-meeting-recap",
    title: "Client Meeting Recap",
    tagline: "Capture requirements, decisions, commitments, and follow-ups from client calls.",
    description:
      "Turn a client call into a structured recap with requirements, decisions, commitments, deliverables, and follow-ups.",
    features: [
      "Extract client requirements",
      "Log decisions and commitments",
      "Track deliverables clearly",
      "Create follow-up actions",
      "Keep a client-ready tone",
    ],
    scopes: [
      { label: "Client call", detail: "Use the selected client meeting" },
      { label: "Notes", detail: "Include supporting client notes" },
      { label: "Tasks", detail: "Link follow-up tasks" },
    ],
    sortOrder: 7,
    exampleSections: [
      {
        heading: "Requirements",
        body: "Acme needs flexible shift windows and clearer leave limit messaging.",
      },
      {
        heading: "Follow-ups",
        bullets: [
          "Send revised proposal by Wednesday",
          "Schedule Thursday product demo",
        ],
      },
    ],
  },
  {
    code: "daily-work-plan",
    title: "Daily Work Plan",
    tagline: "Plan today around priorities, meetings, overdue tasks, and focus blocks.",
    description:
      "Build a daily plan from tasks and previous notes covering priorities, meetings, overdue items, follow-ups, and focus work.",
    features: [
      "Rank today's priorities",
      "Surface overdue follow-ups",
      "Place meetings on the plan",
      "Protect deep-focus blocks",
      "Keep the day realistic",
    ],
    scopes: [
      { label: "Tasks", detail: "Use today's open and overdue tasks" },
      { label: "Notes", detail: "Include yesterday's carryovers" },
      { label: "Calendar", detail: "Account for scheduled meetings" },
    ],
    sortOrder: 8,
    exampleSections: [
      {
        heading: "Priorities",
        body: "Focus blocks for today across product polish and release prep.",
      },
      {
        heading: "Schedule",
        bullets: [
          "3:30 Design review for Document UI",
          "5:00 Standup wrap-up and blockers",
        ],
      },
    ],
  },
  {
    code: "decision-log",
    title: "Decision Log",
    tagline: "Record decisions, reasons, alternatives, owners, and sources.",
    description:
      "Create a durable decision log from meetings and documents with the decision, reason, alternatives discussed, owner, date, and supporting source.",
    features: [
      "Capture the decision clearly",
      "Document why it was chosen",
      "List alternatives considered",
      "Assign an owner and date",
      "Link supporting sources",
    ],
    scopes: [
      { label: "Meetings", detail: "Use decision moments from meetings" },
      { label: "Documents", detail: "Include supporting documents" },
      { label: "Full Space", detail: "Search related space context" },
    ],
    sortOrder: 9,
    exampleSections: [
      {
        heading: "Decision",
        body: "Home notes and tasks show full content with date separators.",
      },
      {
        heading: "Why",
        bullets: [
          "Users need complete context at a glance",
          "Show more created friction in daily use",
        ],
      },
    ],
  },
  {
    code: "action-item-tracker",
    title: "Action Item Tracker",
    tagline: "Track tasks, owners, deadlines, status, and originating meetings.",
    description:
      "Consolidate action items across meetings into one tracker with task, owner, deadline, status, originating meeting, and supporting evidence.",
    features: [
      "Collect actions across meetings",
      "Keep owners and deadlines visible",
      "Track status in one place",
      "Link the originating meeting",
      "Attach supporting evidence",
    ],
    scopes: [
      { label: "Multiple meetings", detail: "Pull actions from several meetings" },
      { label: "Tasks", detail: "Sync with existing task status" },
      { label: "Full Space", detail: "Include all related follow-ups" },
    ],
    showNewBadge: true,
    sortOrder: 10,
    exampleSections: [
      {
        heading: "Open actions",
        body: "Tracked commitments across this week's meetings and owners.",
      },
      {
        heading: "Due soon",
        bullets: [
          "Implement shift types · Mira · Fri",
          "Leave continuity rule · Ops · Mon",
        ],
      },
    ],
  },
];

let seedPromise: Promise<void> | null = null;

const TEMPLATE_LIST_PROJECTION = {
  _id: 0,
  code: 1,
  title: 1,
  tagline: 1,
  description: 1,
  features: 1,
  scopes: 1,
  exampleSections: 1,
  showNewBadge: 1,
  sortOrder: 1,
} as const;

const mapTemplateForClient = (template: {
  code: string;
  title: string;
  tagline: string;
  description: string;
  features: string[];
  scopes: Array<{ label: string; detail: string }>;
  exampleSections: Array<{
    heading: string;
    body?: string;
    bullets?: string[];
  }>;
  showNewBadge?: boolean;
}) => ({
  id: template.code,
  title: template.title,
  tagline: template.tagline,
  description: template.description,
  features: template.features ?? [],
  scopes: template.scopes ?? [],
  exampleSections: template.exampleSections ?? [],
  ...(template.showNewBadge ? { isNew: true } : {}),
});

/**
 * Idempotent upsert of the catalog. Guaranteed single-flight so concurrent
 * list requests during cold start don't stampede Mongo.
 */
export const seedDefaultDocumentTemplates = async () => {
  if (!seedPromise) {
    seedPromise = Promise.all(
      defaultDocumentTemplates.map(template =>
        DocumentTemplate.updateOne(
          { code: template.code },
          {
            $set: {
              ...template,
              showNewBadge: Boolean(template.showNewBadge),
              isActive: true,
            },
          },
          { upsert: true },
        ),
      ),
    )
      .then(() => undefined)
      .catch(error => {
        seedPromise = null;
        throw error;
      });
  }

  await seedPromise;
};

export const getDocumentTemplatesService = async () => {
  // Prefer indexed active+sort query; seed only if the catalog is empty.
  let templates = await DocumentTemplate.find({ isActive: true })
    .select(TEMPLATE_LIST_PROJECTION)
    .sort({ sortOrder: 1 })
    .lean()
    .exec();

  if (templates.length === 0) {
    await seedDefaultDocumentTemplates();
    templates = await DocumentTemplate.find({ isActive: true })
      .select(TEMPLATE_LIST_PROJECTION)
      .sort({ sortOrder: 1 })
      .lean()
      .exec();
  }

  return {
    status: STATUS_CODE.OK,
    data: {
      templates: templates.map(mapTemplateForClient),
    },
  };
};

export const getDocumentTemplateByCodeService = async (code: string) => {
  const normalized = String(code || "")
    .trim()
    .toLowerCase();

  if (!normalized) {
    return {
      status: STATUS_CODE.BAD_REQUEST,
      message: "Template id is required.",
    };
  }

  let template = await DocumentTemplate.findOne({
    code: normalized,
    isActive: true,
  })
    .select(TEMPLATE_LIST_PROJECTION)
    .lean()
    .exec();

  if (!template) {
    await seedDefaultDocumentTemplates();
    template = await DocumentTemplate.findOne({
      code: normalized,
      isActive: true,
    })
      .select(TEMPLATE_LIST_PROJECTION)
      .lean()
      .exec();
  }

  if (!template) {
    return {
      status: STATUS_CODE.NOT_FOUND,
      message: "Document template not found.",
    };
  }

  return {
    status: STATUS_CODE.OK,
    data: {
      template: mapTemplateForClient(template),
    },
  };
};
