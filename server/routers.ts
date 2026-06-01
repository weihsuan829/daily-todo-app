import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getUserTasks, createTask, updateTask, deleteTask, getTaskStats, getBannerQuote, upsertBannerQuote, getRecurringTasks, createRecurringTask, updateRecurringTask, deleteRecurringTask, getAllTasksForAdmin, moveTaskInDay, swapTaskOrder, getUserAnnualGoals, createAnnualGoal, updateAnnualGoal, deleteAnnualGoal, getGoalMilestones, createGoalMilestone, updateGoalMilestone, deleteGoalMilestone, getTrackingItems, createTrackingItem, updateTrackingItem, deleteTrackingItem, getTrackingRecords, upsertTrackingRecord, listProjects, createProject, updateProject, archiveProject, listTasksByProject, reorderProjectTasks } from "./db";
import { z } from "zod";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return {
        success: true,
      } as const;
    }),
  }),

  tasks: router({
    list: protectedProcedure
      .input(z.object({ category: z.enum(["work", "life", "eisenhower"]).optional(), date: z.date().optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tasks = await getUserTasks(ctx.user.id, input?.category, input?.date);
        return tasks;
      }),
    
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["work", "life", "eisenhower"]).nullable().optional(),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        dueDate: z.date().optional(),
        quadrant: z.enum(["urgent-important", "not-urgent-important", "urgent-not-important", "not-urgent-not-important"]).optional(),
        projectId: z.number().optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        startDate: z.date().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await createTask(ctx.user.id, {
          category: input.category,
          title: input.title,
          description: input.description,
          priority: input.priority,
          dueDate: input.dueDate,
          quadrant: input.quadrant,
          order: 0,
          projectId: input.projectId,
          status: input.status,
          startDate: input.startDate,
        });
        return result;
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.enum(["work", "life", "eisenhower"]).optional(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        completed: z.boolean().optional(),
        dueDate: z.date().nullable().optional(),
        order: z.number().optional(),
        projectId: z.number().nullable().optional(),
        status: z.enum(["todo", "in_progress", "done"]).optional(),
        startDate: z.date().nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const result = await updateTask(id, ctx.user.id, updates);
        return result;
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number(), dueDate: z.date().optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteTask(input.id, ctx.user.id, input.dueDate);
        return { success: true };
      }),
    
    stats: protectedProcedure
      .query(async ({ ctx }) => {
        const stats = await getTaskStats(ctx.user.id);
        return stats;
      }),
    
    moveInDay: protectedProcedure
      .input(z.object({
        taskId: z.number(),
        targetTaskId: z.number(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await swapTaskOrder(input.taskId, input.targetTaskId, ctx.user.id);
        return result;
      }),

    listByProject: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listTasksByProject(ctx.user.id, input.projectId)),

    setStatus: protectedProcedure
      .input(z.object({ id: z.number(), status: z.enum(["todo", "in_progress", "done"]) }))
      .mutation(async ({ ctx, input }) => updateTask(input.id, ctx.user.id, { status: input.status })),

    reorder: protectedProcedure
      .input(z.object({ projectId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => reorderProjectTasks(ctx.user.id, input.orderedIds)),
  }),

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => listProjects(ctx.user.id)),
    create: protectedProcedure
      .input(z.object({ name: z.string().min(1).max(100), color: z.string().max(20).optional(), description: z.string().optional() }))
      .mutation(async ({ ctx, input }) => createProject(ctx.user.id, input.name, input.color, input.description)),
    update: protectedProcedure
      .input(z.object({ id: z.number(), name: z.string().min(1).max(100).optional(), color: z.string().max(20).optional(), description: z.string().optional(), order: z.number().optional() }))
      .mutation(async ({ ctx, input }) => { const { id, ...u } = input; return updateProject(ctx.user.id, id, u); }),
    archive: protectedProcedure
      .input(z.object({ id: z.number(), archived: z.boolean() }))
      .mutation(async ({ ctx, input }) => archiveProject(ctx.user.id, input.id, input.archived)),
  }),

  banner: router({
    getQuote: protectedProcedure
      .query(async ({ ctx }) => {
        const quote = await getBannerQuote(ctx.user.id);
        return quote;
      }),
    
    updateQuote: protectedProcedure
      .input(z.object({ quote: z.string().min(1).max(500) }))
      .mutation(async ({ ctx, input }) => {
        await upsertBannerQuote(ctx.user.id, input.quote);
        return { success: true };
      }),
  }),

  recurring: router({
    list: protectedProcedure
      .input(z.object({ category: z.enum(["work", "life"]).optional() }).optional())
      .query(async ({ ctx, input }) => {
        const tasks = await getRecurringTasks(ctx.user.id, input?.category);
        return tasks;
      }),
    
    create: protectedProcedure
      .input(z.object({
        category: z.enum(["work", "life"]),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).default("medium"),
        recurrenceType: z.enum(["weekly", "biweekly"]),
        dayOfWeek: z.number().min(0).max(6),
        weekOffset: z.number().default(0),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await createRecurringTask(ctx.user.id, input);
        return result;
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high"]).optional(),
        recurrenceType: z.enum(["weekly", "biweekly"]).optional(),
        dayOfWeek: z.number().min(0).max(6).optional(),
        weekOffset: z.number().optional(),
        isActive: z.boolean().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const result = await updateRecurringTask(id, ctx.user.id, updates);
        return result;
      }),
    
    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteRecurringTask(input.id, ctx.user.id);
        return { success: true };
      }),
    
    moveInDay: protectedProcedure
      .input(z.object({
        id: z.number(),
        direction: z.enum(["up", "down"]),
        dueDate: z.date(),
        category: z.enum(["work", "life"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await moveTaskInDay(input.id, ctx.user.id, input.direction, input.dueDate, input.category);
        return result;
      }),
  }),

  annualGoals: router({
    list: protectedProcedure
      .input(z.object({
        year: z.number(),
        quarter: z.number().min(1).max(4).optional(),
      }))
      .query(async ({ ctx, input }) => {
        return await getUserAnnualGoals(ctx.user.id, input.year, input.quarter);
      }),

    create: protectedProcedure
      .input(z.object({
        year: z.number(),
        quarter: z.number().min(1).max(4),
        title: z.string().min(1).max(255),
        description: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await createAnnualGoal(ctx.user.id, input.year, input.quarter, input.title, input.description);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const result = await updateAnnualGoal(id, ctx.user.id, updates);
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteAnnualGoal(input.id, ctx.user.id);
        return result;
      }),
  }),

  goalMilestones: router({
    list: protectedProcedure
      .input(z.object({ goalId: z.number() }))
      .query(async ({ input }) => {
        const milestones = await getGoalMilestones(input.goalId);
        return milestones;
      }),

    create: protectedProcedure
      .input(z.object({
        goalId: z.number(),
        title: z.string().min(1).max(255),
      }))
      .mutation(async ({ input }) => {
        const result = await createGoalMilestone(input.goalId, input.title);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        completed: z.boolean().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ input }) => {
        const { id, ...updates } = input;
        const result = await updateGoalMilestone(id, updates);
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => {
        const result = await deleteGoalMilestone(input.id);
        return result;
      }),
  }),

  trackingItems: router({
    list: protectedProcedure
      .input(z.object({ year: z.number(), quarter: z.number() }))
      .query(async ({ ctx, input }) => {
        const items = await getTrackingItems(ctx.user.id, input.year, input.quarter);
        return items;
      }),

    create: protectedProcedure
      .input(z.object({
        goalId: z.number(),
        year: z.number(),
        quarter: z.number(),
        title: z.string().min(1).max(255),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await createTrackingItem(ctx.user.id, input.goalId, input.year, input.quarter, input.title);
        return result;
      }),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().min(1).max(255).optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        const result = await updateTrackingItem(id, ctx.user.id, updates);
        return result;
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const result = await deleteTrackingItem(input.id, ctx.user.id);
        return result;
      }),
  }),

  trackingRecords: router({
    list: protectedProcedure
      .input(z.object({ itemId: z.number(), weekNumber: z.number().optional() }))
      .query(async ({ input }) => {
        const records = await getTrackingRecords(input.itemId, input.weekNumber);
        return records;
      }),

    upsert: protectedProcedure
      .input(z.object({
        itemId: z.number(),
        weekNumber: z.number(),
        dayOfWeek: z.number(),
        completed: z.boolean(),
      }))
      .mutation(async ({ input }) => {
        const result = await upsertTrackingRecord(input.itemId, input.weekNumber, input.dayOfWeek, input.completed);
        return result;
      }),
  }),

  admin: router({
    getAllTasks: protectedProcedure
      .query(async ({ ctx }) => {
        const tasks = await getAllTasksForAdmin(ctx.user.id);
        return tasks;
      }),
  }),
});

export type AppRouter = typeof appRouter;
