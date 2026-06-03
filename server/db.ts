import { eq, and, asc, desc, isNull, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, tasks, Task, InsertTask, bannerQuotes, recurringTasks, RecurringTask, InsertRecurringTask, annualGoals, AnnualGoal, InsertAnnualGoal, goalMilestones, GoalMilestone, InsertGoalMilestone, trackingItems, TrackingItem, InsertTrackingItem, trackingRecords, InsertTrackingRecord, deletedRecurringInstances, workspaces, workspaceMembers, projects, Project, tags, taskTags, Tag, placeholderMembers, attachments, comments } from "../drizzle/schema";
import { ENV } from './_core/env';
import { applyStatusCompletionSync } from "./taskStatus";

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Task queries
export async function getUserTasks(userId: number, category?: 'work' | 'life' | 'eisenhower', date?: Date) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get tasks: database not available");
    return [];
  }

  const conditions: any[] = [eq(tasks.userId, userId)];
  
  if (category) {
    conditions.push(eq(tasks.category, category));
  }

  try {
    // Get regular tasks
    const result = await db
      .select()
      .from(tasks)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(asc(tasks.order), desc(tasks.createdAt));
    
    // Get recurring tasks and generate virtual tasks for today and upcoming days
    const recurringTasksList = await getRecurringTasks(userId, category);
    const virtualTasks: any[] = [];
    
    // Get deleted recurring instances for this user
    const deletedInstances = await db
      .select()
      .from(deletedRecurringInstances)
      .where(eq(deletedRecurringInstances.userId, userId));
    
    // Create a Set of deleted instance keys for fast lookup: "recurringTaskId-YYYY-MM-DD"
    const deletedInstanceKeys = new Set(
      deletedInstances.map(d => {
        const dateStr = new Date(d.deletedDate).toISOString().split('T')[0];
        return `${d.recurringTaskId}-${dateStr}`;
      })
    );
    
    // Generate virtual tasks for the next 90 days
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    for (let dayOffset = 0; dayOffset < 90; dayOffset++) {
      const checkDate = new Date(today);
      checkDate.setDate(checkDate.getDate() + dayOffset);
      const dayOfWeek = checkDate.getDay(); // 0 = Sunday, 1 = Monday, etc.
      
      for (const recurringTask of recurringTasksList) {
        let shouldInclude = false;
        
        if (recurringTask.recurrenceType === 'weekly') {
          // For weekly tasks, check if today's day of week matches
          shouldInclude = dayOfWeek === recurringTask.dayOfWeek;
        } else if (recurringTask.recurrenceType === 'biweekly') {
          // For bi-weekly tasks, check day of week and week offset
          if (dayOfWeek === recurringTask.dayOfWeek) {
            // Calculate which week we're in (0 or 1)
            const weekNumber = Math.floor(checkDate.getDate() / 7);
            shouldInclude = weekNumber % 2 === recurringTask.weekOffset;
          }
        }
        
        if (shouldInclude) {
          // Check if this instance was deleted
          const dateStr = checkDate.toISOString().split('T')[0];
          const instanceKey = `${recurringTask.id}-${dateStr}`;
          
          if (!deletedInstanceKeys.has(instanceKey)) {
            // Create a virtual task object
            virtualTasks.push({
              id: -recurringTask.id, // Use negative ID to distinguish from real tasks
              userId: recurringTask.userId,
              category: recurringTask.category,
              title: recurringTask.title,
              description: recurringTask.description,
              priority: recurringTask.priority,
              completed: false,
              completedAt: null,
              dueDate: checkDate,
              order: 999, // Put recurring tasks at the end
              createdAt: recurringTask.createdAt,
              updatedAt: recurringTask.updatedAt,
              isRecurring: true,
              recurringTaskId: recurringTask.id,
            });
          }
        }
      }
    }
    
    // Combine regular tasks and virtual recurring tasks
    const allTasks = [...result, ...virtualTasks];
    
    // Sort by dueDate, then by order
    allTasks.sort((a, b) => {
      if (!a.dueDate || !b.dueDate) return 0;
      const dateA = new Date(a.dueDate).getTime();
      const dateB = new Date(b.dueDate).getTime();
      if (dateA !== dateB) return dateA - dateB;
      return (a.order || 0) - (b.order || 0);
    });
    
    return allTasks;
  } catch (error) {
    console.error("[Database] Failed to get tasks:", error);
    return [];
  }
}

