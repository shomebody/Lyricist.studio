import { Folder, Music, Settings, Sparkles, ListTree, LogIn, LogOut, Plus, LayoutTemplate } from 'lucide-react';
import { useStore, TEMPLATES } from '../store/useStore';
import { useArrangementStore } from '../store/arrangementStore';
import { BAR_TEMPLATES } from '../lib/arrangement';
import { signInWithGoogle, logOut } from '../firebase';
import { SectionArranger } from './SectionArranger';

export function Sidebar() {
  const { currentTemplateId, setTemplateId, lyrics, user, projects, currentProjectId, setCurrentProjectId, setLyrics, setStylePrompt } = useStore();
  const { currentArrangementId, setCurrentArrangement, customTemplates, setTemplateBuilderOpen, setEditingTemplateId } = useArrangementStore();

  const templates = Object.values(TEMPLATES);

  // Group templates by genre
  const groupedTemplates = templates.reduce((acc, template) => {
    if (!acc[template.genre]) {
      acc[template.genre] = [];
    }
    acc[template.genre].push(template);
    return acc;
  }, {} as Record<string, typeof templates>);

  const handleNewProject = () => {
    setCurrentProjectId(null);
    setLyrics('');
    setStylePrompt('');
    setTemplateId(null);
  };

  const loadProject = (id: string) => {
    const project = projects.find(p => p.id === id);
    if (project) {
      setCurrentProjectId(project.id);
      setLyrics(project.lyrics);
      setStylePrompt(project.stylePrompt);
      setTemplateId(project.templateId);
    }
  };

  return (
    <aside className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex items-center gap-2 overflow-hidden">
        <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0" />
        <h1 className="font-bold text-lg tracking-tight truncate">maxmartAIn</h1>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <Folder className="w-4 h-4" />
              Projects
            </h2>
            <button 
              onClick={handleNewProject}
              className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
              title="New Project"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <ul className="space-y-1">
            {projects.length === 0 ? (
              <li className="text-xs text-zinc-600 px-2 italic">No saved projects</li>
            ) : (
              projects.map(p => (
                <li key={p.id}>
                  <button 
                    onClick={() => loadProject(p.id)}
                    className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors truncate ${
                      currentProjectId === p.id 
                        ? 'bg-indigo-500/10 text-indigo-400' 
                        : 'bg-zinc-900/50 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                    }`}
                  >
                    {p.title || 'Untitled Song'}
                  </button>
                </li>
              ))
            )}
          </ul>
        </div>

        <SectionArranger />

        <div>
          <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-3 flex items-center gap-2">
            <Music className="w-4 h-4" />
            Genre Templates
          </h2>
          <div className="space-y-4 mt-2">
            {Object.entries(groupedTemplates).map(([genre, genreTemplates]) => (
              <div key={genre}>
                <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1 px-2">{genre}</h3>
                <ul className="space-y-1">
                  {genreTemplates.map((t) => (
                    <li key={t.id}>
                      <button
                         onClick={() => { setTemplateId(t.id); setCurrentArrangement(null); }}
                        className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                          currentTemplateId === t.id && !currentArrangementId
                            ? 'bg-indigo-500/10 text-indigo-400'
                            : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                        }`}
                      >
                        {t.name}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Bar-Aware Templates
            </h2>
            <button
              onClick={() => { setEditingTemplateId(null); setTemplateBuilderOpen(true); }}
              className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
              title="New Template"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>
          <div className="space-y-4 mt-2">
            {(() => {
              const allBarTemplates = [...Object.values(BAR_TEMPLATES), ...Object.values(customTemplates)];
              const grouped = allBarTemplates.reduce((acc, t) => {
                if (!acc[t.genre]) acc[t.genre] = [];
                acc[t.genre].push(t);
                return acc;
              }, {} as Record<string, typeof allBarTemplates>);
              return Object.entries(grouped).map(([genre, genreTemplates]) => (
                <div key={genre}>
                  <h3 className="text-[10px] font-bold text-zinc-600 uppercase tracking-wider mb-1 px-2">{genre}</h3>
                  <ul className="space-y-1">
                    {genreTemplates.map((t) => (
                      <li key={t.id}>
                        <button
                          onClick={() => {
                            setCurrentArrangement(t.id);
                            setTemplateId(null);
                            setStylePrompt(t.defaultStylePrompt);
                          }}
                          className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                            currentArrangementId === t.id
                              ? 'bg-indigo-500/10 text-indigo-400'
                              : 'text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200'
                          }`}
                        >
                          {t.name}
                          {t.isCustom && <span className="ml-1 text-[10px] text-zinc-600">(custom)</span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ));
            })()}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-zinc-800 space-y-2">
        {user ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 overflow-hidden">
              {user.photoURL ? (
                <img src={user.photoURL} alt="Avatar" className="w-6 h-6 rounded-full flex-shrink-0" />
              ) : (
                <div className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400 text-xs font-bold flex-shrink-0">
                  {user.email?.[0].toUpperCase()}
                </div>
              )}
              <span className="text-xs text-zinc-400 truncate">{user.email}</span>
            </div>
            <button onClick={logOut} className="p-1.5 text-zinc-500 hover:text-zinc-300 transition-colors" title="Log out">
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <button 
            onClick={signInWithGoogle}
            className="flex items-center justify-center gap-2 text-sm bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 transition-colors w-full py-2 rounded-md font-medium"
          >
            <LogIn className="w-4 h-4" />
            Sign In to Save
          </button>
        )}
      </div>
    </aside>
  );
}
