import { useEffect, useRef } from 'react';

export function useCursorTracker() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const positionRef = useRef({ x: 0, y: 0 });
  const velocityRef = useRef({ x: 0, y: 0 });

  useEffect(() => {
    // 建立 cursor 元素
    if (!cursorRef.current) {
      const cursor = document.createElement('div');
      cursor.id = 'custom-cursor';
      cursor.style.cssText = `
        position: fixed;
        width: 30px;
        height: 30px;
        border: 2px solid rgba(166, 140, 110, 0.6);
        border-radius: 50%;
        pointer-events: none;
        z-index: 9999;
        mix-blend-mode: screen;
        display: none;
      `;
      document.body.appendChild(cursor);
      cursorRef.current = cursor;
    }

    const cursor = cursorRef.current;
    let animationFrameId: number;

    const handleMouseMove = (e: MouseEvent) => {
      positionRef.current = { x: e.clientX, y: e.clientY };
      cursor.style.display = 'block';

      // 計算速度
      velocityRef.current = {
        x: e.clientX - positionRef.current.x,
        y: e.clientY - positionRef.current.y,
      };
    };

    const handleMouseLeave = () => {
      cursor.style.display = 'none';
    };

    const animate = () => {
      const { x, y } = positionRef.current;
      cursor.style.transform = `translate(${x - 15}px, ${y - 15}px)`;
      animationFrameId = requestAnimationFrame(animate);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseleave', handleMouseLeave);
    animationFrameId = requestAnimationFrame(animate);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseleave', handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
      if (cursor.parentNode) {
        cursor.parentNode.removeChild(cursor);
      }
    };
  }, []);
}