export async function createTask(userId: number, task: Omit<InsertTask, 'userId'>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create task: database not available");
    return null;
  }

  try {
    // Calculate the correct order value for tasks on the same day
    let order = task.order || 0;
    if (task.dueDate) {
      // Get all tasks for this user on the same day and category
      const existingTasks = await db
        .select()
        .from(tasks)
        .where(
          and(
            eq(tasks.userId, userId),
            task.category != null
              ? eq(tasks.category, task.category)
              : isNull(tasks.category)
          )
        );
      
      // Filter tasks on the same day
      const taskDate = new Date(task.dueDate);
      taskDate.setHours(0, 0, 0, 0);
      
      const sameDayTasks = existingTasks.filter(t => {
        if (!t.dueDate) return false;
        const existingDate = new Date(t.dueDate);
        existingDate.setHours(0, 0, 0, 0);
        return existingDate.getTime() === taskDate.getTime();
      });
      
      // Find the maximum order value and increment it
      if (sameDayTasks.length > 0) {
        const maxOrder = Math.max(...sameDayTasks.map(t => t.order));
        order = maxOrder + 1;
      } else {
        order = 0;
      }
    }
    
    const result = await db.insert(tasks).values({
      ...task,
      order,
      userId,
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create task:", error);
    throw error;
  }
}

export async function updateTask(taskId: number, userId: number, updates: Partial<Omit<Task, 'id' | 'userId' | 'createdAt'>>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update task: database not available");
    return null;
  }

  try {
    const synced = applyStatusCompletionSync(updates);
    const result = await db
      .update(tasks)
      .set({ ...synced, updatedAt: new Date() })
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update task:", error);
    throw error;
  }
}

export async function deleteTask(taskId: number, userId: number, dueDate?: Date) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete task: database not available");
    return null;
  }

  try {
    // Check if this is a recurring task instance (negative ID)
    if (taskId < 0 && dueDate) {
      // This is a virtual recurring task instance
      const recurringTaskId = Math.abs(taskId);
      const deletedDate = new Date(dueDate);
      deletedDate.setHours(0, 0, 0, 0);
      
      // Record this instance as deleted
      await db.insert(deletedRecurringInstances).values({
        userId,
        recurringTaskId,
        deletedDate,
      });
      return { success: true };
    } else {
      // This is a real task, delete it normally
      const result = await db
        .delete(tasks)
        .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)));
      return result;
    }
  } catch (error) {
    console.error("[Database] Failed to delete task:", error);
    throw error;
  }
}

export async function getTaskStats(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get task stats: database not available");
    return null;
  }

  try {
    const allTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId));
    
    const completedTasks = allTasks.filter(t => t.completed);
    
    return {
      total: allTasks.length,
      completed: completedTasks.length,
      byCategory: {
        work: allTasks.filter(t => t.category === 'work').length,
        life: allTasks.filter(t => t.category === 'life').length,
      },
      completedByCategory: {
        work: completedTasks.filter(t => t.category === 'work').length,
        life: completedTasks.filter(t => t.category === 'life').length,
      },
    };
  } catch (error) {
    console.error("[Database] Failed to get task stats:", error);
    return null;
  }
}

export async function getBannerQuote(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get banner quote: database not available");
    return null;
  }

  try {
    const result = await db
      .select()
      .from(bannerQuotes)
      .where(eq(bannerQuotes.userId, userId))
      .limit(1);

    return result.length > 0 ? result[0] : null;
  } catch (error) {
    console.error("[Database] Failed to get banner quote:", error);
    return null;
  }
}

