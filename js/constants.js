/* =========================================================
   JALACHAYA - Shared constants
   These values should match the Java enums in the Spring Boot
   backend (Role, ProblemCategory, Priority, WorkflowStatus).
   ========================================================= */

const ROLES = {
  CITIZEN: 'COMMUNITY_MEMBER',
  OFFICER: 'PANCHAYAT_OFFICER',
  WORKER: 'FIELD_WORKER'
};

const ROLE_LABELS = {
  COMMUNITY_MEMBER: 'Citizen',
  PANCHAYAT_OFFICER: 'Panchayat officer',
  FIELD_WORKER: 'Field worker'
};

// Dashboard page for each role (relative to the project root)
const ROLE_HOME = {
  COMMUNITY_MEMBER: 'citizen/dashboard.html',
  PANCHAYAT_OFFICER: 'panchayat/dashboard.html',
  FIELD_WORKER: 'worker/dashboard.html'
};

const CATEGORIES = {
  PLASTIC_WASTE: 'Plastic / solid waste',
  SEWAGE_DISCHARGE: 'Sewage or drain discharge',
  ALGAE_WEED: 'Algae / weed overgrowth',
  DEAD_FISH: 'Dead fish',
  FOUL_SMELL: 'Foul smell / discolouration',
  BANK_DUMPING: 'Dumping or encroachment on banks',
  STAGNANT_WATER: 'Stagnant water',
  OTHER: 'Other'
};

const PRIORITIES = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
  URGENT: 'Urgent'
};

// Complaint workflow statuses
const STATUS_LABELS = {
  SUBMITTED: 'Submitted',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  COMPLETION_CLAIMED: 'Work submitted',
  COMMUNITY_VERIFICATION: 'Community verification',
  VERIFIED: 'Verified',
  REOPENED: 'Reopened',
  REJECTED: 'Rejected'
};

// The normal "happy path" order, used by the progress stepper
const STATUS_FLOW = [
  'SUBMITTED',
  'ASSIGNED',
  'IN_PROGRESS',
  'COMPLETION_CLAIMED',
  'COMMUNITY_VERIFICATION',
  'VERIFIED'
];

// Statuses where a field worker is still expected to act
const ACTIVE_WORK_STATUSES = ['ASSIGNED', 'IN_PROGRESS'];

// Who an overdue task is escalated to, by level
const ESCALATION_LEVELS = {
  1: 'Ward member',
  2: 'Panchayat President',
  3: 'Block Development Officer'
};
const MAX_ESCALATION_LEVEL = 3;

/* ---------- Pond Recovery Index (prototype) ----------
   PRI = sum(weight x completion) / sum(weight)
   weight     = complaint priority
   completion = how far the complaint has moved in the workflow
   These are configurable prototype assumptions. In the full system
   the Spring Boot backend calculates this value. */
const RECOVERY_WEIGHTS = { LOW: 1, MEDIUM: 2, HIGH: 3, URGENT: 4 };
const RECOVERY_COMPLETION = {
  SUBMITTED: 0,
  REOPENED: 0.1,
  ASSIGNED: 0.2,
  IN_PROGRESS: 0.4,
  COMPLETION_CLAIMED: 0.6,
  COMMUNITY_VERIFICATION: 0.8,
  VERIFIED: 1
};
