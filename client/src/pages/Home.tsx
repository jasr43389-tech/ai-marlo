import { useMemo, useState } from "react";
import {
  ArrowUp, ChevronDown, Command, FolderOpen, MoreHorizontal,
  Paperclip, PanelLeftClose, Plus, Search, Settings2, SlidersHorizontal,
  Sparkles, SquareTerminal,
} from "lucide-react";
import { Streamdown } from "streamdown";
import { trpc } from "@/lib/trpc";

const logo = "/manus-storage/ai-marlo-logo_3c2391de.png";
type ChatMessage = { id: string; role: "user" | "assistant"; content: string; reasoning?: string };
type Conversation = { id: string; title: string; time: string; icon: string };
const starterConversations: Conversation[] = [
  { id: "chores", title: "Project env scan and agent roles", time: "7m", icon: "🔧" },
  { id: "style", title: "UI and style touch-up", time: "7m", icon: "💄" },
  { id: "tests", title: "Tests and validation", time: "11h", icon: "✅" },
];
const initialMessages: ChatMessage[] = [{ id: "welcome", role: "assistant", content: "مرحبًا، أنا **ai Marlo**. أستطيع بناء واجهات ومواقع كاملة مع تجربة استخدام احترافية، حركة هادئة، وتنقّل متجاوب." }];