export async function upsertBannerQuote(userId: number, quote: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert banner quote: database not available");
    return;
  }

  try {
    await db
      .insert(bannerQuotes)
      .values({
        userId,
        quote,
      })
      .onDuplicateKeyUpdate({
        set: { quote, updatedAt: new Date() },
      });
  } catch (error) {
    console.error("[Database] Failed to upsert banner quote:", error);
    throw error;
  }
}


// Recurring Tasks Functions
export async function getRecurringTasks(userId: number, category?: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get recurring tasks: database not available");
    return [];
  }

  try {
    const conditions = [eq(recurringTasks.userId, userId), eq(recurringTasks.isActive, true)];
    if (category) {
      conditions.push(eq(recurringTasks.category, category as any));
    }

    const result = await db
      .select()
      .from(recurringTasks)
      .where(and(...conditions));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get recurring tasks:", error);
    return [];
  }
}

export async function createRecurringTask(userId: number, task: Omit<InsertRecurringTask, 'userId'>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create recurring task: database not available");
    return null;
  }

  try {
    const result = await db.insert(recurringTasks).values({
      ...task,
      userId,
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create recurring task:", error);
    throw error;
  }
}

export async function updateRecurringTask(taskId: number, userId: number, updates: Partial<Omit<RecurringTask, 'id' | 'userId' | 'createdAt'>>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update recurring task: database not available");
    return null;
  }

  try {
    const result = await db
      .update(recurringTasks)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(recurringTasks.id, taskId), eq(recurringTasks.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update recurring task:", error);
    throw error;
  }
}

export async function deleteRecurringTask(taskId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete recurring task: database not available");
    return null;
  }

  try {
    const result = await db
      .delete(recurringTasks)
      .where(and(eq(recurringTasks.id, taskId), eq(recurringTasks.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete recurring task:", error);
    throw error;
  }
}

export async function getAllTasksForAdmin(userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get all tasks: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(tasks)
      .where(eq(tasks.userId, userId))
      .orderBy(desc(tasks.createdAt));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get all tasks:", error);
    return [];
  }
}


// Swap order between two specific tasks
export async function swapTaskOrder(taskId: number, targetTaskId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot swap tasks: database not available");
    return null;
  }

  try {
    // Get both tasks
    const currentTask = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId)))
      .limit(1);

    const targetTask = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.id, targetTaskId), eq(tasks.userId, userId)))
      .limit(1);

    if (!currentTask[0] || !targetTask[0]) return null;

    // Ensure both tasks are on the same day (same dueDate)
    if (!currentTask[0].dueDate || !targetTask[0].dueDate) {
      console.warn("[Database] Cannot swap tasks without dueDate");
      return null;
    }
    
    const currentDate = new Date(currentTask[0].dueDate);
    const targetDate = new Date(targetTask[0].dueDate);
    currentDate.setHours(0, 0, 0, 0);
    targetDate.setHours(0, 0, 0, 0);
    
    if (currentDate.getTime() !== targetDate.getTime()) {
      console.warn("[Database] Cannot swap tasks on different days");
      return null;
    }

    // Swap order values
    const tempOrder = currentTask[0].order;
    await db
      .update(tasks)
      .set({ order: targetTask[0].order })
      .where(eq(tasks.id, taskId));

    await db
      .update(tasks)
      .set({ order: tempOrder })
      .where(eq(tasks.id, targetTaskId));

    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to swap tasks:", error);
    throw error;
  }
}

