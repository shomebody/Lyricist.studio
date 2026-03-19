/**
 * arrangementStore.ts — Zustand store slice for bar-aware arrangement features.
 *
 * This is designed to work ALONGSIDE the existing useStore, not replace it.
 * It adds:
 *  - Bar-aware template selection (ArrangementTemplate)
 *  - Custom template management (create/edit/delete)
 *  - Mapped lines state (lyrics parsed against arrangement)
 *  - Arrangement stats (overflow detection, section status)
 *  - Version history (snapshots)
 *  - Rhyme scheme analysis per section
 *
 * Integration strategy:
 *  - Import this store where needed alongside useStore
 *  - The existing `currentTemplateId` in useStore still works for old templates
 *  - This store introduces `currentArrangement` for bar-aware templates
 *  - Components can check which system is active and render accordingly
 */

import { create } from 'zustand';
import {
  ArrangementTemplate,
  BAR_TEMPLATES,
  MappedLine,
  ArrangementStats,
  LyricSnapshot,
  SectionDefinition,
  RhymeAnalysis,
  createSnapshot,
  createSection,
  generateSectionId,
  mapLyricsToArrangement,
  computeArrangementStats,
  analyzeRhymeScheme,
  SectionType,
} from '../lib/arrangement';
import { countLineSyllables } from '../lib/syllables';

// ─── Store Interface ────────────────────────────────────────────────

interface ArrangementState {
  // Template system
  currentArrangementId: string | null;
  customTemplates: Record<string, ArrangementTemplate>;
  setCurrentArrangement: (id: string | null) => void;
  addCustomTemplate: (template: ArrangementTemplate) => void;
  updateCustomTemplate: (id: string, updates: Partial<ArrangementTemplate>) => void;
  deleteCustomTemplate: (id: string) => void;
  duplicateTemplate: (id: string, newName: string) => ArrangementTemplate;

  // Section editing within current template
  updateSection: (templateId: string, sectionId: string, updates: Partial<SectionDefinition>) => void;
  addSectionToTemplate: (templateId: string, section: SectionDefinition, afterSectionId?: string) => void;
  removeSectionFromTemplate: (templateId: string, sectionId: string) => void;
  reorderSections: (templateId: string, sectionIds: string[]) => void;

  // Mapped lines (computed from lyrics + arrangement)
  mappedLines: MappedLine[];
  arrangementStats: ArrangementStats | null;
  rhymeAnalyses: RhymeAnalysis[];
  recomputeMapping: (lyrics: string) => void;

  // Version history
  snapshots: LyricSnapshot[];
  addSnapshot: (lyrics: string, stylePrompt: string, templateId: string | null, label?: string) => void;
  deleteSnapshot: (id: string) => void;
  renameSnapshot: (id: string, label: string) => void;

  // UI state
  isTemplateBuilderOpen: boolean;
  setTemplateBuilderOpen: (open: boolean) => void;
  editingTemplateId: string | null;
  setEditingTemplateId: (id: string | null) => void;
  showBarAnnotations: boolean;
  setShowBarAnnotations: (show: boolean) => void;
}

// ─── Helper: Get template by ID from either built-in or custom ──────

function getTemplate(
  id: string | null,
  customTemplates: Record<string, ArrangementTemplate>
): ArrangementTemplate | null {
  if (!id) return null;
  return BAR_TEMPLATES[id] || customTemplates[id] || null;
}

// ─── Store ──────────────────────────────────────────────────────────

