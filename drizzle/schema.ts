import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, decimal, index } from "drizzle-orm/mysql-core";

/**
 * Core user table backing auth flow.
 * Extend this file with additional tables as your product grows.
 * Columns use camelCase to match both database fields and generated types.
 */
export const users = mysqlTable("users", {
  /**
   * Surrogate primary key. Auto-incremented numeric value managed by the database.
   * Use this for relations between tables.
   */
  id: int("id").autoincrement().primaryKey(),
  /** Manus OAuth identifier (openId) returned from the OAuth callback. Unique per user. */
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

/**
 * Tasks table for storing daily todo items
 * Supports work/life categorization, priority levels, and completion tracking
 */
export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", ["work", "life", "eisenhower"]),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high", "urgent"]).default("medium").notNull(),
  quadrant: mysqlEnum("quadrant", ["urgent-important", "not-urgent-important", "urgent-not-important", "not-urgent-not-important"]),
  projectId: int("projectId"),
  parentTaskId: int("parentTaskId"),
  assigneeId: int("assigneeId"),
  assigneePlaceholderId: int("assigneePlaceholderId"),
  recurrenceRule: text("recurrenceRule"),
  color: varchar("color", { length: 20 }),
  status: mysqlEnum("status", ["todo", "in_progress", "done", "archived"]).default("todo").notNull(),
  startDate: timestamp("startDate"),
  completed: boolean("completed").default(false).notNull(),
  completedAt: timestamp("completedAt"),
  dueDate: timestamp("dueDate"),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Task = typeof tasks.$inferSelect;
export type InsertTask = typeof tasks.$inferInsert;

/**
 * Notes: card-based personal notes with rich text (HTML), optional pasted
 * screenshots (image URLs embedded in content), tags (JSON string array),
 * color, pin, optional project link, and drag-reorder order.
 */
export const notes = mysqlTable("notes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull().default(""),
  content: text("content"),
  color: varchar("color", { length: 20 }),
  isPinned: boolean("isPinned").default(false).notNull(),
  projectId: int("projectId"),
  tags: text("tags"), // JSON string array, e.g. ["購料","會議"]
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type Note = typeof notes.$inferSelect;
export type NewNote = typeof notes.$inferInsert;

export const workspaces = mysqlTable("workspaces", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 100 }).notNull(),
  ownerId: int("ownerId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Workspace = typeof workspaces.$inferSelect;
export type InsertWorkspace = typeof workspaces.$inferInsert;

export const workspaceMembers = mysqlTable("workspace_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["owner", "member"]).default("owner").notNull(),
  joinedAt: timestamp("joinedAt").defaultNow().notNull(),
});
export type WorkspaceMember = typeof workspaceMembers.$inferSelect;
export type InsertWorkspaceMember = typeof workspaceMembers.$inferInsert;

export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  color: varchar("color", { length: 20 }).default("#3b82f6").notNull(),
  description: text("description"),
  archived: boolean("archived").default(false).notNull(),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Project = typeof projects.$inferSelect;
export type InsertProject = typeof projects.$inferInsert;

