import { useState, useRef } from 'react';
import { Checkbox } from '@/components/ui/checkbox';
import { Trash2, ChevronUp, ChevronDown, FileText } from 'lucide-react';

interface InteractiveTaskCardProps {
  task: {
    id: number;
    title: string;
    description: string | null;
    priority: string;
    completed: boolean;
    isRecurring?: boolean;
    recurringTaskId?: number;
    updatedAt?: Date;
  };
  onToggle: (taskId: number, completed: boolean) => void;
  onDelete: (taskId: number) => void;
  onUpdateTitle: (taskId: number, newTitle: string) => void;
  onOpenNotes?: (task: any) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}

export function InteractiveTaskCard({
  task,
  onToggle,
  onDelete,
  onUpdateTitle,
  onOpenNotes,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
}: InteractiveTaskCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(task.title);

  const handleDoubleClick = () => {
    if (task.isRecurring) return;
    setIsEditing(true);
    setEditValue(task.title);
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const handleSave = () => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== task.title) {
      onUpdateTitle(task.id, trimmedValue);
    }
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      setIsEditing(false);
    }
  };

  const handleBlur = () => {
    handleSave();
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'high':
        return '●';
      case 'medium':
        return '●';
      case 'low':
        return '○';
      default:
        return priority;
    }
  };

  const getPriorityTextColor = (priority: string) => {
    switch (priority) {
      case 'high':
        return 'text-red-500';
      case 'medium':
        return 'text-yellow-600';
      case 'low':
        return 'text-green-600';
      default:
        return 'text-gray-500';
    }
  };

  return (
    <div
      ref={cardRef}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative p-3 rounded-lg backdrop-blur-md border border-white/20 overflow-hidden group cursor-pointer transition-all duration-150 ${
        task.completed
          ? 'bg-gray-200/30 hover:bg-gray-200/40'
          : 'bg-white/5 hover:bg-white/10'
      }`}
    >
      {/* 內容 */}
      <div className="relative z-10 space-y-2">
        <div className="flex items-start gap-2">
          <Checkbox
            checked={task.completed}
            onCheckedChange={() => onToggle(task.id, task.completed)}
            className="mt-0.5 flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <span className={`text-xs font-bold transition-all duration-150 ${
                task.completed ? 'text-gray-400' : getPriorityTextColor(task.priority)
              }`}>
                {getPriorityLabel(task.priority)}
              </span>
              {isEditing ? (
                <input
                  ref={inputRef}
                  type="text"
                  value={editValue}
                  onChange={(e) => setEditValue(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleBlur}
                  className="flex-1 px-2 py-0.5 text-xs font-medium bg-white/20 border border-white/40 rounded text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              ) : (
                <p
                  onDoubleClick={handleDoubleClick}
                  className={`flex-1 text-xs font-medium line-clamp-2 transition-all duration-150 cursor-text select-none ${
                    task.completed
                      ? 'line-through text-gray-400'
                      : 'text-foreground'
                  }`}
                >
                  {task.title}
                </p>
              )}
            </div>

          </div>
        </div>
      </div>

      {/* 操作按鈕 */}
      <div className="absolute top-2 right-2 z-20 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-150 pointer-events-auto">
          {onMoveUp && canMoveUp && (
            <button
              onClick={() => onMoveUp()}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="向上移動"
            >
              <ChevronUp className="w-3 h-3" />
            </button>
          )}
          {onMoveDown && canMoveDown && (
            <button
              onClick={() => onMoveDown()}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="向下移動"
            >
              <ChevronDown className="w-3 h-3" />
            </button>
          )}
          {onOpenNotes && (
            <button
              onClick={() => onOpenNotes(task)}
              className="text-muted-foreground hover:text-primary transition-colors p-0.5"
              title="編輯筆記"
            >
              <FileText className="w-3 h-3" />
            </button>
          )}
          <button
            onClick={() => onDelete(task.id)}
            className="text-muted-foreground hover:text-destructive transition-colors p-0.5"
            title="刪除"
          >
            <Trash2 className="w-3 h-3" />
          </button>
      </div>
    </div>
  );
}