export default function Home() {
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [isSidebarOpen, setSidebarOpen] = useState(true);
  const [activeChat, setActiveChat] = useState("new");
  const [attached, setAttached] = useState(false);
  const [selectedModel, setSelectedModel] = useState("z-ai/glm-5.3-flash");
  const [showModels, setShowModels] = useState(false);
  const sendMessage = trpc.chat.send.useMutation();
  const modelsQuery = trpc.chat.models.useQuery();
  const running = sendMessage.isPending;
  const activeConversationTitle = useMemo(() => activeChat === "new" ? "New conversation" : starterConversations.find((item) => item.id === activeChat)?.title ?? "Conversation", [activeChat]);

  async function submitMessage() {
    const content = input.trim();
    if (!content || running) return;
    const userMessage: ChatMessage = { id: crypto.randomUUID(), role: "user", content };
    const assistantId = crypto.randomUUID();
    setMessages((current) => [...current, userMessage, { id: assistantId, role: "assistant", content: "" }]);
    setInput("");
    try {
      const response = await sendMessage.mutateAsync({ model: selectedModel, messages: [...messages, userMessage].map(({ role, content: text }) => ({ role, content: text })) });
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: response.content, reasoning: response.reasoning } : message));
    } catch {
      setMessages((current) => current.map((message) => message.id === assistantId ? { ...message, content: sendMessage.error?.message ?? "تعذر الاتصال بالنموذج حاليًا. اختر نموذجًا آخر أو حاول مرة أخرى.", reasoning: undefined } : message));
    }
  }
  function newChat() { setActiveChat("new"); setMessages(initialMessages); setInput(""); }

  return <div className="marlo-shell" dir="ltr">
    {isSidebarOpen && <aside className="marlo-sidebar">
      <div className="brand-row"><div className="brand-mark"><img src={logo} alt="ai Marlo" /></div><div className="brand-name">ai <span>Marlo</span></div><button className="icon-button subtle" aria-label="Collapse sidebar" title="Collapse sidebar" onClick={() => setSidebarOpen(false)}><PanelLeftClose size={16} /></button></div>
      <button className="search-command" title="Search commands"><Search size={16} /><span>Search commands</span><kbd><Command size={11} /> K</kbd></button>
      <button className="new-chat-button" onClick={newChat}><Plus size={17} /> New Chat</button>
      <button className="sidebar-link"><SlidersHorizontal size={16} /> Customize <span className="pin">•</span></button>
      <div className="conversation-heading"><span>Conversations</span><div className="heading-actions"><button className="icon-button subtle" title="Create folder" aria-label="Create folder"><FolderOpen size={15} /></button><button className="icon-button subtle" title="Filter conversations" aria-label="Filter conversations"><MoreHorizontal size={16} /></button></div></div>
      <nav className="conversation-list" aria-label="Conversations">{starterConversations.map((conversation) => <button key={conversation.id} className={`conversation-item ${activeChat === conversation.id ? "selected" : ""}`} onClick={() => setActiveChat(conversation.id)}><span className="conversation-icon">{conversation.icon}</span><span className="conversation-copy"><strong>{conversation.title}</strong><small>{conversation.time}</small></span></button>)}</nav>
      <div className="sidebar-footer"><div className="runtime-status"><span className="status-dot" /> Local <ChevronDown size={14} /></div><button className="icon-button subtle" title="Settings" aria-label="Settings"><Settings2 size={17} /></button></div>
    </aside>}
    <main className="marlo-main">
      <header className="topbar">{!isSidebarOpen && <button className="icon-button" title="Open sidebar" aria-label="Open sidebar" onClick={() => setSidebarOpen(true)}><PanelLeftClose size={17} /></button>}<div className="crumb"><span className="crumb-muted">ai Marlo</span><span>/</span><span>{activeConversationTitle}</span></div><div className="topbar-actions"><div className="model-picker"><button className="model-pill" onClick={() => setShowModels((open) => !open)}><Sparkles size={14} /> {modelsQuery.data?.models.find((model) => model.id === selectedModel)?.name ?? "GLM 5.3 Flash"} <ChevronDown size={13} /></button>{showModels && <div className="model-menu"><div className="menu-title">Models &amp; provider status</div>{modelsQuery.data?.models.map((model) => <button key={model.id} disabled={!model.available} className={`model-option ${model.id === selectedModel ? "active" : ""} ${!model.available ? "unavailable" : ""}`} onClick={() => { if (model.available) { setSelectedModel(model.id); setShowModels(false); } }}><span className={`provider-logo provider-${model.provider.toLowerCase().replace(/[^a-z]/g, "")}`}>{model.mark}</span><span><strong>{model.name}</strong><small>{model.provider} · {model.kind === "nvidia" ? "NVIDIA NIM" : "Built-in fallback"}</small></span><i className={`model-health ${!model.available ? "offline" : ""}`} /></button>)}<div className="balance-note">Balance: provider does not expose a live credit endpoint. Errors such as insufficient credits are reported instead of showing a guessed number.</div></div>}</div><button className="icon-button" title="Workspace" aria-label="Workspace"><FolderOpen size={17} /></button><button className="icon-button" title="More actions" aria-label="More actions"><MoreHorizontal size={17} /></button></div></header>
      <section className="chat-stage"><div className="chat-scroll">
        {messages.length === 1 && <div className="welcome-block"><div className="welcome-orbit"><img src={logo} alt="" /></div><p className="eyebrow">AI WEBSITE-BUILDING AGENT</p><h1>Let&apos;s start building<span>.</span></h1><p className="welcome-copy">Describe an idea and ai Marlo will turn it into a polished, working experience.</p></div>}
        <div className="message-stack">{messages.map((message) => <article key={message.id} className={`message-row ${message.role}`}>{message.role === "assistant" && <div className="assistant-avatar"><img src={logo} alt="ai Marlo" /></div>}<div className="message-body">{message.reasoning && <div className="reasoning-line"><span className="reasoning-dot" />{message.reasoning}</div>}{message.content && (message.role === "assistant" ? <Streamdown>{message.content}</Streamdown> : <p>{message.content}</p>)}</div></article>)}{running && <div className="thinking-live" aria-live="polite"><span className="thinking-glyph"><Sparkles size={13} /></span><span className="thinking-shimmer">Thinking</span></div>}</div>
      </div><div className="composer-wrap"><div className="composer"><textarea value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void submitMessage(); } }} placeholder="What do you want to build?" aria-label="Message ai Marlo" rows={1} /><div className="composer-toolbar"><button className={`composer-tool ${attached ? "active" : ""}`} title="Attach files" aria-label="Attach files" onClick={() => setAttached(!attached)}><Paperclip size={17} /></button><span className="composer-hint">Shift + Enter for a new line</span><button className="send-button" title="Send message" aria-label="Send message" onClick={() => void submitMessage()} disabled={!input.trim() || running}><ArrowUp size={18} /></button></div></div><div className="composer-meta"><span><SquareTerminal size={13} /> Agent mode</span><span>ai Marlo can make mistakes — review changes before shipping</span></div></div></section>
    </main>
  </div>;
}