export const useArrangementStore = create<ArrangementState>((set, get) => ({
  // Template system
  currentArrangementId: null,
  customTemplates: {},

  setCurrentArrangement: (id) => {
    set({ currentArrangementId: id });
    // Trigger recomputation if we have lyrics context
    // (caller should also call recomputeMapping)
  },

  addCustomTemplate: (template) => {
    set((state) => ({
      customTemplates: { ...state.customTemplates, [template.id]: template },
    }));
  },

  updateCustomTemplate: (id, updates) => {
    set((state) => {
      const existing = state.customTemplates[id];
      if (!existing) return state;
      return {
        customTemplates: {
          ...state.customTemplates,
          [id]: { ...existing, ...updates, updatedAt: Date.now() },
        },
      };
    });
  },

  deleteCustomTemplate: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.customTemplates;
      return {
        customTemplates: rest,
        currentArrangementId: state.currentArrangementId === id ? null : state.currentArrangementId,
      };
    });
  },

  duplicateTemplate: (id, newName) => {
    const state = get();
    const source = getTemplate(id, state.customTemplates);
    if (!source) throw new Error(`Template ${id} not found`);

    const newId = `custom_${Date.now()}`;
    const duplicate: ArrangementTemplate = {
      ...source,
      id: newId,
      name: newName,
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      // Deep-clone sections with new IDs
      sections: source.sections.map((s) => ({
        ...s,
        id: generateSectionId(),
      })),
    };

    set((state) => ({
      customTemplates: { ...state.customTemplates, [newId]: duplicate },
    }));

    return duplicate;
  },

  // Section editing
  updateSection: (templateId, sectionId, updates) => {
    set((state) => {
      const template = state.customTemplates[templateId];
      if (!template) return state; // Can only edit custom templates
      return {
        customTemplates: {
          ...state.customTemplates,
          [templateId]: {
            ...template,
            updatedAt: Date.now(),
            sections: template.sections.map((s) =>
              s.id === sectionId ? { ...s, ...updates } : s
            ),
          },
        },
      };
    });
  },

  addSectionToTemplate: (templateId, section, afterSectionId) => {
    set((state) => {
      const template = state.customTemplates[templateId];
      if (!template) return state;

      const sections = [...template.sections];
      if (afterSectionId) {
        const idx = sections.findIndex((s) => s.id === afterSectionId);
        if (idx >= 0) {
          sections.splice(idx + 1, 0, section);
        } else {
          sections.push(section);
        }
      } else {
        sections.push(section);
      }

      return {
        customTemplates: {
          ...state.customTemplates,
          [templateId]: { ...template, sections, updatedAt: Date.now() },
        },
      };
    });
  },

  removeSectionFromTemplate: (templateId, sectionId) => {
    set((state) => {
      const template = state.customTemplates[templateId];
      if (!template) return state;
      return {
        customTemplates: {
          ...state.customTemplates,
          [templateId]: {
            ...template,
            sections: template.sections.filter((s) => s.id !== sectionId),
            updatedAt: Date.now(),
          },
        },
      };
    });
  },

  reorderSections: (templateId, sectionIds) => {
    set((state) => {
      const template = state.customTemplates[templateId];
      if (!template) return state;

      const sectionMap = new Map(template.sections.map((s) => [s.id, s]));
      const reordered = sectionIds
        .map((id) => sectionMap.get(id))
        .filter(Boolean) as SectionDefinition[];

      return {
        customTemplates: {
          ...state.customTemplates,
          [templateId]: { ...template, sections: reordered, updatedAt: Date.now() },
        },
      };
    });
  },

  // Mapped lines
  mappedLines: [],
  arrangementStats: null,
  rhymeAnalyses: [],

  recomputeMapping: (lyrics) => {
    const state = get();
    const template = getTemplate(state.currentArrangementId, state.customTemplates);

    const mapped = mapLyricsToArrangement(lyrics, template, countLineSyllables);
    const stats = template ? computeArrangementStats(mapped, template) : null;

    // Compute rhyme analysis per section using mappedLines data
    const rhymeAnalyses: RhymeAnalysis[] = [];

    // Group mapped lines by section (using sectionId from the template mapping,
    // or by structural tags if no template is active)
    const sectionGroups = new Map<string, { id: string; label: string; lines: { text: string; index: number }[] }>();

    for (const line of mapped) {
      if (line.isStructuralTag || line.isBlankLine || !line.text.trim()) continue;

      const trimmed = line.text.trim();
      // Skip fully-parenthetical lines (call-and-response cues)
      if (/^\([^)]+\)$/.test(trimmed)) continue;

      // Strip echo tails before rhyme analysis so "meditation (tation)"
      // gets its rhyme letter from "meditation", not "tation"
      const echoMatch = trimmed.match(/^(.+?)\s*\([^)]+\)\s*$/);
      let cleanText = trimmed;
      if (echoMatch) {
        const mainText = echoMatch[1].trim();
        const parenText = echoMatch[2] || '';
        // Only strip if the paren content echoes the main text
        const mainWords = mainText.toLowerCase().split(/\s+/);
        const lastWord = mainWords[mainWords.length - 1] || '';
        if (mainText.toLowerCase().endsWith(parenText.toLowerCase()) ||
            (lastWord.length > 3 && lastWord.endsWith(parenText.toLowerCase()))) {
          cleanText = mainText;
        }
      }

      const key = line.sectionId || line.sectionLabel || '__untagged__';
      const label = line.sectionLabel || 'Untagged';

      if (!sectionGroups.has(key)) {
        sectionGroups.set(key, { id: key, label, lines: [] });
      }
      sectionGroups.get(key)!.lines.push({ text: cleanText, index: line.lineIndex });
    }

    for (const [, group] of sectionGroups) {
      if (group.lines.length >= 2) {
        const { pattern, groups } = analyzeRhymeScheme(group.lines.map(l => l.text));
        rhymeAnalyses.push({
          sectionId: group.id,
          sectionLabel: group.label,
          pattern,
          lineRhymeGroups: groups.map((g) => ({
            ...g,
            lineIndex: group.lines[g.lineIndex].index,
          })),
        });
      }
    }

    set({ mappedLines: mapped, arrangementStats: stats, rhymeAnalyses });
  },

  // Version history
  snapshots: [],

  addSnapshot: (lyrics, stylePrompt, templateId, label) => {
    const snap = createSnapshot(lyrics, stylePrompt, templateId, label);
    set((state) => ({
      snapshots: [snap, ...state.snapshots].slice(0, 50), // keep max 50
    }));
  },

  deleteSnapshot: (id) => {
    set((state) => ({
      snapshots: state.snapshots.filter((s) => s.id !== id),
    }));
  },

  renameSnapshot: (id, label) => {
    set((state) => ({
      snapshots: state.snapshots.map((s) => (s.id === id ? { ...s, label } : s)),
    }));
  },

  // UI state
  isTemplateBuilderOpen: false,
  setTemplateBuilderOpen: (open) => set({ isTemplateBuilderOpen: open }),
  editingTemplateId: null,
  setEditingTemplateId: (id) => set({ editingTemplateId: id }),
  showBarAnnotations: true,
  setShowBarAnnotations: (show) => set({ showBarAnnotations: show }),
}));

// ─── Selectors ──────────────────────────────────────────────────────

export const selectCurrentArrangement = (state: ArrangementState) =>
  getTemplate(state.currentArrangementId, state.customTemplates);

export const selectAllTemplates = (state: ArrangementState): ArrangementTemplate[] => [
  ...Object.values(BAR_TEMPLATES),
  ...Object.values(state.customTemplates),
];

export const selectTemplatesByGenre = (state: ArrangementState) => {
  const all = selectAllTemplates(state);
  return all.reduce((acc, t) => {
    if (!acc[t.genre]) acc[t.genre] = [];
    acc[t.genre].push(t);
    return acc;
  }, {} as Record<string, ArrangementTemplate[]>);
};

export const selectOverflowSections = (state: ArrangementState) => {
  if (!state.arrangementStats) return [];
  return state.arrangementStats.sectionBreakdown.filter((s) => s.status === 'over');
};

export const selectEmptySections = (state: ArrangementState) => {
  if (!state.arrangementStats) return [];
  return state.arrangementStats.sectionBreakdown.filter((s) => s.status === 'empty');
};
