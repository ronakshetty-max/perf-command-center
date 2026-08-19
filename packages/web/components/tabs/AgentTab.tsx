"use client";

import { useState, useRef, useEffect } from "react";
import InsightsPanel from "./InsightsPanel";
import BrainMemoryPanel from "./BrainMemoryPanel";

interface Message {
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

interface BrainAction {
  priority: string;
  category: string;
  confidence: string;
  campaign: string;
  level: string;
  title: string;
  action: string;
  reasoning: string;
  expected_impact: string;
}

const QUICK_PROMPTS = [
  "My monthly payment target has been revised to 300. What needs to change?",
  "Which campaigns have the highest opportunity to scale (low CPP + low IS)?",
  "Show me the top 3 campaigns I should increase budget on and by how much.",
  "Where is spend being wasted — high spend campaigns with zero/low payments?",
  "What does the impression share data tell us about competition?",
  "Compare Brand vs Generic category efficiency — where should I shift budget?",
  "Give me a daily breakdown of CPP trends — are we improving or degrading?",
  "If I have ₹2L extra budget this week, where should it go for max payments?",
];

function renderMarkdown(text: string): string {
  const lines = text.split("\n");
  const html: string[] = [];
  let inTable = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Table rows
    if (line.trim().startsWith("|") && line.trim().endsWith("|")) {
      const cells = line.split("|").filter(c => c.trim() !== "");
      // Skip separator rows
      if (cells.every(c => c.trim().match(/^[-:]+$/))) continue;
      if (!inTable) {
        html.push('<table class="w-full border-collapse my-2 text-[0.72rem]">');
        inTable = true;
      }
      const isHeader = i + 1 < lines.length && lines[i + 1].trim().match(/^\|[-:|\s]+\|$/);
      const tag = isHeader ? "th" : "td";
      const cellClass = isHeader
        ? "border border-border-subtle px-2 py-1.5 bg-bg-hover text-text-dimmed font-semibold text-left"
        : "border border-border-subtle px-2 py-1.5";
      html.push(`<tr>${cells.map(c => `<${tag} class="${cellClass}">${formatInline(c.trim())}</${tag}>`).join("")}</tr>`);
      continue;
    } else if (inTable) {
      html.push("</table>");
      inTable = false;
    }

    // Headings
    if (line.startsWith("### ")) { html.push(`<h3 class="text-[0.88rem] font-bold text-white mt-3 mb-1">${formatInline(line.slice(4))}</h3>`); continue; }
    if (line.startsWith("## ")) { html.push(`<h2 class="text-[0.92rem] font-bold text-white mt-3 mb-1">${formatInline(line.slice(3))}</h2>`); continue; }
    if (line.startsWith("# ")) { html.push(`<h1 class="text-[0.96rem] font-bold text-white mt-3 mb-1">${formatInline(line.slice(2))}</h1>`); continue; }

    // Horizontal rule
    if (line.trim().match(/^---+$/)) { html.push('<hr class="border-border-subtle my-3"/>'); continue; }

    // List items
    if (line.match(/^[-*] /)) { html.push(`<div class="ml-3 my-0.5 text-[0.8rem] text-text-secondary">• ${formatInline(line.slice(2))}</div>`); continue; }
    if (line.match(/^\d+\. /)) { const num = line.match(/^(\d+)\. /); html.push(`<div class="ml-3 my-0.5 text-[0.8rem] text-text-secondary">${num?.[1]}. ${formatInline(line.slice(line.indexOf(". ") + 2))}</div>`); continue; }

    // Empty line = paragraph break
    if (line.trim() === "") { html.push('<div class="h-2"></div>'); continue; }

    // Regular paragraph
    html.push(`<p class="text-[0.8rem] text-text-secondary my-0.5">${formatInline(line)}</p>`);
  }

  if (inTable) html.push("</table>");
  return html.join("");
}

function formatInline(text: string): string {
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code class="bg-bg-elevated px-1 py-0.5 rounded text-blue-300 text-[0.7rem]">$1</code>');
}

