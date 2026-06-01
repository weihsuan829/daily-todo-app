import { motion } from 'framer-motion';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Edit2, Check, X } from 'lucide-react';
import { trpc } from '@/lib/trpc';

export function Banner() {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  
  const { data: quote } = trpc.banner.getQuote.useQuery();
  const updateQuoteMutation = trpc.banner.updateQuote.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      trpc.useUtils().banner.getQuote.invalidate();
    },
  });

  const handleEdit = () => {
    setEditValue(quote?.quote || '');
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (editValue.trim()) {
      await updateQuoteMutation.mutateAsync({ quote: editValue });
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
    setEditValue('');
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="relative w-full bg-gradient-to-b from-[#f5f5f5] via-[#efefef] to-[#e8e8e8] py-20 overflow-hidden"
    >
      {/* 左下角裝飾圓形 */}
      <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-white/40 blur-3xl" />
      
      <div className="relative z-10 max-w-7xl mx-auto px-6 flex flex-col items-center justify-center text-center">
        {/* 標題 */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
          className="text-7xl font-bold text-gray-700 mb-8 tracking-wide"
          style={{ fontFamily: "'Playfair Display', serif", letterSpacing: '0.08em' }}
        >
          Daily Tracker
        </motion.h1>

        {/* 鼓勵話語 */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="flex items-center gap-4 justify-center"
        >
          {isEditing ? (
            <div className="flex gap-2 items-center">
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                placeholder="Enter your motivational quote..."
                className="max-w-2xl text-center bg-white/30 border-gray-400/30 text-gray-700 placeholder:text-gray-500 font-light text-lg"
                autoFocus
              />
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSave}
                disabled={updateQuoteMutation.isPending}
                className="text-gray-600 hover:bg-gray-300/30"
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleCancel}
                className="text-gray-600 hover:bg-gray-300/30"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <p className="text-xl text-gray-600 max-w-3xl leading-relaxed font-light tracking-wide" style={{ fontFamily: "'Playfair Display', serif" }}>
                {quote?.quote || 'Finding your path in life is your goal in life.'}
              </p>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleEdit}
                className="text-gray-500 hover:bg-gray-300/30 ml-2"
              >
                <Edit2 className="w-4 h-4" />
              </Button>
            </>
          )}
        </motion.div>
      </div>
    </motion.div>
  );
}
