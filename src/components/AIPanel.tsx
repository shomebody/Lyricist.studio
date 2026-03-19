import { useState, useRef, useEffect } from 'react';
import { Send, Sparkles, Bot, User, Zap, BookOpen, Bug, Ruler, History, Wrench } from 'lucide-react';
import { useStore } from '../store/useStore';
import { GoogleGenAI } from '@google/genai';
import { RhymeDictionary } from './RhymeDictionary';
import { LyricDebugger } from './LyricDebugger';
import { PocketFitter } from './PocketFitter';
import { VersionHistory } from './VersionHistory';
import { SongFinisher } from './SongFinisher';

export function AIPanel() {
  const { chatHistory, addMessage, lyrics, currentTemplateId } = useStore();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'ai' | 'rhymes' | 'debug' | 'pocket' | 'history' | 'finish'>('ai');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (activeTab === 'ai') {
      scrollToBottom();
    }
  }, [chatHistory, activeTab]);

  const handleSend = async (overrideInput?: string) => {
    const textToSend = overrideInput || input;
    if (!textToSend.trim()) return;

    const userMsg = {
      id: Date.now().toString(),
      role: 'user' as const,
      content: textToSend,
      timestamp: Date.now(),
    };

    addMessage(userMsg);
    if (!overrideInput) setInput('');
    setIsLoading(true);

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      const systemInstruction = `
You are a professional songwriting co-writer embedded in a lyric editing tool.
You assist the songwriter — you never lead. You generate OPTIONS, not finished output.
You present 3-5 labeled alternatives (A through E) for every request and wait for selection.
You never commit a line without approval.

RULES:
1. Show, don't tell. Put the listener inside the experience.
2. Song titles resolve at the end of hooks for maximum impact.
3. Lyrics must work as lyrics first.
4. "Won't" over "can't" — defiance, not resignation.
5. Hyper-specificity over vague imagery.
6. One Breath Test: if a line can't be spoken in one natural breath, it's too dense.
7. Stressed syllables land on beats 1 and 3.

Current Lyrics Context:
${lyrics || '(No lyrics written yet)'}

Current Template: ${currentTemplateId || 'None'}
      `.trim();

      // Construct history for context
      const contents = chatHistory.map(msg => ({
        role: msg.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: msg.content }]
      }));
      
      // Add the new message
      contents.push({
        role: 'user',
        parts: [{ text: textToSend }]
      });

      const response = await ai.models.generateContent({
        model: 'gemini-3.1-pro-preview',
        contents,
        config: {
          systemInstruction,
          temperature: 0.7,
        },
      });

      if (response.text) {
        addMessage({
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: response.text,
          timestamp: Date.now(),
        });
      }
    } catch (error) {
      console.error('Gemini API Error:', error);
      addMessage({
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, I encountered an error processing your request.',
        timestamp: Date.now(),
      });
    } finally {
      setIsLoading(false);
    }
  };

  const quickActions = [
    { label: "Audit for Clichés", prompt: "Please audit my current lyrics for clichés, overused AI phrases, or weak imagery. Suggest specific, vivid alternatives." },
    { label: "Suggest Rhymes", prompt: "Look at the last line of my lyrics. Give me 5 interesting, non-obvious rhyme options (slant rhymes preferred) that fit the current theme." },
    { label: "Check Prosody", prompt: "Analyze the rhythm and syllable count of my lyrics. Are there any awkward phrasing or lines that won't flow well when sung? Suggest tweaks." },
    { label: "Suno Pocket Tricks", prompt: "Suggest Suno performance cues like (delay), (echo), or (drawn out) for my lyrics to help them stretch across bars or fit an offbeat pocket better." }
  ];

  return (
    <aside className="h-full bg-zinc-950 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-zinc-800 flex items-center justify-between">
        <div className="flex bg-zinc-900 p-1 rounded-lg w-full overflow-x-auto no-scrollbar">
          <button
            onClick={() => setActiveTab('ai')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'ai'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            AI
          </button>
          <button
            onClick={() => setActiveTab('debug')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'debug'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Bug className="w-3.5 h-3.5" />
            Debug
          </button>
          <button
            onClick={() => setActiveTab('pocket')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'pocket'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Ruler className="w-3.5 h-3.5" />
            Pocket
          </button>
          <button
            onClick={() => setActiveTab('rhymes')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'rhymes'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Rhymes
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'history'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            History
          </button>
          <button
            onClick={() => setActiveTab('finish')}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
              activeTab === 'finish'
                ? 'bg-zinc-800 text-indigo-400 shadow-sm'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            Finish
          </button>
        </div>
      </div>

      {activeTab === 'ai' ? (
        <>
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatHistory.length === 0 ? (
              <div className="text-center text-zinc-500 text-sm mt-10">
                <Bot className="w-8 h-8 mx-auto mb-3 opacity-50" />
                <p>I'm your AI co-writer.</p>
                <p className="mt-2 text-xs">Ask me for line suggestions, rhyme ideas, or a cliché audit.</p>
                
                <div className="mt-6 space-y-2">
                  {quickActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => handleSend(action.prompt)}
                      className="w-full text-left px-3 py-2 rounded-md bg-zinc-900 border border-zinc-800 hover:border-indigo-500/50 hover:bg-indigo-500/10 transition-colors text-xs text-zinc-300 flex items-center gap-2"
                    >
                      <Zap className="w-3 h-3 text-indigo-400" />
                      {action.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              chatHistory.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
                >
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
                    msg.role === 'user' ? 'bg-indigo-500/20 text-indigo-400' : 'bg-zinc-800 text-zinc-400'
                  }`}>
                    {msg.role === 'user' ? <User className="w-3 h-3" /> : <Bot className="w-3 h-3" />}
                  </div>
                  <div className={`text-sm p-3 rounded-lg max-w-[85%] ${
                    msg.role === 'user' ? 'bg-indigo-500/10 text-indigo-100' : 'bg-zinc-800/50 text-zinc-300'
                  }`}>
                    <div className="whitespace-pre-wrap">{msg.content}</div>
                  </div>
                </div>
              ))
            )}
            {isLoading && (
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-800 text-zinc-400 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-3 h-3" />
                </div>
                <div className="text-sm p-3 rounded-lg bg-zinc-800/50 text-zinc-400 animate-pulse">
                  Thinking...
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 border-t border-zinc-800">
            <div className="relative">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
                placeholder="Ask for suggestions..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded-lg pl-3 pr-10 py-2 text-sm focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none h-20"
              />
              <button
                onClick={() => handleSend()}
                disabled={!input.trim() || isLoading}
                className="absolute right-2 bottom-2 p-1.5 text-zinc-400 hover:text-indigo-400 disabled:opacity-50 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </>
      ) : activeTab === 'rhymes' ? (
        <RhymeDictionary />
      ) : activeTab === 'pocket' ? (
        <PocketFitter />
      ) : activeTab === 'history' ? (
        <VersionHistory />
      ) : activeTab === 'finish' ? (
        <SongFinisher />
      ) : (
        <LyricDebugger />
      )}
    </aside>
  );
}
