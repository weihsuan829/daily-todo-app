import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, router, protectedProcedure } from "./_core/trpc";
import { getUserTasks, createTask, updateTask, deleteTask, getTaskStats, getBannerQuote, upsertBannerQuote, getRecurringTasks, createRecurringTask, updateRecurringTask, deleteRecurringTask, getAllTasksForAdmin, moveTaskInDay, swapTaskOrder, getUserAnnualGoals, createAnnualGoal, updateAnnualGoal, deleteAnnualGoal, getGoalMilestones, createGoalMilestone, updateGoalMilestone, deleteGoalMilestone, getTrackingItems, createTrackingItem, updateTrackingItem, deleteTrackingItem, getTrackingRecords, upsertTrackingRecord, listProjects, createProject, updateProject, archiveProject, deleteProject, listTasksByProject, reorderProjectTasks, listTags, createTag, deleteTag, setTaskTags, listTaskTags, bulkUpdateTasks, bulkDeleteTasks, listWorkspaceMembers, listPlaceholders, createPlaceholder, deletePlaceholder, listAttachments, deleteAttachment, listComments, createComment, deleteComment, listNotes, createNote, updateNote, reorderNotes, deleteNote, listFrameworks, getFramework, updateFramework, deleteFramework, getFrameworkBySlug, listProblemSolutions, createProblemSolution, deleteProblemSolution, getProblemSolution, listProblemMessages, createProblemMessage, updateProblemSolutionDiagram } from "./db";
import { chat } from "./_core/openai";
import { analyzeProblem, discussProblem, regenerateDiagram } from "./solve-service";
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
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        dueDate: z.date().optional(),
        quadrant: z.enum(["urgent-important", "not-urgent-important", "urgent-not-important", "not-urgent-not-important"]).optional(),
        projectId: z.number().optional(),
        status: z.enum(["todo", "in_progress", "done", "archived"]).optional(),
        startDate: z.date().optional(),
        parentTaskId: z.number().optional(),
        assigneeId: z.number().nullable().optional(),
        assigneePlaceholderId: z.number().nullable().optional(),
        recurrenceRule: z.string().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
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
          parentTaskId: input.parentTaskId,
          assigneeId: input.assigneeId,
          assigneePlaceholderId: input.assigneePlaceholderId,
          recurrenceRule: input.recurrenceRule,
          color: input.color,
        });
        return result;
      }),
    
    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        category: z.enum(["work", "life", "eisenhower"]).optional(),
        title: z.string().min(1).max(255).optional(),
        description: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
        completed: z.boolean().optional(),
        dueDate: z.date().nullable().optional(),
        order: z.number().optional(),
        projectId: z.number().nullable().optional(),
        status: z.enum(["todo", "in_progress", "done", "archived"]).optional(),
        startDate: z.date().nullable().optional(),
        assigneeId: z.number().nullable().optional(),
        assigneePlaceholderId: z.number().nullable().optional(),
        recurrenceRule: z.string().nullable().optional(),
        color: z.string().max(20).nullable().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...updates } = input;
        if (updates.assigneeId != null) updates.assigneePlaceholderId = null;
        else if (updates.assigneePlaceholderId != null) updates.assigneeId = null;
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
      .input(z.object({ id: z.number(), status: z.enum(["todo", "in_progress", "done", "archived"]) }))
      .mutation(async ({ ctx, input }) => updateTask(input.id, ctx.user.id, { status: input.status })),

    reorder: protectedProcedure
      .input(z.object({ projectId: z.number(), orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => reorderProjectTasks(ctx.user.id, input.orderedIds)),

    reorderDay: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => reorderProjectTasks(ctx.user.id, input.orderedIds)),

    setTags: protectedProcedure.input(z.object({ id: z.number(), tagIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => setTaskTags(ctx.user.id, input.id, input.tagIds)),
    bulkUpdate: protectedProcedure.input(z.object({ ids: z.array(z.number()), status: z.enum(["todo","in_progress","done","archived"]).optional(), priority: z.enum(["low","medium","high","urgent"]).optional() }))
      .mutation(async ({ ctx, input }) => bulkUpdateTasks(ctx.user.id, input.ids, { status: input.status, priority: input.priority as "low" | "medium" | "high" | undefined })),
    bulkDelete: protectedProcedure.input(z.object({ ids: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => bulkDeleteTasks(ctx.user.id, input.ids)),
  }),

  tags: router({
    list: protectedProcedure.input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listTags(ctx.user.id, input.projectId)),
    create: protectedProcedure.input(z.object({ projectId: z.number(), name: z.string().min(1).max(50), color: z.string().max(20).optional() }))
      .mutation(async ({ ctx, input }) => createTag(ctx.user.id, input.projectId, input.name, input.color)),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deleteTag(ctx.user.id, input.id)),
    taskMap: protectedProcedure.input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listTaskTags(ctx.user.id, input.projectId)),
  }),

  notes: router({
    list: protectedProcedure.query(async ({ ctx }) => listNotes(ctx.user.id)),

    create: protectedProcedure
      .input(z.object({
        title: z.string().max(255).optional(),
        content: z.string().optional(),
        color: z.string().max(20).optional(),
        projectId: z.number().nullable().optional(),
        tags: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => createNote(ctx.user.id, input)),

    update: protectedProcedure
      .input(z.object({
        id: z.number(),
        title: z.string().max(255).optional(),
        content: z.string().optional(),
        color: z.string().max(20).nullable().optional(),
        isPinned: z.boolean().optional(),
        projectId: z.number().nullable().optional(),
        tags: z.string().optional(),
        order: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const { id, ...u } = input;
        return updateNote(ctx.user.id, id, u as never);
      }),

    reorder: protectedProcedure
      .input(z.object({ orderedIds: z.array(z.number()) }))
      .mutation(async ({ ctx, input }) => reorderNotes(ctx.user.id, input.orderedIds)),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deleteNote(ctx.user.id, input.id)),
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
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deleteProject(ctx.user.id, input.id)),
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

  members: router({
    list: protectedProcedure.input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listWorkspaceMembers(ctx.user.id, input.projectId)),
  }),

  placeholders: router({
    list: protectedProcedure.input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listPlaceholders(ctx.user.id, input.projectId)),
    create: protectedProcedure.input(z.object({ projectId: z.number(), name: z.string().min(1).max(64), color: z.string().max(20).optional() }))
      .mutation(async ({ ctx, input }) => createPlaceholder(ctx.user.id, input.projectId, input.name, input.color)),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deletePlaceholder(ctx.user.id, input.id)),
  }),

  attachments: router({
    list: protectedProcedure.input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => listAttachments(ctx.user.id, input.taskId)),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => { await deleteAttachment(ctx.user.id, input.id); return { success: true }; }),
  }),

  comments: router({
    list: protectedProcedure.input(z.object({ taskId: z.number() }))
      .query(async ({ ctx, input }) => listComments(ctx.user.id, input.taskId)),
    create: protectedProcedure.input(z.object({ taskId: z.number(), content: z.string().min(1).max(5000) }))
      .mutation(async ({ ctx, input }) => createComment(ctx.user.id, input.taskId, input.content)),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deleteComment(ctx.user.id, input.id)),
  }),

  solveProblems: router({
    history: protectedProcedure.query(async ({ ctx }) => listProblemSolutions(ctx.user.id)),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => deleteProblemSolution(input.id, ctx.user.id)),
    analyze: protectedProcedure
      .input(z.object({ problemText: z.string().min(1), frameworkSlugs: z.array(z.string()).optional() }))
      .mutation(async ({ ctx, input }) => {
        const result = await analyzeProblem(input, {
          listFrameworks,
          getFrameworkBySlug,
          chat,
        });
        const ins = await createProblemSolution({
          userId: ctx.user.id,
          problemText: input.problemText,
          chosenFrameworks: result.chosenFrameworks.join(","),
          reasoning: result.reasoning,
          analysis: result.analysis,
          diagram: result.diagram,
          diagramType: result.diagramType,
        });
        const id = (ins as any)?.[0]?.insertId ?? (ins as any)?.insertId ?? null;
        return { id, ...result };
      }),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        const solution = await getProblemSolution(input.id, ctx.user.id);
        const messages = solution ? await listProblemMessages(input.id, ctx.user.id) : [];
        return { solution, messages };
      }),
    discuss: protectedProcedure
      .input(z.object({ problemSolutionId: z.number(), message: z.string().min(1) }))
      .mutation(async ({ ctx, input }) => {
        const solution = await getProblemSolution(input.problemSolutionId, ctx.user.id);
        if (!solution) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該問題或無權限" });
        const history = await listProblemMessages(input.problemSolutionId, ctx.user.id);
        await createProblemMessage({ problemSolutionId: input.problemSolutionId, userId: ctx.user.id, role: "user", content: input.message });
        const reply = await discussProblem({
          problemText: solution.problemText,
          frameworksText: solution.chosenFrameworks ?? "",
          analysis: solution.analysis ?? "",
          history: history.map((m) => ({ role: m.role, content: m.content })),
          message: input.message,
        }, { chat });
        await createProblemMessage({ problemSolutionId: input.problemSolutionId, userId: ctx.user.id, role: "assistant", content: reply });
        return { reply };
      }),
    setDiagram: protectedProcedure
      .input(z.object({
        problemSolutionId: z.number(),
        diagramType: z.enum(["flowchart", "mindmap", "quadrantChart", "timeline", "sequenceDiagram"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const solution = await getProblemSolution(input.problemSolutionId, ctx.user.id);
        if (!solution) throw new TRPCError({ code: "NOT_FOUND", message: "找不到該問題或無權限" });
        const r = await regenerateDiagram({
          problemText: solution.problemText,
          frameworksText: solution.chosenFrameworks ?? "",
          analysis: solution.analysis ?? "",
          diagramType: input.diagramType,
        }, { chat });
        await updateProblemSolutionDiagram(input.problemSolutionId, ctx.user.id, r.diagram, r.diagramType);
        return r;
      }),
  }),

  frameworks: router({
    list: protectedProcedure.query(async () => listFrameworks()),
    get: protectedProcedure.input(z.object({ id: z.number() }))
      .query(async ({ input }) => getFramework(input.id)),
    update: protectedProcedure.input(z.object({
      id: z.number(),
      name: z.string().min(1).max(150).optional(),
      type: z.enum(["框架", "方法", "原則", "流程"]).optional(),
      oneLiner: z.string().optional(),
      tags: z.string().optional(),
      whenUse: z.string().optional(),
      steps: z.string().optional(),
      keyQuestions: z.string().optional(),
      output: z.string().optional(),
      example: z.string().optional(),
      diagram: z.string().optional(),
    })).mutation(async ({ input }) => {
      const { id, ...patch } = input;
      return updateFramework(id, patch);
    }),
    delete: protectedProcedure.input(z.object({ id: z.number() }))
      .mutation(async ({ input }) => deleteFramework(input.id)),
  }),
});

export type AppRouter = typeof appRouter;