// Move task up or down within the same day
export async function moveTaskInDay(taskId: number, userId: number, direction: 'up' | 'down', dueDate: Date, category: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot move task: database not available");
    return null;
  }

  try {
    // Get all tasks for the same day and category
    const dayTasks = await db
      .select()
      .from(tasks)
      .where(and(
        eq(tasks.userId, userId),
        eq(tasks.category, category as any),
        eq(tasks.dueDate, dueDate)
      ))
      .orderBy(asc(tasks.order));

    const currentIndex = dayTasks.findIndex(t => t.id === taskId);
    if (currentIndex === -1) return null;

    // Determine new index
    let newIndex = currentIndex;
    if (direction === 'up' && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === 'down' && currentIndex < dayTasks.length - 1) {
      newIndex = currentIndex + 1;
    } else {
      return null; // Can't move
    }

    // Swap order values
    const currentTask = dayTasks[currentIndex];
    const targetTask = dayTasks[newIndex];

    if (!currentTask || !targetTask) return null;

    // Update both tasks
    await db
      .update(tasks)
      .set({ order: targetTask.order })
      .where(eq(tasks.id, currentTask.id));

    await db
      .update(tasks)
      .set({ order: currentTask.order })
      .where(eq(tasks.id, targetTask.id));

    return { success: true };
  } catch (error) {
    console.error("[Database] Failed to move task:", error);
    throw error;
  }
}


// Annual Goals queries
export async function getUserAnnualGoals(userId: number, year: number, quarter?: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get annual goals: database not available");
    return [];
  }

  try {
    const conditions = [eq(annualGoals.userId, userId), eq(annualGoals.year, year)];
    if (quarter !== undefined) {
      conditions.push(eq(annualGoals.quarter, quarter));
    }
    
    const result = await db
      .select()
      .from(annualGoals)
      .where(and(...conditions))
      .orderBy(asc(annualGoals.order));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get annual goals:", error);
    return [];
  }
}