export const tags = mysqlTable("tags", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  name: varchar("name", { length: 50 }).notNull(),
  color: varchar("color", { length: 20 }).default("#94a3b8").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Tag = typeof tags.$inferSelect;
export type InsertTag = typeof tags.$inferInsert;

export const taskTags = mysqlTable("task_tags", {
  taskId: int("taskId").notNull(),
  tagId: int("tagId").notNull(),
});
export type TaskTag = typeof taskTags.$inferSelect;

export const placeholderMembers = mysqlTable("placeholder_members", {
  id: int("id").autoincrement().primaryKey(),
  workspaceId: int("workspaceId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  color: varchar("color", { length: 20 }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type PlaceholderMember = typeof placeholderMembers.$inferSelect;
export type InsertPlaceholderMember = typeof placeholderMembers.$inferInsert;

/**
 * Deleted recurring task instances table
 * Tracks which specific instances of recurring tasks have been deleted by the user
 * This allows us to regenerate instances without recreating deleted ones
 */
export const deletedRecurringInstances = mysqlTable("deleted_recurring_instances", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  recurringTaskId: int("recurringTaskId").notNull(),
  deletedDate: timestamp("deletedDate").notNull(), // The date of the deleted instance
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type DeletedRecurringInstance = typeof deletedRecurringInstances.$inferSelect;
export type InsertDeletedRecurringInstance = typeof deletedRecurringInstances.$inferInsert;

/**
 * Banner quotes table for storing motivational quotes
 * Each user can have their own customizable quote
 */
export const bannerQuotes = mysqlTable("banner_quotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  quote: text("quote").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type BannerQuote = typeof bannerQuotes.$inferSelect;
export type InsertBannerQuote = typeof bannerQuotes.$inferInsert;
/**
 * Recurring tasks table for storing periodic task rules
 * Supports weekly and bi-weekly repetition patterns
 */
export const recurringTasks = mysqlTable("recurring_tasks", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", ["work", "life", "eisenhower"]).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  priority: mysqlEnum("priority", ["low", "medium", "high"]).default("medium").notNull(),
  recurrenceType: mysqlEnum("recurrenceType", ["weekly", "biweekly"]).notNull(),
  dayOfWeek: int("dayOfWeek").notNull(),
  weekOffset: int("weekOffset").default(0).notNull(),
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type RecurringTask = typeof recurringTasks.$inferSelect;
export type InsertRecurringTask = typeof recurringTasks.$inferInsert;

/**
 * Annual goals table for storing yearly goals
 * Each user can set up to 3 goals per year
 */
export const annualGoals = mysqlTable("annual_goals", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  year: int("year").notNull(),
  quarter: int("quarter").notNull(), // 1, 2, 3, or 4
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type AnnualGoal = typeof annualGoals.$inferSelect;
export type InsertAnnualGoal = typeof annualGoals.$inferInsert;

// Helper function to get quarter from month (1-12)
export function getQuarter(month: number): number {
  return Math.ceil(month / 3);
}

/**
 * Goal milestones table for storing specific steps to achieve goals
 * Each goal can have multiple milestones
 */
export const goalMilestones = mysqlTable("goal_milestones", {
  id: int("id").autoincrement().primaryKey(),
  goalId: int("goalId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  completed: boolean("completed").default(false).notNull(),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GoalMilestone = typeof goalMilestones.$inferSelect;
export type InsertGoalMilestone = typeof goalMilestones.$inferInsert;

/**
 * Tracking items table for storing items to track during 12-week periods
 * Each item can be tracked across 12 weeks with daily checkboxes
 */
export const trackingItems = mysqlTable("tracking_items", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  goalId: int("goalId").notNull(),
  year: int("year").notNull(),
  quarter: int("quarter").notNull(), // 1, 2, 3, or 4
  title: varchar("title", { length: 255 }).notNull(),
  order: int("order").default(0).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrackingItem = typeof trackingItems.$inferSelect;
export type InsertTrackingItem = typeof trackingItems.$inferInsert;

/**
 * Tracking records table for storing daily check-ins
 * Each record represents a day's completion status for a tracking item
 */
export const trackingRecords = mysqlTable("tracking_records", {
  id: int("id").autoincrement().primaryKey(),
  trackingItemId: int("trackingItemId").notNull(),
  weekNumber: int("weekNumber").notNull(), // 1-12
  dayOfWeek: int("dayOfWeek").notNull(), // 0 (Sunday) - 6 (Saturday)
  completed: boolean("completed").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type TrackingRecord = typeof trackingRecords.$inferSelect;
export type InsertTrackingRecord = typeof trackingRecords.$inferInsert;

export const attachments = mysqlTable("attachments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  fileUrl: varchar("fileUrl", { length: 500 }).notNull(),
  fileName: varchar("fileName", { length: 255 }).notNull(),
  fileSize: int("fileSize").default(0).notNull(),
  uploadedBy: int("uploadedBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Attachment = typeof attachments.$inferSelect;
export type InsertAttachment = typeof attachments.$inferInsert;

export const comments = mysqlTable("comments", {
  id: int("id").autoincrement().primaryKey(),
  taskId: int("taskId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});
export type Comment = typeof comments.$inferSelect;
export type InsertComment = typeof comments.$inferInsert;

/**
 * Frameworks table for storing problem-solving frameworks
 * Supports categorization by type (框架/方法/原則/流程) and rich metadata
 */
export const frameworks = mysqlTable("frameworks", {
  id: int("id").autoincrement().primaryKey(),
  slug: varchar("slug", { length: 100 }).notNull().unique(),
  name: varchar("name", { length: 150 }).notNull(),
  type: mysqlEnum("type", ["框架", "方法", "原則", "流程"]).notNull(),
  sourceBook: varchar("sourceBook", { length: 255 }),
  oneLiner: text("oneLiner"),
  tags: text("tags"),
  whenUse: text("whenUse"),
  steps: text("steps"),
  keyQuestions: text("keyQuestions"),
  output: text("output"),
  example: text("example"),
  diagram: text("diagram"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});
export type Framework = typeof frameworks.$inferSelect;
export type InsertFramework = typeof frameworks.$inferInsert;

/**
 * Problem solutions table for storing user problem analysis sessions
 * Links users to their chosen frameworks and AI-generated analysis
 */
export const problemSolutions = mysqlTable("problem_solutions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  problemText: text("problemText").notNull(),
  chosenFrameworks: text("chosenFrameworks"),
  reasoning: text("reasoning"),
  analysis: text("analysis"),
  diagram: text("diagram"),
  diagramType: varchar("diagramType", { length: 30 }),
  nextSteps: text("nextSteps"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  userIdIdx: index("problem_solutions_userId_idx").on(table.userId),
}));
export type ProblemSolution = typeof problemSolutions.$inferSelect;
export type InsertProblemSolution = typeof problemSolutions.$inferInsert;

export const problemMessages = mysqlTable("problem_messages", {
  id: int("id").autoincrement().primaryKey(),
  problemSolutionId: int("problemSolutionId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["user", "assistant"]).notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
}, (table) => ({
  solutionUserIdx: index("problem_messages_solutionId_userId_idx").on(table.problemSolutionId, table.userId),
}));
export type ProblemMessage = typeof problemMessages.$inferSelect;
export type InsertProblemMessage = typeof problemMessages.$inferInsert;
