import React, { useState, useEffect } from 'react';
import { Reorder, useDragControls } from 'framer-motion';
import { GripVertical, Trash2, Plus, ChevronDown, ListTree } from 'lucide-react';
import { useStore } from '../store/useStore';
import { useArrangementStore, selectCurrentArrangement } from '../store/arrangementStore';
import { parseStructuralTag, SECTION_COLORS, SectionType } from '../lib/arrangement';

interface SectionBlock {
  id: string;
  tag: string;
  sectionType: SectionType | 'untagged';
  lines: string[];
  lineCount: number;
  startLine: number;
  previewLines: string[];
}

function parseLyricsIntoBlocks(lyrics: string): SectionBlock[] {
  const lines = lyrics.split('\n');
  const blocks: SectionBlock[] = [];
  
  let currentBlock: SectionBlock | null = null;
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    const tag = parseStructuralTag(trimmed);
    
    if (tag) {
      if (currentBlock) {
        blocks.push(currentBlock);
      }
      currentBlock = {
        id: `block-${i}-${Math.random().toString(36).substr(2, 9)}`,
        tag: trimmed,
        sectionType: tag.type,
        lines: [],
        lineCount: 0,
        startLine: i,
        previewLines: [],
      };
    } else {
      if (!currentBlock) {
        currentBlock = {
          id: `block-untagged-${Math.random().toString(36).substr(2, 9)}`,
          tag: 'Untagged',
          sectionType: 'untagged',
          lines: [line],
          lineCount: trimmed ? 1 : 0,
          startLine: i,
          previewLines: trimmed ? [trimmed] : [],
        };
      } else {
        currentBlock.lines.push(line);
        if (trimmed) {
          currentBlock.lineCount++;
          if (currentBlock.previewLines.length < 2) {
            currentBlock.previewLines.push(trimmed);
          }
        }
      }
    }
  }
  
  if (currentBlock) {
    // Don't add an empty untagged block
    if (currentBlock.sectionType === 'untagged' && currentBlock.lines.join('').trim() === '') {
      return blocks;
    }
    blocks.push(currentBlock);
  }
  
  return blocks;
}

function buildLyricsFromBlocks(blocks: SectionBlock[]): string {
  return blocks.map(b => {
    const content = b.sectionType === 'untagged' ? b.lines.join('\n') : [b.tag, ...b.lines].join('\n');
    return content.trimEnd();
  }).filter(Boolean).join('\n\n') + '\n';
}

const SectionItem: React.FC<{ 
  block: SectionBlock; 
  onDelete: (id: string) => void;
  onClick: (line: number) => void;
}> = ({ 
  block, 
  onDelete, 
  onClick 
}) => {
  const dragControls = useDragControls();
  const activeTemplate = useArrangementStore(selectCurrentArrangement);
  
  const color = block.sectionType === 'untagged' ? '#a1a1aa' : (SECTION_COLORS[block.sectionType] || '#a1a1aa');
  
  let statsText = '';
  if (activeTemplate && block.sectionType !== 'untagged') {
    const templateSection = activeTemplate.sections.find(s => s.type === block.sectionType);
    if (templateSection) {
      statsText = `${templateSection.bars} bars • ${templateSection.syllableTarget} syl/line`;
    }
  }

  return (
    <Reorder.Item
      value={block}
      id={block.id}
      dragListener={false}
      dragControls={dragControls}
      className="bg-zinc-900 border border-zinc-800 rounded-md mb-2 overflow-hidden flex flex-col select-none"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
    >
      <div className="flex items-stretch">
        <div 
          className="w-6 flex items-center justify-center cursor-grab active:cursor-grabbing hover:bg-zinc-800 transition-colors"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="w-3.5 h-3.5 text-zinc-500" />
        </div>
        
        <div 
          className="flex-1 p-2 cursor-pointer hover:bg-zinc-800/50 transition-colors border-l border-zinc-800"
          onClick={() => onClick(block.startLine + 1)}
        >
          <div className="flex items-center justify-between mb-1">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
              <span className="font-medium text-zinc-200 text-xs">{block.tag}</span>
            </div>
            <div className="flex items-center gap-2">
              {statsText && (
                <span className="text-[10px] text-zinc-500">{statsText}</span>
              )}
              <span className="text-[10px] text-zinc-500 bg-zinc-800 px-1.5 py-0.5 rounded-full">
                {block.lineCount} lines
              </span>
              <button 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(block.id);
                }}
                className="text-zinc-500 hover:text-red-400 transition-colors p-1 rounded-md hover:bg-zinc-800"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
          
          {block.previewLines.length > 0 ? (
            <div className="text-[10px] text-zinc-400 line-clamp-2 leading-relaxed">
              {block.previewLines.map((line, i) => (
                <div key={i} className="truncate">{line}</div>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-zinc-600 italic">Empty section</div>
          )}
        </div>
      </div>
    </Reorder.Item>
  );
};

export const SectionArranger = () => {
  const { lyrics, setLyrics, scrollToLine } = useStore();
  const [blocks, setBlocks] = useState<SectionBlock[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  
  useEffect(() => {
    setBlocks(parseLyricsIntoBlocks(lyrics));
  }, [lyrics]);

  const handleReorder = (newBlocks: SectionBlock[]) => {
    setBlocks(newBlocks);
    setLyrics(buildLyricsFromBlocks(newBlocks));
  };

  const handleDelete = (id: string) => {
    const newBlocks = blocks.filter(b => b.id !== id);
    setBlocks(newBlocks);
    setLyrics(buildLyricsFromBlocks(newBlocks));
  };

  const handleAddSection = (type: SectionType) => {
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const newTag = `[${label}]`;
    
    let newLyrics = lyrics;
    if (newLyrics) {
      newLyrics += newLyrics.endsWith('\n\n') ? '' : newLyrics.endsWith('\n') ? '\n' : '\n\n';
    }
    newLyrics += newTag + '\n';
    
    setLyrics(newLyrics);
    setIsAdding(false);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-zinc-500 uppercase tracking-wider flex items-center gap-2">
          <ListTree className="w-4 h-4" />
          Song Structure
        </h2>
        
        <div className="relative">
          <button 
            onClick={() => setIsAdding(!isAdding)}
            className="p-1 hover:bg-zinc-800 rounded-md text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
            title="Add Section"
          >
            <Plus className="w-4 h-4" />
          </button>
          
          {isAdding && (
            <div className="absolute right-0 top-full mt-1 w-40 bg-zinc-900 border border-zinc-700 rounded-md shadow-xl z-50 overflow-hidden">
              <div className="max-h-64 overflow-y-auto py-1">
                {(Object.keys(SECTION_COLORS) as SectionType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => handleAddSection(type)}
                    className="w-full text-left px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white flex items-center gap-2"
                  >
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: SECTION_COLORS[type] }} />
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
      
      <div className="px-1">
        {blocks.length === 0 ? (
          <div className="text-center text-zinc-500 text-xs italic py-2">
            No sections found. Add tags like [Verse 1] to your lyrics.
          </div>
        ) : (
          <Reorder.Group axis="y" values={blocks} onReorder={handleReorder} className="space-y-0">
            {blocks.map(block => (
              <SectionItem 
                key={block.id} 
                block={block} 
                onDelete={handleDelete}
                onClick={(line) => scrollToLine?.(line)}
              />
            ))}
          </Reorder.Group>
        )}
      </div>
    </div>
  );
};