export async function createAnnualGoal(userId: number, year: number, quarter: number, title: string, description?: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create annual goal: database not available");
    return null;
  }

  try {
    const result = await db.insert(annualGoals).values({
      userId,
      year,
      quarter,
      title,
      description,
      order: 0,
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create annual goal:", error);
    throw error;
  }
}

export async function updateAnnualGoal(goalId: number, userId: number, updates: Partial<Omit<AnnualGoal, 'id' | 'userId' | 'year' | 'createdAt'>>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update annual goal: database not available");
    return null;
  }

  try {
    const result = await db
      .update(annualGoals)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(annualGoals.id, goalId), eq(annualGoals.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update annual goal:", error);
    throw error;
  }
}

export async function deleteAnnualGoal(goalId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete annual goal: database not available");
    return null;
  }

  try {
    const result = await db
      .delete(annualGoals)
      .where(and(eq(annualGoals.id, goalId), eq(annualGoals.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete annual goal:", error);
    throw error;
  }
}

// Goal Milestones queries
export async function getGoalMilestones(goalId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get goal milestones: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(goalMilestones)
      .where(eq(goalMilestones.goalId, goalId))
      .orderBy(asc(goalMilestones.order));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get goal milestones:", error);
    return [];
  }
}

export async function createGoalMilestone(goalId: number, title: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create goal milestone: database not available");
    return null;
  }

  try {
    const result = await db.insert(goalMilestones).values({
      goalId,
      title,
      completed: false,
      order: 0,
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create goal milestone:", error);
    throw error;
  }
}

export async function updateGoalMilestone(milestoneId: number, updates: Partial<Omit<GoalMilestone, 'id' | 'goalId' | 'createdAt'>>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update goal milestone: database not available");
    return null;
  }

  try {
    const result = await db
      .update(goalMilestones)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(eq(goalMilestones.id, milestoneId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update goal milestone:", error);
    throw error;
  }
}

export async function deleteGoalMilestone(milestoneId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete goal milestone: database not available");
    return null;
  }

  try {
    const result = await db
      .delete(goalMilestones)
      .where(eq(goalMilestones.id, milestoneId));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete goal milestone:", error);
    throw error;
  }
}

// Tracking Items queries
export async function getTrackingItems(userId: number, year: number, quarter: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get tracking items: database not available");
    return [];
  }

  try {
    const result = await db
      .select()
      .from(trackingItems)
      .where(and(eq(trackingItems.userId, userId), eq(trackingItems.year, year), eq(trackingItems.quarter, quarter)))
      .orderBy(asc(trackingItems.order));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get tracking items:", error);
    return [];
  }
}

export async function createTrackingItem(userId: number, goalId: number, year: number, quarter: number, title: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot create tracking item: database not available");
    return null;
  }

  try {
    const result = await db.insert(trackingItems).values({
      userId,
      goalId,
      year,
      quarter,
      title,
      order: 0,
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to create tracking item:", error);
    throw error;
  }
}

export async function updateTrackingItem(itemId: number, userId: number, updates: Partial<Omit<TrackingItem, 'id' | 'userId' | 'year' | 'quarter' | 'createdAt'>>) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot update tracking item: database not available");
    return null;
  }

  try {
    const result = await db
      .update(trackingItems)
      .set({
        ...updates,
        updatedAt: new Date(),
      })
      .where(and(eq(trackingItems.id, itemId), eq(trackingItems.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to update tracking item:", error);
    throw error;
  }
}

export async function deleteTrackingItem(itemId: number, userId: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete tracking item: database not available");
    return null;
  }

  try {
    const result = await db
      .delete(trackingItems)
      .where(and(eq(trackingItems.id, itemId), eq(trackingItems.userId, userId)));
    return result;
  } catch (error) {
    console.error("[Database] Failed to delete tracking item:", error);
    throw error;
  }
}

// Tracking Records queries
export async function getTrackingRecords(itemId: number, weekNumber?: number) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get tracking records: database not available");
    return [];
  }

  try {
    const conditions: any[] = [eq(trackingRecords.trackingItemId, itemId)];
    if (weekNumber !== undefined) {
      conditions.push(eq(trackingRecords.weekNumber, weekNumber));
    }

    const result = await db
      .select()
      .from(trackingRecords)
      .where(conditions.length > 1 ? and(...conditions) : conditions[0])
      .orderBy(asc(trackingRecords.weekNumber), asc(trackingRecords.dayOfWeek));
    return result;
  } catch (error) {
    console.error("[Database] Failed to get tracking records:", error);
    return [];
  }
}

export async function upsertTrackingRecord(itemId: number, weekNumber: number, dayOfWeek: number, completed: boolean) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert tracking record: database not available");
    return null;
  }

  try {
    const result = await db.insert(trackingRecords).values({
      trackingItemId: itemId,
      weekNumber,
      dayOfWeek,
      completed,
    }).onDuplicateKeyUpdate({
      set: {
        completed,
        updatedAt: new Date(),
      },
    });
    return result;
  } catch (error) {
    console.error("[Database] Failed to upsert tracking record:", error);
    throw error;
  }
}

// ---- Workspaces ----
export async function ensureDefaultWorkspace(userId: number): Promise<number | null> {
  const db = await getDb();
  if (!db) return null;
  const existing = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (existing.length > 0) return existing[0].id;
  await db.insert(workspaces).values({ name: "My Workspace", ownerId: userId });
  const ws = await db.select().from(workspaces).where(eq(workspaces.ownerId, userId)).limit(1);
  if (ws.length === 0) return null;
  await db.insert(workspaceMembers).values({ workspaceId: ws[0].id, userId, role: "owner" });
  return ws[0].id;
}

// ---- Projects ----
export async function listProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const wsId = await ensureDefaultWorkspace(userId);
  if (!wsId) return [];
  return db.select().from(projects)
    .where(and(eq(projects.workspaceId, wsId), eq(projects.archived, false)))
    .orderBy(asc(projects.order));
}

export async function createProject(userId: number, name: string, color?: string, description?: string) {
  const db = await getDb();
  if (!db) return null;
  const wsId = await ensureDefaultWorkspace(userId);
  if (!wsId) return null;
  const existing = await db.select().from(projects).where(eq(projects.workspaceId, wsId));
  const order = existing.length > 0 ? Math.max(...existing.map((p) => p.order)) + 1 : 0;
  return db.insert(projects).values({ workspaceId: wsId, name, color, description, order });
}

