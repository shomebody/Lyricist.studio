/**
 * TemplateBuilder.tsx — Custom arrangement template builder.
 *
 * A panel/modal for creating and editing bar-aware templates.
 * Features:
 *  - Add/remove/reorder sections (drag handles)
 *  - Adjust bars, linesPerBar, syllable targets per section
 *  - Set BPM, genre, style prompt
 *  - Preview total arrangement (bars + estimated duration)
 *  - Duplicate from existing templates as starting point
 *  - Save as custom template
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  useArrangementStore,
  selectCurrentArrangement,
} from '../store/arrangementStore';
import {
  ArrangementTemplate,
  SectionDefinition,
  SectionType,
  SECTION_COLORS,
  SECTION_DEFAULTS,
  BAR_TEMPLATES,
  createSection,
  generateSectionId,
} from '../lib/arrangement';
import {
  Plus,
  Trash2,
  GripVertical,
  Copy,
  Save,
  X,
  Music,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

const SECTION_TYPE_OPTIONS: { value: SectionType; label: string }[] = [
  { value: 'intro', label: 'Intro' },
  { value: 'verse', label: 'Verse' },
  { value: 'pre-chorus', label: 'Pre-Chorus' },
  { value: 'chorus', label: 'Chorus' },
  { value: 'post-chorus', label: 'Post-Chorus' },
  { value: 'bridge', label: 'Bridge' },
  { value: 'breakdown', label: 'Breakdown' },
  { value: 'drop', label: 'Drop' },
  { value: 'instrumental', label: 'Instrumental' },
  { value: 'hook', label: 'Hook' },
  { value: 'outro', label: 'Outro' },
  { value: 'ad-lib', label: 'Ad-Lib' },
  { value: 'custom', label: 'Custom' },
];

interface TemplateBuilderProps {
  onClose: () => void;
  initialTemplateId?: string | null;
}

export function TemplateBuilder({ onClose, initialTemplateId }: TemplateBuilderProps) {
  const {
    customTemplates,
    addCustomTemplate,
    updateCustomTemplate,
  } = useArrangementStore();

  // Working copy of the template being edited
  const [template, setTemplate] = useState<ArrangementTemplate>(() => {
    // If editing an existing custom template, load it
    if (initialTemplateId && customTemplates[initialTemplateId]) {
      return { ...customTemplates[initialTemplateId] };
    }
    // If cloning a built-in template
    if (initialTemplateId && BAR_TEMPLATES[initialTemplateId]) {
      const source = BAR_TEMPLATES[initialTemplateId];
      return {
        ...source,
        id: `custom_${Date.now()}`,
        name: `${source.name} (Custom)`,
        isCustom: true,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        sections: source.sections.map((s) => ({ ...s, id: generateSectionId() })),
      };
    }
    // New blank template
    return {
      id: `custom_${Date.now()}`,
      name: 'New Template',
      genre: 'Custom',
      bpm: 120,
      description: '',
      defaultStylePrompt: '',
      isCustom: true,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      sections: [
        createSection('verse', 'Verse 1'),
        createSection('chorus', 'Chorus'),
      ],
    };
  });

  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const totalBars = template.sections.reduce((sum, s) => sum + s.bars, 0);
  const estimatedDuration = (totalBars * 4 * 60) / (template.bpm || 120);
  const durationMin = Math.floor(estimatedDuration / 60);
  const durationSec = Math.round(estimatedDuration % 60);

  // Section operations
  const updateSectionField = (sectionId: string, field: keyof SectionDefinition, value: any) => {
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId ? { ...s, [field]: value } : s
      ),
    }));
  };

  const addSection = (afterIndex: number) => {
    const newSection = createSection('verse', `Section ${template.sections.length + 1}`);
    setTemplate((prev) => {
      const sections = [...prev.sections];
      sections.splice(afterIndex + 1, 0, newSection);
      return { ...prev, sections };
    });
    setExpandedSection(newSection.id);
  };

  const removeSection = (sectionId: string) => {
    if (template.sections.length <= 1) return; // keep at least one
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.filter((s) => s.id !== sectionId),
    }));
  };

  const moveSection = (fromIdx: number, toIdx: number) => {
    if (fromIdx === toIdx) return;
    setTemplate((prev) => {
      const sections = [...prev.sections];
      const [moved] = sections.splice(fromIdx, 1);
      sections.splice(toIdx, 0, moved);
      return { ...prev, sections };
    });
  };

  const changeSectionType = (sectionId: string, newType: SectionType) => {
    const defaults = SECTION_DEFAULTS[newType];
    setTemplate((prev) => ({
      ...prev,
      sections: prev.sections.map((s) =>
        s.id === sectionId
          ? {
              ...s,
              type: newType,
              color: SECTION_COLORS[newType],
              bars: defaults.bars,
              linesPerBar: defaults.linesPerBar,
              syllableTarget: defaults.syllableTarget,
              syllableTolerance: defaults.syllableTolerance,
              description: defaults.description,
            }
          : s
      ),
    }));
  };

  const handleSave = () => {
    const toSave = { ...template, updatedAt: Date.now() };
    if (customTemplates[toSave.id]) {
      updateCustomTemplate(toSave.id, toSave);
    } else {
      addCustomTemplate(toSave);
    }
    onClose();
  };

  // Drag handlers (simple index swap)
  const handleDragStart = (idx: number) => setDragIndex(idx);
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIndex !== null && dragIndex !== idx) {
      moveSection(dragIndex, idx);
      setDragIndex(idx);
    }
  };
  const handleDragEnd = () => setDragIndex(null);

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-zinc-800">
          <div className="flex items-center gap-3">
            <Music className="w-5 h-5 text-indigo-400" />
            <h2 className="text-lg font-bold text-zinc-100">Template Builder</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* Template metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Template Name
              </label>
              <input
                type="text"
                value={template.name}
                onChange={(e) => setTemplate((p) => ({ ...p, name: e.target.value }))}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Genre
              </label>
              <input
                type="text"
                value={template.genre}
                onChange={(e) => setTemplate((p) => ({ ...p, genre: e.target.value }))}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                BPM
              </label>
              <input
                type="number"
                min={40}
                max={200}
                value={template.bpm}
                onChange={(e) => setTemplate((p) => ({ ...p, bpm: parseInt(e.target.value) || 120 }))}
                className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div className="flex items-end pb-1 text-xs text-zinc-400 gap-2">
              <Clock className="w-3.5 h-3.5" />
              {totalBars} bars · ~{durationMin}:{durationSec.toString().padStart(2, '0')}
            </div>
          </div>

          <div>
            <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
              Default Style Prompt
            </label>
            <textarea
              value={template.defaultStylePrompt}
              onChange={(e) => setTemplate((p) => ({ ...p, defaultStylePrompt: e.target.value }))}
              className="mt-1 w-full bg-zinc-800 border border-zinc-700 rounded-md px-3 py-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 resize-none h-16"
              placeholder="e.g. Progressive house, 128 BPM, euphoric synth leads..."
            />
          </div>

          {/* Sections */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">
                Sections
              </label>
              <button
                onClick={() => addSection(template.sections.length - 1)}
                className="flex items-center gap-1 px-2 py-1 text-xs text-indigo-400 hover:bg-indigo-500/10 rounded-md transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add Section
              </button>
            </div>

            <div className="space-y-1">
              {template.sections.map((section, idx) => {
                const isExpanded = expandedSection === section.id;
                const maxLines = Math.ceil(section.bars * section.linesPerBar);

                return (
                  <div
                    key={section.id}
                    draggable
                    onDragStart={() => handleDragStart(idx)}
                    onDragOver={(e) => handleDragOver(e, idx)}
                    onDragEnd={handleDragEnd}
                    className={`border rounded-lg transition-colors ${
                      dragIndex === idx
                        ? 'border-indigo-500 bg-indigo-500/5'
                        : 'border-zinc-800 bg-zinc-850'
                    }`}
                  >
                    {/* Section header (always visible) */}
                    <div className="flex items-center gap-2 px-3 py-2">
                      <GripVertical className="w-4 h-4 text-zinc-600 cursor-grab flex-shrink-0" />

                      <div
                        className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: section.color }}
                      />

                      <select
                        value={section.type}
                        onChange={(e) => changeSectionType(section.id, e.target.value as SectionType)}
                        className="bg-transparent text-sm font-medium text-zinc-200 focus:outline-none cursor-pointer"
                      >
                        {SECTION_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value} className="bg-zinc-900">
                            {opt.label}
                          </option>
                        ))}
                      </select>

                      <input
                        type="text"
                        value={section.label}
                        onChange={(e) => updateSectionField(section.id, 'label', e.target.value)}
                        className="bg-transparent text-sm text-zinc-300 focus:outline-none focus:border-b focus:border-indigo-500 w-28"
                      />

                      <div className="flex-1" />

                      <span className="text-xs text-zinc-500">
                        {section.bars}b · {maxLines}L · {section.syllableTarget}syl
                      </span>

                      <button
                        onClick={() => setExpandedSection(isExpanded ? null : section.id)}
                        className="p-1 hover:bg-zinc-800 rounded text-zinc-500 hover:text-zinc-300 transition-colors"
                      >
                        {isExpanded ? (
                          <ChevronUp className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronDown className="w-3.5 h-3.5" />
                        )}
                      </button>

                      <button
                        onClick={() => removeSection(section.id)}
                        disabled={template.sections.length <= 1}
                        className="p-1 hover:bg-red-500/10 rounded text-zinc-600 hover:text-red-400 transition-colors disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Expanded detail editor */}
                    {isExpanded && (
                      <div className="px-3 pb-3 pt-1 border-t border-zinc-800 space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase">
                              Bars
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={32}
                              value={section.bars}
                              onChange={(e) =>
                                updateSectionField(section.id, 'bars', parseInt(e.target.value) || 4)
                              }
                              className="mt-0.5 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase">
                              Lines/Bar
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={4}
                              step={0.25}
                              value={section.linesPerBar}
                              onChange={(e) =>
                                updateSectionField(
                                  section.id,
                                  'linesPerBar',
                                  parseFloat(e.target.value) || 0
                                )
                              }
                              className="mt-0.5 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase">
                              Syllables
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={20}
                              value={section.syllableTarget}
                              onChange={(e) =>
                                updateSectionField(
                                  section.id,
                                  'syllableTarget',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="mt-0.5 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-500 uppercase">
                              Tolerance ±
                            </label>
                            <input
                              type="number"
                              min={0}
                              max={5}
                              value={section.syllableTolerance}
                              onChange={(e) =>
                                updateSectionField(
                                  section.id,
                                  'syllableTolerance',
                                  parseInt(e.target.value) || 0
                                )
                              }
                              className="mt-0.5 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div>
                          <label className="text-[10px] font-semibold text-zinc-500 uppercase">
                            Writer's Note
                          </label>
                          <input
                            type="text"
                            value={section.description || ''}
                            onChange={(e) =>
                              updateSectionField(section.id, 'description', e.target.value)
                            }
                            placeholder="e.g. Build tension here. Rising energy."
                            className="mt-0.5 w-full bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-sm text-zinc-300 focus:outline-none focus:border-indigo-500"
                          />
                        </div>

                        <div className="flex items-center gap-2 text-[10px] text-zinc-500">
                          <span>
                            Target: {maxLines} line{maxLines !== 1 ? 's' : ''} ×{' '}
                            {section.syllableTarget} syllables (±{section.syllableTolerance})
                          </span>
                          <span className="text-zinc-700">|</span>
                          <span>
                            Suno export: [{section.label} {section.bars}]
                          </span>
                        </div>

                        {/* Add section after this one */}
                        <button
                          onClick={() => addSection(idx)}
                          className="flex items-center gap-1 px-2 py-1 text-[10px] text-zinc-500 hover:text-indigo-400 hover:bg-indigo-500/5 rounded transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          Insert section after
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-zinc-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-medium rounded-md transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Template
          </button>
        </div>
      </div>
    </div>
  );
}
