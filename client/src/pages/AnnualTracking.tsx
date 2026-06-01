import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ChevronLeft, ChevronRight, Plus, Trash2, X, ArrowLeft, Edit2 } from 'lucide-react';
import { toast } from 'sonner';
import { useLocation } from 'wouter';
import { motion } from 'framer-motion';

export default function AnnualTracking() {
  const [, setLocation] = useLocation();
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState(1);
  const [newGoalTitle, setNewGoalTitle] = useState('');
  const [newGoalDescription, setNewGoalDescription] = useState('');
  const [newTrackingItemTitle, setNewTrackingItemTitle] = useState('');
  const [showAddTrackingItem, setShowAddTrackingItem] = useState(false);
  const [trackingRecordsMap, setTrackingRecordsMap] = useState<{ [key: number]: any[] }>({});
  const [editingGoalId, setEditingGoalId] = useState<number | null>(null);
  const [editingGoalTitle, setEditingGoalTitle] = useState('');
  const [editingGoalDescription, setEditingGoalDescription] = useState('');

  const utils = trpc.useUtils();

  // Fetch annual goals
  const { data: goals = [] } = trpc.annualGoals.list.useQuery({ year: selectedYear, quarter: selectedQuarter });

  // Fetch tracking items for selected quarter
  const { data: trackingItems = [] } = trpc.trackingItems.list.useQuery({ 
    year: selectedYear, 
    quarter: selectedQuarter 
  });

  // Fetch tracking records for all items
  useEffect(() => {
    const fetchAllRecords = async () => {
      const newMap: { [key: number]: any[] } = {};
      
      for (const item of trackingItems) {
        try {
          const records = await utils.trackingRecords.list.fetch({ itemId: item.id });
          newMap[item.id] = records || [];
        } catch (error) {
          console.error(`Failed to fetch records for item ${item.id}:`, error);
          newMap[item.id] = [];
        }
      }
      
      setTrackingRecordsMap(newMap);
    };

    if (trackingItems.length > 0) {
      fetchAllRecords();
    }
  }, [trackingItems, utils]);

  // Mutations
  const createGoalMutation = trpc.annualGoals.create.useMutation({
    onSuccess: () => {
      utils.annualGoals.list.invalidate({ year: selectedYear, quarter: selectedQuarter });
      setNewGoalTitle('');
      setNewGoalDescription('');
      toast.success('Goal added');
    },
    onError: () => {
      toast.error('Failed to add goal');
    },
  });

  const deleteGoalMutation = trpc.annualGoals.delete.useMutation({
    onSuccess: () => {
      utils.annualGoals.list.invalidate({ year: selectedYear, quarter: selectedQuarter });
      toast.success('Goal deleted');
    },
    onError: () => {
      toast.error('Failed to delete goal');
    },
  });

  const updateGoalMutation = trpc.annualGoals.update.useMutation({
    onSuccess: () => {
      utils.annualGoals.list.invalidate({ year: selectedYear, quarter: selectedQuarter });
      setEditingGoalId(null);
      toast.success('Goal updated');
    },
    onError: () => {
      toast.error('Failed to update goal');
    },
  });

  const createTrackingItemMutation = trpc.trackingItems.create.useMutation({
    onSuccess: () => {
      utils.trackingItems.list.invalidate({ year: selectedYear, quarter: selectedQuarter });
      setNewTrackingItemTitle('');
      setShowAddTrackingItem(false);
      toast.success('Tracking item added');
    },
    onError: () => {
      toast.error('Failed to add tracking item');
    },
  });

  const deleteTrackingItemMutation = trpc.trackingItems.delete.useMutation({
    onSuccess: () => {
      utils.trackingItems.list.invalidate({ year: selectedYear, quarter: selectedQuarter });
      toast.success('Tracking item deleted');
    },
    onError: () => {
      toast.error('Failed to delete tracking item');
    },
  });

  const upsertTrackingRecordMutation = trpc.trackingRecords.upsert.useMutation({
    onSuccess: (_, vars) => {
      // Update the local trackingRecordsMap immediately
      setTrackingRecordsMap(prev => {
        const updated = { ...prev };
        const records = updated[vars.itemId] || [];
        
        // Find and update the record, or add it if it doesn't exist
        const existingIndex = records.findIndex(
          r => r.weekNumber === vars.weekNumber && r.dayOfWeek === vars.dayOfWeek
        );
        
        if (existingIndex >= 0) {
          records[existingIndex] = { ...records[existingIndex], completed: vars.completed };
        } else {
          records.push({
            itemId: vars.itemId,
            weekNumber: vars.weekNumber,
            dayOfWeek: vars.dayOfWeek,
            completed: vars.completed,
          });
        }
        
        updated[vars.itemId] = records;
        return updated;
      });
      
      // Also invalidate to sync with server
      utils.trackingRecords.list.invalidate({ itemId: vars.itemId });
    },
    onError: () => {
      toast.error('Failed to update tracking record');
    },
  });

  const handleCreateGoal = async () => {
    if (!newGoalTitle.trim()) return;
    
    try {
      await createGoalMutation.mutateAsync({
        year: selectedYear,
        quarter: selectedQuarter,
        title: newGoalTitle,
        description: newGoalDescription,
      });
    } catch (error) {
      console.error('Failed to create goal:', error);
    }
  };

  const handleDeleteGoal = async (goalId: number) => {
    try {
      await deleteGoalMutation.mutateAsync({ id: goalId });
    } catch (error) {
      console.error('Failed to delete goal:', error);
    }
  };

  const handleEditGoal = (goal: any) => {
    setEditingGoalId(goal.id);
    setEditingGoalTitle(goal.title);
    setEditingGoalDescription(goal.description || '');
  };

  const handleSaveGoal = async () => {
    if (!editingGoalTitle.trim()) return;
    try {
      await updateGoalMutation.mutateAsync({
        id: editingGoalId!,
        title: editingGoalTitle,
        description: editingGoalDescription,
      });
    } catch (error) {
      console.error('Failed to update goal:', error);
    }
  };

  const handleCancelEdit = () => {
    setEditingGoalId(null);
    setEditingGoalTitle('');
    setEditingGoalDescription('');
  };

  const handleAddTrackingItem = async () => {
    if (!newTrackingItemTitle.trim()) return;
    
    try {
      await createTrackingItemMutation.mutateAsync({
        year: selectedYear,
        quarter: selectedQuarter,
        title: newTrackingItemTitle,
        goalId: goals[0]?.id || 1,
      });
    } catch (error) {
      console.error('Failed to add tracking item:', error);
    }
  };

  const handleDeleteTrackingItem = async (itemId: number) => {
    try {
      await deleteTrackingItemMutation.mutateAsync({ id: itemId });
    } catch (error) {
      console.error('Failed to delete tracking item:', error);
    }
  };

  const handleToggleTracking = async (itemId: number, weekNumber: number, dayOfWeek: number) => {
    try {
      // Find current record
      const records = trackingRecordsMap[itemId] || [];
      const currentRecord = records.find(
        r => r.weekNumber === weekNumber && r.dayOfWeek === dayOfWeek
      );
      
      // Toggle completed status
      const newCompleted = !currentRecord?.completed;
      
      await upsertTrackingRecordMutation.mutateAsync({
        itemId,
        weekNumber,
        dayOfWeek,
        completed: newCompleted,
      });
    } catch (error) {
      console.error('Failed to update tracking record:', error);
    }
  };

  const weekNumbers = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-white">
      {/* Banner */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full bg-gradient-to-b from-[#f5f5f5] via-[#efefef] to-[#e8e8e8] py-20 overflow-hidden"
      >
        {/* 左下角裝飾圓形 */}
        <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/40 blur-3xl" />
        
        <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center justify-center">
          {/* 返回按鈕 */}
          <div className="absolute left-6">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLocation('/')}
              className="text-gray-600 hover:bg-gray-300/30 flex items-center gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </Button>
          </div>

          {/* 標題 */}
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-center"
          >
            <h1 className="text-7xl font-bold text-gray-700 tracking-wide mb-6" style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '0.08em' }}>
              Annual Tracking
            </h1>
            <p className="text-2xl text-gray-600 font-light tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>Set your yearly goals and track your progress</p>
          </motion.div>
        </div>
      </motion.div>

      <div className="max-w-7xl mx-auto p-6">

        {/* Year Selector */}
        <div className="flex items-center justify-center mb-8 gap-4">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear - 1)}
            className="bg-white border-slate-200 hover:bg-slate-50"
          >
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h2 className="text-2xl font-bold text-foreground w-[80px] text-center">{selectedYear}</h2>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSelectedYear(selectedYear + 1)}
            className="bg-white border-slate-200 hover:bg-slate-50"
          >
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Goals Section */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-foreground mb-4">Your Goals</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {goals.map((goal) => (
              <Card key={goal.id} className="p-4 bg-white border-slate-200 relative">
                {editingGoalId === goal.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Goal title"
                      value={editingGoalTitle}
                      onChange={(e) => setEditingGoalTitle(e.target.value)}
                      className="text-sm bg-white border-slate-200"
                    />
                    <Textarea
                      placeholder="Description (optional)"
                      value={editingGoalDescription}
                      onChange={(e) => setEditingGoalDescription(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && e.ctrlKey) {
                          handleSaveGoal();
                        }
                      }}
                      className="text-sm min-h-20 bg-white border-slate-200 resize-none"
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        onClick={handleSaveGoal}
                        className="flex-1 bg-slate-300/60 border-slate-300/60 text-gray-700 hover:bg-slate-300/70"
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleCancelEdit}
                        className="flex-1 bg-white border-slate-200 hover:bg-slate-50"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 absolute top-2 right-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleEditGoal(goal)}
                      >
                        <Edit2 className="w-4 h-4 text-slate-400 hover:text-slate-600" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleDeleteGoal(goal.id)}
                      >
                        <Trash2 className="w-4 h-4 text-slate-400 hover:text-red-500" />
                      </Button>
                    </div>
                    <h4 className="font-semibold text-foreground mb-1 pr-12">{goal.title}</h4>
                    {goal.description && (
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{goal.description}</p>
                    )}
                  </>
                )}
              </Card>
            ))}

            {/* Add Goal Card */}
            {goals.length < 3 && (
              <Card className="p-4 bg-slate-50 border-slate-200 border-dashed flex flex-col justify-center items-center">
                <div className="w-full space-y-2">
                  <Input
                    placeholder="Goal title"
                    value={newGoalTitle}
                    onChange={(e) => setNewGoalTitle(e.target.value)}
                    className="text-sm bg-white border-slate-200"
                  />
                  <Textarea
                    placeholder="Description (optional)"
                    value={newGoalDescription}
                    onChange={(e) => setNewGoalDescription(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && e.ctrlKey) {
                        handleCreateGoal();
                      }
                    }}
                    className="text-sm min-h-20 bg-white border-slate-200 resize-none"
                  />
                  <Button
                    size="sm"
                    onClick={handleCreateGoal}
                    disabled={!newGoalTitle.trim()}
                    className="w-full bg-slate-300/60 border-slate-300/60 text-gray-700 hover:bg-slate-300/70"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    Add Goal
                  </Button>
                </div>
              </Card>
            )}
          </div>
        </div>

        {/* Quarter Selector */}
        <div className="mb-8">
          <h3 className="text-lg font-semibold text-foreground mb-4">Select Quarter</h3>
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((q) => (
              <Button
                key={q}
                variant={selectedQuarter === q ? 'outline' : 'outline'}
                size="sm"
                onClick={() => setSelectedQuarter(q)}
                className={selectedQuarter === q ? 'bg-slate-300/60 border-slate-300/60 text-gray-700 hover:bg-slate-300/70' : 'bg-white border-slate-200 hover:bg-slate-50'}
              >
                Q{q}
              </Button>
            ))}
          </div>
        </div>

        {/* Tracking Section */}
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">Tracking</h3>
          
          {/* Tracking Table */}
          <div className="bg-white border border-slate-200 rounded-lg overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="px-4 py-3 text-left text-sm font-semibold text-foreground w-40">Item</th>
                  {weekNumbers.map((week) => (
                    <th key={week} className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground">
                      W{week}
                    </th>
                  ))}
                  <th className="px-2 py-3 text-center text-xs font-semibold text-muted-foreground">Action</th>
                </tr>
              </thead>
              <tbody>
                {trackingItems.map((item) => {
                  const records = trackingRecordsMap[item.id] || [];
                  
                  return (
                    <tr key={item.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="px-4 py-3 text-sm font-medium text-foreground">{item.title}</td>
                      {weekNumbers.map((week) => {
                        const record = records.find(
                          r => r.weekNumber === week && r.dayOfWeek === 1
                        );
                        const isCompleted = record?.completed || false;
                        
                        return (
                          <td key={`${item.id}-${week}`} className="px-2 py-3 text-center">
                            <div className="flex justify-center">
                              <button
                                onClick={() => handleToggleTracking(item.id, week, 1)}
                                className={`w-5 h-5 rounded border-2 transition-all flex items-center justify-center ${
                                  isCompleted
                                    ? 'border-foreground bg-foreground'
                                    : 'border-border bg-white hover:border-foreground/50'
                                }`}
                              >
                                {isCompleted && (
                                  <svg
                                    className="w-3 h-3 text-background"
                                    fill="none"
                                    stroke="currentColor"
                                    viewBox="0 0 24 24"
                                  >
                                    <path
                                      strokeLinecap="round"
                                      strokeLinejoin="round"
                                      strokeWidth={3}
                                      d="M5 13l4 4L19 7"
                                    />
                                  </svg>
                                )}
                              </button>
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-2 py-3 text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => handleDeleteTrackingItem(item.id)}
                        >
                          <X className="w-4 h-4 text-slate-400 hover:text-red-500" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add Tracking Item */}
          {!showAddTrackingItem ? (
            <div className="mt-4">
              <Button
                variant="outline"
                className="w-full bg-white border-slate-200 hover:bg-slate-50"
                onClick={() => setShowAddTrackingItem(true)}
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Tracking Item
              </Button>
            </div>
          ) : (
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="space-y-2">
                <Input
                  placeholder="Enter tracking item name"
                  value={newTrackingItemTitle}
                  onChange={(e) => setNewTrackingItemTitle(e.target.value)}
                  className="bg-white border-slate-200"
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={handleAddTrackingItem}
                    disabled={!newTrackingItemTitle.trim()}
                    className="flex-1"
                  >
                    Add
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      setShowAddTrackingItem(false);
                      setNewTrackingItemTitle('');
                    }}
                    className="bg-white border-slate-200 hover:bg-slate-50"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