async function userOwnsProject(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, projectId: number) {
  const rows = await db.select().from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .where(and(eq(projects.id, projectId), eq(workspaces.ownerId, userId))).limit(1);
  return rows.length > 0;
}

export async function updateProject(userId: number, projectId: number, updates: Partial<Pick<Project, "name" | "color" | "description" | "order">>) {
  const db = await getDb();
  if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.update(projects).set({ ...updates, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function archiveProject(userId: number, projectId: number, archived: boolean) {
  const db = await getDb();
  if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.update(projects).set({ archived, updatedAt: new Date() }).where(eq(projects.id, projectId));
}

export async function listTasksByProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  return db.select().from(tasks)
    .where(and(eq(tasks.userId, userId), eq(tasks.projectId, projectId)))
    .orderBy(asc(tasks.order), desc(tasks.createdAt));
}

export async function reorderProjectTasks(userId: number, orderedIds: number[]) {
  const db = await getDb();
  if (!db) return null;
  for (let i = 0; i < orderedIds.length; i++) {
    await db.update(tasks).set({ order: i })
      .where(and(eq(tasks.id, orderedIds[i]), eq(tasks.userId, userId)));
  }
  return { success: true };
}

// ---- Tags ----
export async function listTags(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  return db.select().from(tags).where(eq(tags.projectId, projectId));
}

export async function createTag(userId: number, projectId: number, name: string, color?: string) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  return db.insert(tags).values({ projectId, name, color });
}

export async function deleteTag(userId: number, tagId: number) {
  const db = await getDb(); if (!db) return null;
  await db.delete(taskTags).where(eq(taskTags.tagId, tagId));
  return db.delete(tags).where(eq(tags.id, tagId));
}

export async function setTaskTags(userId: number, taskId: number, tagIds: number[]) {
  const db = await getDb(); if (!db) return null;
  await db.delete(taskTags).where(eq(taskTags.taskId, taskId));
  if (tagIds.length) await db.insert(taskTags).values(tagIds.map((tagId) => ({ taskId, tagId })));
  return { success: true };
}

export async function listTaskTags(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  return db.select({ taskId: taskTags.taskId, tagId: taskTags.tagId })
    .from(taskTags).innerJoin(tasks, eq(taskTags.taskId, tasks.id))
    .where(eq(tasks.projectId, projectId));
}

// ---- Bulk Operations ----
export async function bulkUpdateTasks(userId: number, ids: number[], changes: { status?: "todo" | "in_progress" | "done" | "archived"; priority?: "low" | "medium" | "high" }) {
  const db = await getDb(); if (!db) return null;
  const synced = applyStatusCompletionSync(changes);
  for (const id of ids) {
    await db.update(tasks).set({ ...synced, updatedAt: new Date() }).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
  return { success: true };
}

export async function bulkDeleteTasks(userId: number, ids: number[]) {
  const db = await getDb(); if (!db) return null;
  for (const id of ids) {
    await db.delete(tasks).where(and(eq(tasks.id, id), eq(tasks.userId, userId)));
  }
  return { success: true };
}

// Workspace members (Phase: owner only = "Me"). Resolves the project's workspace owner to a user.
export async function listWorkspaceMembers(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  const rows = await db.select({ id: users.id, name: users.name, email: users.email })
    .from(projects)
    .innerJoin(workspaces, eq(projects.workspaceId, workspaces.id))
    .innerJoin(users, eq(workspaces.ownerId, users.id))
    .where(eq(projects.id, projectId)).limit(1);
  return rows; // [{ id, name, email }]
}

// Placeholder ("guest") members, scoped to the project's workspace.
async function workspaceIdOfProject(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, projectId: number): Promise<number | null> {
  const rows = await db.select({ wsId: projects.workspaceId }).from(projects).where(eq(projects.id, projectId)).limit(1);
  return rows.length ? rows[0].wsId : null;
}
export async function listPlaceholders(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsProject(db, userId, projectId))) return [];
  const wsId = await workspaceIdOfProject(db, projectId); if (!wsId) return [];
  return db.select().from(placeholderMembers).where(eq(placeholderMembers.workspaceId, wsId));
}
export async function createPlaceholder(userId: number, projectId: number, name: string, color?: string) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  const wsId = await workspaceIdOfProject(db, projectId); if (!wsId) return null;
  return db.insert(placeholderMembers).values({ workspaceId: wsId, name, color });
}
export async function deletePlaceholder(userId: number, id: number) {
  const db = await getDb(); if (!db) return null;
  return db.delete(placeholderMembers).where(eq(placeholderMembers.id, id));
}

