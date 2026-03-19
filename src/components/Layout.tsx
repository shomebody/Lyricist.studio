import { ReactNode } from 'react';
import { Panel, Group as PanelGroup, Separator as PanelResizeHandle } from 'react-resizable-panels';
import { Sidebar } from './Sidebar';
import { AIPanel } from './AIPanel';
import { TemplateBuilder } from './TemplateBuilder';
import { useStore } from '../store/useStore';
import { useArrangementStore } from '../store/arrangementStore';

interface LayoutProps {
  children: ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { isAIPanelOpen } = useStore();
  const { isTemplateBuilderOpen, setTemplateBuilderOpen, editingTemplateId } = useArrangementStore();

  return (
    <div className="flex h-screen w-full bg-zinc-950 text-zinc-100 overflow-hidden font-sans">
      <PanelGroup orientation="horizontal" className="w-full h-full" id="main-layout">
        {/* Left Sidebar: Templates & Projects */}
        <Panel id="sidebar" defaultSize="280px" minSize="200px" maxSize="400px">
          <Sidebar />
        </Panel>
        
        <PanelResizeHandle className="relative w-1 bg-zinc-800 hover:bg-indigo-500 transition-colors cursor-col-resize">
          <div className="absolute -left-2 -right-2 top-0 bottom-0 z-10" />
        </PanelResizeHandle>
        
        {/* Center: Editor */}
        <Panel id="editor" minSize="400px">
          <main className="flex-1 flex flex-col h-full bg-zinc-900 relative">
            {children}
          </main>
        </Panel>

        {/* Right Sidebar: AI Co-Writer */}
        {isAIPanelOpen && (
          <>
            <PanelResizeHandle className="relative w-1 bg-zinc-800 hover:bg-indigo-500 transition-colors cursor-col-resize">
              <div className="absolute -left-2 -right-2 top-0 bottom-0 z-10" />
            </PanelResizeHandle>
            <Panel id="ai-panel" defaultSize="320px" minSize="250px" maxSize="500px">
              <AIPanel />
            </Panel>
          </>
        )}
      </PanelGroup>

      {/* Template Builder Modal */}
      {isTemplateBuilderOpen && (
        <TemplateBuilder
          onClose={() => setTemplateBuilderOpen(false)}
          initialTemplateId={editingTemplateId}
        />
      )}
    </div>
  );
}
