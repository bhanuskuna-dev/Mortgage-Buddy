"use client";

import { useState, useRef, useEffect } from "react";
import { Send, Loader2, BookOpen, ChevronDown, ChevronRight } from "lucide-react";
import { logTrace, computeCost } from "@/lib/observability";

interface Message {
  role: "user" | "assistant";
  content: string;
  sources?: { index: number; source: string }[];
  confidence?: number;
}

const STARTERS = [
  "What is the maximum DTI ratio for a Qualified Mortgage?",
  "When is PMI required and how can I avoid it?",
  "What credit score do I need for an FHA loan?",
  "How does self-employment affect my mortgage application?",
  "What is the difference between conventional and FHA loans?",
];

function SourcesAccordion({ sources }: { sources: { index: number; source: string }[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-2 text-xs">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1 text-slate-500 hover:text-slate-300"
      >
        <BookOpen className="w-3 h-3" />
        {sources.length} source{sources.length !== 1 ? "s" : ""}
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
      </button>
      {open && (
        <div className="mt-1 space-y-0.5 pl-4">
          {sources.map((s) => (
            <div key={s.index} className="text-slate-500">[Source {s.index}] {s.source}</div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MortgageCoach() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const send = async (text: string) => {
    if (!text.trim() || streaming) return;
    setInput("");
    setStreaming(true);

    const userMsg: Message = { role: "user", content: text };
    setMessages((prev) => [...prev, userMsg]);

    const assistantMsg: Message = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, assistantMsg]);

    const start = performance.now();
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          history: messages.map((m) => ({ role: m.role, content: m.content })),
        }),
      });

      if (!res.body) throw new Error("No stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = JSON.parse(line.slice(6));

          if (json.t === "blocked") {
            setMessages((prev) => {
              const updated = [...prev];
              updated[updated.length - 1] = { role: "assistant", content: `⚠️ ${json.reason}` };
              return updated;
            });
          } else if (json.t === "d") {
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              updated[updated.length - 1] = { ...last, content: last.content + json.v };
              return updated;
            });
          } else if (json.t === "r") {
            const latencyMs = Math.round(performance.now() - start);
            setMessages((prev) => {
              const updated = [...prev];
              const last = updated[updated.length - 1];
              // Strip CONFIDENCE line from displayed text
              const cleanContent = last.content.replace(/\nCONFIDENCE:.*$/i, "").trim();
              updated[updated.length - 1] = {
                ...last,
                content: cleanContent,
                sources: json.sources,
                confidence: json.confidence,
              };
              return updated;
            });
            logTrace({
              stage: "chat",
              model: json.model,
              inputTokens: json.inputTokens,
              outputTokens: json.outputTokens,
              costUsd: computeCost(json.model, json.inputTokens, json.outputTokens),
              latencyMs,
              promptVersion: json.promptVersion,
              confidence: json.confidence,
              passFail: "pass",
            });
          }
        }
      }
    } catch (err) {
      console.error("[chat]", err);
      setMessages((prev) => {
        const updated = [...prev];
        updated[updated.length - 1] = { role: "assistant", content: "An error occurred. Please try again." };
        return updated;
      });
    } finally {
      setStreaming(false);
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-10rem)]">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-slate-400 text-sm">Ask any question about mortgage qualification, lending standards, or the home buying process. All answers are grounded in regulatory documents.</p>
            <div className="flex flex-wrap gap-2">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => send(q)}
                  className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded px-3 py-1.5 transition-colors text-left"
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
              msg.role === "user"
                ? "bg-blue-600 text-white"
                : "bg-[var(--navy-900)] border border-slate-800 text-slate-200"
            }`}>
              <p className="whitespace-pre-wrap leading-relaxed">
                {msg.content}
                {streaming && i === messages.length - 1 && msg.role === "assistant" && (
                  <span className="inline-block w-1 h-4 bg-blue-400 animate-pulse ml-0.5 align-middle" />
                )}
              </p>
              {msg.sources && msg.sources.length > 0 && <SourcesAccordion sources={msg.sources} />}
              {msg.confidence !== undefined && (
                <div className="mt-1 text-xs text-slate-500">
                  Confidence: {(msg.confidence * 100).toFixed(0)}%
                </div>
              )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-slate-800 pt-4">
        <form
          onSubmit={(e) => { e.preventDefault(); send(input); }}
          className="flex gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about mortgage qualification…"
            disabled={streaming}
            className="flex-1 bg-slate-800 border border-slate-700 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
          />
          <button
            type="submit"
            disabled={streaming || !input.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-3 py-2 rounded transition-colors"
          >
            {streaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </form>
      </div>
    </div>
  );
}