// helper: does this user own this task?
async function userOwnsTask(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, userId: number, taskId: number) {
  const rows = await db.select({ id: tasks.id }).from(tasks)
    .where(and(eq(tasks.id, taskId), eq(tasks.userId, userId))).limit(1);
  return rows.length > 0;
}

// ---- Attachments ----
export async function listAttachments(userId: number, taskId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsTask(db, userId, taskId))) return [];
  return db.select().from(attachments).where(eq(attachments.taskId, taskId)).orderBy(asc(attachments.createdAt));
}
export async function createAttachment(userId: number, data: { taskId: number; fileUrl: string; fileName: string; fileSize: number }) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsTask(db, userId, data.taskId))) return null;
  await db.insert(attachments).values({ ...data, uploadedBy: userId });
  const rows = await db.select().from(attachments).where(eq(attachments.taskId, data.taskId)).orderBy(desc(attachments.id)).limit(1);
  return rows[0] ?? null;
}
export async function deleteAttachment(userId: number, id: number) {
  const db = await getDb(); if (!db) return null;
  const rows = await db.select().from(attachments).where(eq(attachments.id, id)).limit(1);
  const att = rows[0]; if (!att) return null;
  if (!(await userOwnsTask(db, userId, att.taskId))) return null;
  await db.delete(attachments).where(eq(attachments.id, id));
  return att; // caller unlinks the file
}

// ---- Comments ----
export async function listComments(userId: number, taskId: number) {
  const db = await getDb(); if (!db) return [];
  if (!(await userOwnsTask(db, userId, taskId))) return [];
  return db.select({
    id: comments.id, taskId: comments.taskId, userId: comments.userId,
    content: comments.content, createdAt: comments.createdAt,
    authorName: users.name,
  }).from(comments).innerJoin(users, eq(comments.userId, users.id))
    .where(eq(comments.taskId, taskId)).orderBy(asc(comments.createdAt));
}
export async function createComment(userId: number, taskId: number, content: string) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsTask(db, userId, taskId))) return null;
  return db.insert(comments).values({ taskId, userId, content });
}
export async function deleteComment(userId: number, id: number) {
  const db = await getDb(); if (!db) return null;
  return db.delete(comments).where(and(eq(comments.id, id), eq(comments.userId, userId)));
}

export async function deleteProject(userId: number, projectId: number) {
  const db = await getDb(); if (!db) return null;
  if (!(await userOwnsProject(db, userId, projectId))) return null;
  const taskRows = await db.select({ id: tasks.id }).from(tasks).where(eq(tasks.projectId, projectId));
  const ids = taskRows.map((r) => r.id);
  if (ids.length) {
    await db.delete(taskTags).where(inArray(taskTags.taskId, ids));
    await db.delete(comments).where(inArray(comments.taskId, ids));
    await db.delete(attachments).where(inArray(attachments.taskId, ids));
    await db.delete(tasks).where(eq(tasks.projectId, projectId));
  }
  await db.delete(tags).where(eq(tags.projectId, projectId));
  await db.delete(projects).where(eq(projects.id, projectId));
  return { success: true };
}