export default function AgentTab({ product = "domestic_pg" }: { product?: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [brainActions, setBrainActions] = useState<BrainAction[]>([]);
  const [brainLoading, setBrainLoading] = useState(false);
  const [brainGeneratedAt, setBrainGeneratedAt] = useState<string>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const runBrain = async () => {
    setBrainLoading(true);
    try {
      const res = await fetch("/api/brain", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ product }),
      });
      const data = await res.json();
      if (data.actions) {
        setBrainActions(data.actions);
        setBrainGeneratedAt(data.generated_at);
      }
    } catch { /* silent */ }
    setBrainLoading(false);
  };

  useEffect(() => {
    runBrain();
  }, [product]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: Message = { role: "user", content: messageText, timestamp: new Date() };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: messageText, history }),
      });

      const data = await res.json();

      if (res.ok) {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: data.response,
          timestamp: new Date(),
        }]);
      } else {
        setMessages(prev => [...prev, {
          role: "assistant",
          content: `Error: ${data.error || "Failed to get response"}. Please check that ANTHROPIC_API_KEY is set in your environment.`,
          timestamp: new Date(),
        }]);
      }
    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Network error — couldn't reach the AI agent. Make sure the server is running.",
        timestamp: new Date(),
      }]);
    }

    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-280px)] min-h-[500px]">
      {/* Header */}
      <div className="card p-3 mb-3">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
            <span className="text-white text-[0.8rem] font-bold">AI</span>
          </div>
          <div>
            <h3 className="text-[0.9rem] font-semibold text-white">Performance Marketing Brain</h3>
            <p className="text-[0.7rem] text-text-dimmed">Autonomous growth marketer — reads data, analyzes market signals, makes decisions</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="bg-green-950/60 border border-green-800/40 text-green-400 text-[0.62rem] font-semibold px-2 py-0.5 rounded-full">
              DATA CONNECTED
            </span>
          </div>
        </div>
      </div>

      {/* Brain Memory — shows learning status */}
      <BrainMemoryPanel product={product} />

      {/* Brain Insights */}
      <InsightsPanel actions={brainActions} loading={brainLoading} onRefresh={runBrain} generatedAt={brainGeneratedAt} product={product} />

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-3 pr-1">
        {messages.length === 0 && (
          <div className="text-center py-8">
            <p className="text-text-secondary text-[0.9rem] mb-4">Ask me anything about Rize campaign performance</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-w-3xl mx-auto">
              {QUICK_PROMPTS.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(prompt)}
                  className="text-left px-3 py-2.5 rounded-lg bg-bg-card border border-border-subtle hover:border-blue-500/40 hover:bg-bg-hover transition-all text-[0.76rem] text-text-muted hover:text-text-secondary"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-xl px-4 py-3 ${
              msg.role === "user"
                ? "bg-blue-600/20 border border-blue-500/30 text-blue-100"
                : "bg-bg-card border border-border-subtle text-text-secondary"
            }`}>
              {msg.role === "assistant" ? (
                <div
                  className="text-[0.8rem] leading-relaxed prose-sm"
                  dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }}
                />
              ) : (
                <p className="text-[0.82rem]">{msg.content}</p>
              )}
              <p className="text-[0.6rem] text-text-dimmed mt-2">
                {msg.timestamp.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </p>
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-bg-card border border-border-subtle rounded-xl px-4 py-3">
              <div className="flex gap-1.5">
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
              <p className="text-[0.68rem] text-text-dimmed mt-1.5">Analyzing campaign data...</p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="card p-3">
        <div className="flex gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about campaign performance, targets, opportunities..."
            className="flex-1 bg-bg-hover border border-border-subtle rounded-lg px-3 py-2.5 text-[0.82rem] text-text-secondary placeholder:text-text-dimmed resize-none focus:outline-none focus:border-blue-500/50 min-h-[44px] max-h-[120px]"
            rows={1}
          />
          <button
            onClick={() => sendMessage()}
            disabled={isLoading || !input.trim()}
            className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-semibold text-[0.82rem] hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {isLoading ? "..." : "Send"}
          </button>
        </div>
        {messages.length > 0 && (
          <div className="flex gap-2 mt-2 flex-wrap">
            {QUICK_PROMPTS.slice(0, 3).map((p, i) => (
              <button
                key={i}
                onClick={() => sendMessage(p)}
                disabled={isLoading}
                className="text-[0.66rem] px-2 py-1 rounded bg-bg-hover border border-border-subtle text-text-dimmed hover:text-text-muted hover:border-border-medium transition-colors disabled:opacity-40"
              >
                {p.substring(0, 50)}...
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
