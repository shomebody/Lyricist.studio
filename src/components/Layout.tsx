import { ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { AIPanel } from './AIPanel';
import { useStore } from '../store/useStore';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isAIPanelOpen } = useStore();

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      {/* Left Sidebar: Templates & Projects */}
      <Sidebar />
      
      {/* Center: Editor */}
      <main className="flex-1 flex flex-col h-full border-r border-zinc-800 bg-zinc-900 relative">
        {children}
      </main>

      {/* Right Sidebar: AI Co-Writer */}
      {isAIPanelOpen && (
        <AIPanel />
      )}
    </div>
  );
}
