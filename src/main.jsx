import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Search, PanelLeft, PenLine, Images, Library, Clock3, Plug, Folder,
  Code2, MoreHorizontal, Gift, Share, Mic, Plus, ArrowUp,
  Sparkles, X, Check, UserPlus, LogOut, Circle, Send, Copy, Link2
} from 'lucide-react';
import './styles.css';

const DEFAULT_TRIGGER = (import.meta.env.VITE_TRIGGER_WORD || 'Unlock-node').trim();
const TRIGGER_KEY = 'demo-trigger-word-v1';
const normalizeTrigger = value => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase();
const RECENT_KEY = 'demo-groq-recents-v3';
const STATE_KEY = 'demo-secret-state-v2';

function loadJson(key, fallback){ try{return JSON.parse(localStorage.getItem(key)) ?? fallback}catch{return fallback} }
function saveJson(key,value){ try{localStorage.setItem(key,JSON.stringify(value));}catch{ /* local storage is optional */ } }
function makeId(){return crypto.randomUUID()}
function isUuid(value){return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value||''))}
function getInitialState(){
  const saved=loadJson(STATE_KEY,null);
  if(!saved || !isUuid(saved.me)) return {me:makeId(),connections:[],messages:[]};
  return {me:saved.me,connections:Array.isArray(saved.connections)?saved.connections:[],messages:Array.isArray(saved.messages)?saved.messages:[]};
}
async function readApiResponse(response, fallbackMessage='Request failed'){
  const raw=await response.text();
  let data={};
  try{data=raw?JSON.parse(raw):{}}catch{throw new Error(`${fallbackMessage} (HTTP ${response.status}).`)}
  if(!response.ok)throw new Error(data.error||`${fallbackMessage} (HTTP ${response.status}).`);
  return data;
}

function Sidebar({active,onSelect,recents}){
  const items=[
    ['new','New chat',PenLine],['images','Images',Images],['library','Library',Library],['scheduled','Scheduled',Clock3],['plugins','Plugins',Plug],['projects','Projects',Folder],['codex','Codex',Code2],['more','More',MoreHorizontal]
  ];
  return <aside className="sidebar">
    <div className="brand-row"><span className="brand">ChatGPT</span><div className="brand-actions"><Search size={19}/><PanelLeft size={19}/></div></div>
    <nav className="nav-list">{items.map(([id,label,Icon])=><button key={id} className={'nav-item '+(active===id?'active':'')} onClick={()=>onSelect(id)}><Icon size={20}/><span>{label}</span>{id==='images'&&<em>UPDATED</em>}</button>)}</nav>
    <div className="recent-label">Recents</div>
    <div className="recent-list">{recents.length?recents.map(r=><button key={r.id} className="recent-item" onClick={()=>onSelect('recent',r)}><span>{r.title}</span></button>):<div className="empty-recent">Your recent chats will appear here.</div>}</div>
    <div className="account"><div className="account-row"><div className="user-avatar">HV</div><div><b>Demo User</b><small>Free</small></div></div><button className="offer"><Gift size={16}/> Claim offer</button></div>
  </aside>
}

function Welcome({onPrompt}){
  const suggestions=[
    ['Explain a concept','Explain Green\'s theorem from the basics'],
    ['Plan something','Make me a 7-day Python learning plan'],
    ['Write something','Write a professional club application'],
    ['Analyze data','How should I clean a CSV dataset?']
  ];
  return <div className="welcome"><div className="sparkle"><Sparkles size={25}/></div><h1>How can I help you today?</h1><div className="suggestions">{suggestions.map(([a,b])=><button key={a} onClick={()=>onPrompt(b)}><b>{a}</b><span>{b}</span></button>)}</div></div>
}

function MessageBubble({m}){
  return <div className={'message-row '+m.role}><div className="message-avatar">{m.role==='assistant'?'✦':'You'}</div><div className="message-content"><div className="message-text">{m.text}</div></div></div>
}

function ChatHome({messages,setMessages,recents,setRecents,onUnlock,onOpenPanel,trigger}){
  const [text,setText]=useState(''); const [busy,setBusy]=useState(false); const fileRef=useRef();
  const send=async(value=text)=>{
    const q=value.trim(); if(!q||busy)return;
    if(normalizeTrigger(q)===normalizeTrigger(trigger)){setText('');onUnlock();return;}
    const user={role:'user',text:q,id:crypto.randomUUID()};
    setMessages(m=>[...m,user]); setText(''); setBusy(true);
    const next=[...messages,user];
    const recent={id:crypto.randomUUID(),prompt:q,title:q.length>38?q.slice(0,38)+'…':q};
    const updated=[recent,...recents.filter(r=>r.title!==recent.title)].slice(0,30);
    setRecents(updated); saveJson(RECENT_KEY,updated);
    try{
      const r=await fetch('/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:q,history:next,useSearch:true})});
      const data=await readApiResponse(r,'Chat request failed');
      setMessages(m=>[...m,{role:'assistant',text:data.text,id:crypto.randomUUID()}]);
    }catch(e){setMessages(m=>[...m,{role:'assistant',text:`Groq connection error: ${e.message}\n\nMake sure the API server is running and GROQ_API_KEY is configured.`,id:crypto.randomUUID()}]);}
    finally{setBusy(false)}
  };
  const upload=async(e)=>{
    const file=e.target.files?.[0]; if(!file)return;
    const user={role:'user',text:`Analyze this file: ${file.name}`,id:crypto.randomUUID()}; setMessages(m=>[...m,user]); setBusy(true);
    const form=new FormData(); form.append('file',file); form.append('prompt','Analyze this file. Give me a useful summary, key findings, and practical next steps.');
    try{const r=await fetch('/api/file',{method:'POST',body:form});const data=await readApiResponse(r,'File analysis failed');setMessages(m=>[...m,{role:'assistant',text:data.text,id:crypto.randomUUID()}]);}
    catch(err){setMessages(m=>[...m,{role:'assistant',text:`File analysis error: ${err.message}`,id:crypto.randomUUID()}]);}
    finally{setBusy(false);e.target.value=''}
  };
  return <main className="main"><header className="topbar"><span>ChatGPT</span><button onClick={()=>onOpenPanel('share')}><Share size={18}/></button></header>
    <section className={'conversation '+(messages.length?'has-messages':'')}>
      {messages.length?messages.map(m=><MessageBubble key={m.id} m={m}/>):<Welcome onPrompt={send}/>} {busy&&<div className="typing"><span/> <span/> <span/></div>}
    </section>
    <div className="composer-wrap"><div className="composer"><input ref={fileRef} type="file" hidden onChange={upload}/><button className="icon-btn" onClick={()=>fileRef.current?.click()} title="Attach file" disabled={busy}><Plus size={21}/></button><textarea value={text} onChange={e=>setText(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();send()}}} placeholder="Ask anything"/><div className="composer-right"><button className="think"><Sparkles size={18}/> Think</button><button className="icon-btn"><Mic size={20}/></button><button className="send-btn" onClick={()=>send()} disabled={!text.trim()||busy}>{busy?<Circle className="spin" size={18}/>:<ArrowUp size={18}/>}</button></div></div><div className="composer-note">Groq-powered demo · Web-enabled answers use Groq's compound model.</div></div>
  </main>
}

function TriggerSettings({value,onSave,onClose}){
  const [draft,setDraft]=useState(value);
  const [error,setError]=useState('');
  const submit=()=>{const v=draft.trim().replace(/\s+/g,' '); if(v.length<3){setError('Use at least 3 characters.');return;} if(v.length>80){setError('Keep the trigger word under 80 characters.');return;} onSave(v)};
  return <div className="panel-overlay" onClick={onClose}><div className="panel debug-panel" onClick={e=>e.stopPropagation()}><button className="panel-close" onClick={onClose}><X/></button><h2>Trigger word</h2><p>Set the word or phrase that opens the demo messaging area. You can change it anytime.</p><input className="trigger-input" value={draft} onChange={e=>{setDraft(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit()}}} autoFocus/>{error&&<div className="trigger-error">{error}</div>}<button className="debug-submit" onClick={submit}>Save trigger word</button></div></div>
}

function InitialTriggerSetup({value,onSave}){
  const [draft,setDraft]=useState(value); const [error,setError]=useState('');
  const submit=()=>{const v=draft.trim().replace(/\s+/g,' '); if(v.length<3||v.length>80){setError('Choose a trigger between 3 and 80 characters.');return;} onSave(v)};
  return <div className="panel-overlay setup-overlay"><div className="panel debug-panel setup-panel" onClick={e=>e.stopPropagation()}><div className="sparkle"><Code2 size={24}/></div><h2>Choose your trigger word</h2><p>Set this once to get started. You can change it later from <b>More → Trigger word</b>.</p><input className="trigger-input" value={draft} onChange={e=>{setDraft(e.target.value);setError('')}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();submit()}}} autoFocus/>{error&&<div className="trigger-error">{error}</div>}<button className="debug-submit" onClick={submit}>Set trigger word</button></div></div>
}

function Panel({type,onClose,onDebug,onTrigger}){
  const data={
    images:{title:'Images',body:'Use the main chat for text and code analysis with Groq.',cards:['Describe an image workflow','Upload supported text/code files','Turn a prompt into a detailed plan']},
    library:{title:'Library',body:'Supported text and code files can be analyzed through the Groq API. Visible history stays local to your browser.',cards:['Upload TXT, MD, CSV, JSON, JS/TS, Python, C/C++, Java, HTML, CSS, SQL or YAML','Ask Groq to summarize it','Use the result in your next chat']},
    scheduled:{title:'Scheduled',body:'Demo placeholder for scheduled prompts.',cards:['Create a reminder','Review scheduled tasks','Manage notifications']},
    plugins:{title:'Plugins',body:'Demo integrations area.',cards:['Connect a service','Review available tools','Manage permissions']},
    projects:{title:'Projects',body:'Group related conversations and files.',cards:['Create a project','Add a conversation','Attach project files']},
    codex:{title:'Codex',body:'Coding workspace. Choose an action below.',cards:['Explain code','Debug an error','Generate tests']},
    more:{title:'More',body:'Additional demo features.',cards:['Trigger word','Keyboard shortcuts','Help & feedback']},
    share:{title:'Share',body:'This is a local demo. Sharing controls are intentionally not connected to a real account system.',cards:['Copy demo link','Review privacy settings','Close']}
  }[type];
  if(!data)return null;
  return <div className="panel-overlay" onClick={onClose}><div className="panel" onClick={e=>e.stopPropagation()}><button className="panel-close" onClick={onClose}><X/></button><h2>{data.title}</h2><p>{data.body}</p>{data.cards.map((c,i)=><button className="panel-card" key={c} onClick={()=>type==='codex'&&c==='Debug an error'?onDebug():type==='more'&&c==='Trigger word'?onTrigger():null}><span>{i+1}</span>{c}</button>)}</div></div>
}

function CodexDebug({onClose,onUnlock,trigger}){
  const [code,setCode]=useState('');
  const submit=()=>{
    if(normalizeTrigger(code)===normalizeTrigger(trigger)){onUnlock();return;}
  };
  return <div className="panel-overlay" onClick={onClose}><div className="panel debug-panel" onClick={e=>e.stopPropagation()}><button className="panel-close" onClick={onClose}><X/></button><h2>Debug an error</h2><p>Type the code</p><textarea className="debug-input" value={code} onChange={e=>setCode(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();submit()}}} placeholder="Paste or type code here..." autoFocus/><button className="debug-submit" onClick={submit}>Run debug</button></div></div>
}

function SecretDashboard({state,setState,onExit,dbEnabled}){
  const [selected,setSelected]=useState(state.connections.find(c=>c.status==='accepted')?.id||null);
  const [draft,setDraft]=useState('');
  const [receiverLink,setReceiverLink]=useState('');
  const [connectionMessage,setConnectionMessage]=useState('');
  const [dbLoading,setDbLoading]=useState(false);
  const [sending,setSending]=useState(false);
  const accepted=state.connections.filter(c=>c.status==='accepted');
  const pending=state.connections.filter(c=>c.status==='pending');
  const senderLink=`${window.location.origin}${window.location.pathname}?connect=${encodeURIComponent(state.me)}`;

  const syncConnections=async()=>{
    if(!dbEnabled)return;
    try{
      const r=await fetch(`/api/connections/${state.me}`);
      const rows=await readApiResponse(r,'Could not load connections');
      setState(s=>({...s,connections:rows.map(c=>({
        id:c.requester_id===s.me?c.addressee_id:c.requester_id,
        connectionId:c.id,
        name:c.name,
        status:c.status,
        requesterId:c.requester_id,
        addresseeId:c.addressee_id
      }))}));
      const firstAccepted=rows.find(c=>c.status==='accepted');
      if(firstAccepted){
        const other=firstAccepted.requester_id===state.me?firstAccepted.addressee_id:firstAccepted.requester_id;
        setSelected(current=>current&&rows.some(c=>c.status==='accepted' && (c.requester_id===current||c.addressee_id===current))?current:other);
      }else setSelected(null);
    }catch(err){console.warn('Database sync unavailable:',err.message)}
  };

  useEffect(()=>{
    if(!dbEnabled)return;
    let cancelled=false;
    (async()=>{
      setDbLoading(true);
      try{
        const r=await fetch('/api/session',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:state.me,displayName:'Demo user'})});
        await readApiResponse(r,'Could not create demo session');
        if(!cancelled)await syncConnections();
      }catch(err){console.warn('Database sync unavailable:',err.message)}
      finally{if(!cancelled)setDbLoading(false)}
    })();
    return()=>{cancelled=true};
  },[dbEnabled,state.me]);

  useEffect(()=>{
    if(!dbEnabled)return;
    const timer=setInterval(syncConnections,3000);
    return()=>clearInterval(timer);
  },[dbEnabled,state.me]);

  useEffect(()=>{
    if(!dbEnabled||!selected||!accepted.some(c=>c.id===selected))return;
    let cancelled=false;
    const loadMessages=async()=>{
      try{
        const r=await fetch(`/api/messages/${state.me}/${selected}`);
        const rows=await readApiResponse(r,'Could not load messages');
        if(cancelled)return;
        setState(s=>({...s,messages:rows.map(m=>({
          id:m.id,from:m.sender_id,to:m.recipient_id,text:m.body,
          time:new Date(m.created_at).getTime(),
          status:m.read_at?'read':m.delivered_at?'delivered':'sent'
        }))}));
      }catch(err){console.warn('Message sync unavailable:',err.message)}
    };
    loadMessages();
    const timer=setInterval(loadMessages,3000);
    return()=>{cancelled=true;clearInterval(timer)};
  },[dbEnabled,selected,state.me,accepted.length]);

  const copySenderLink=async()=>{
    try{
      await navigator.clipboard.writeText(senderLink);
      setConnectionMessage('Your sender link was copied. Send it to the other user.');
    }catch{
      setConnectionMessage('Copy failed. Select and copy your sender link manually.');
    }
  };

  const extractTarget=(raw)=>{
    try{
      const url=new URL(raw,window.location.origin);
      const target=url.searchParams.get('connect');
      return target||'';
    }catch{return ''}
  };

  const submitReceiverLink=async()=>{
    const raw=receiverLink.trim();
    if(!raw){setConnectionMessage('Paste the other user’s sender link first.');return;}
    const target=extractTarget(raw) || (isUuid(raw)?raw:'');
    if(!isUuid(target)){
      setConnectionMessage('That is not a valid sender link. Paste the complete link you received.');
      return;
    }
    if(target===state.me){setConnectionMessage('You cannot connect to your own sender link.');return;}
    if(!dbEnabled){setConnectionMessage('SQL SYNC is required to establish a connection between two users.');return;}
    try{
      const r=await fetch('/api/connections',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requesterId:state.me,addresseeId:target})});
      const data=await readApiResponse(r,'Could not establish the connection');
      setReceiverLink('');
      await syncConnections();
      if(data.mutual){
        setConnectionMessage('Connection established. Both users exchanged links — you can now communicate.');
        setSelected(target);
      }else{
        setConnectionMessage('Your link submission is recorded. Waiting for the other user to paste your sender link too.');
      }
    }catch(err){setConnectionMessage(err.message)}
  };

  const send=async()=>{
    const body=draft.trim();
    if(!selected||!body||sending||!accepted.some(c=>c.id===selected))return;
    setSending(true);
    setDraft('');
    try{
      const r=await fetch('/api/messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({senderId:state.me,recipientId:selected,body})});
      const saved=await readApiResponse(r,'Could not send message');
      setState(s=>({...s,messages:[...s.messages,{id:saved.id,from:saved.sender_id,to:saved.recipient_id,text:saved.body,time:new Date(saved.created_at).getTime(),status:saved.read_at?'read':saved.delivered_at?'delivered':'sent'}]}));
    }catch(err){
      setDraft(body);
      setConnectionMessage(err.message);
    }finally{setSending(false)}
  };

  return <div className="secret-shell">
    <header className="secret-header"><div><strong>Demo Messaging</strong><span className="pill">PROTOTYPE</span>{dbEnabled&&<span className="db-pill">SQL SYNC</span>}</div><button className="panic" onClick={onExit}><LogOut size={17}/> Exit demo</button></header>
    <div className="secret-grid">
      <aside className="secret-side">
        <div className="profile"><div className="big-avatar">D</div><div><b>Demo user</b><small>ID: {state.me}</small></div></div>
        <div className="connection-box">
          <div className="connection-heading"><Link2 size={16}/><b>Establish connection</b></div>
          <p className="connection-help">Exchange sender links with the other user. Each person must paste the other person’s link here before messaging is enabled.</p>
          <label>Sender link — your link</label>
          <div className="link-row"><input value={senderLink} readOnly aria-label="Your sender link"/><button onClick={copySenderLink} title="Copy sender link" aria-label="Copy sender link"><Copy size={16}/></button></div>
          <label>Receiver link — paste their link</label>
          <div className="link-row"><input value={receiverLink} onChange={e=>{setReceiverLink(e.target.value);setConnectionMessage('')}} onKeyDown={e=>e.key==='Enter'&&submitReceiverLink()} placeholder="Paste sender link here" aria-label="Other user's sender link"/><button onClick={submitReceiverLink} title="Submit sender link" aria-label="Submit sender link"><Check size={16}/></button></div>
          {connectionMessage&&<div className="connection-message" role="status">{connectionMessage}</div>}
          {!dbEnabled&&<div className="connection-warning">Connect your PostgreSQL/Supabase database first.</div>}
        </div>
        <h4>Pending link exchanges</h4>
        {pending.map(c=><div className="request" key={c.id}><div><b>{c.name}</b><small>waiting for both sender links</small></div></div>)}
        {dbLoading?<div className="muted">Syncing…</div>:!pending.length&&<div className="muted">No pending link exchanges.</div>}
        <h4>Connections</h4>
        {accepted.map(c=><button className={'contact '+(selected===c.id?'selected':'')} onClick={()=>setSelected(c.id)} key={c.id}><span className="status-dot"/>{c.name}<small>{c.id}</small></button>)}
        {!accepted.length&&!dbLoading&&<div className="muted">No connected users yet.</div>}
      </aside>
      <section className="chat-panel">
        {selected&&accepted.some(c=>c.id===selected)?<>
          <div className="chat-title"><div className="status-dot"/><b>{accepted.find(c=>c.id===selected)?.name}</b><small>Connected</small></div>
          <div className="secret-messages">
            {state.messages.filter(m=>(m.from===state.me&&m.to===selected)||(m.from===selected&&m.to===state.me)).map(m=><div className={'secret-msg '+(m.from===state.me?'mine':'')} key={m.id}><span>{m.text}</span><small>{new Date(m.time).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})} · {m.status}</small></div>)}
          </div>
          <div className="secret-composer"><input value={draft} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>e.key==='Enter'&&send()} placeholder="Type a message" disabled={sending}/><button onClick={send} disabled={sending||!draft.trim()} aria-label="Send message"><Send size={18}/></button></div>
        </>:<div className="empty"><UserPlus size={42}/><h2>Establish a connection</h2><p>Exchange your sender links, paste the other user’s link into the receiver box, and communication will appear here once both sides have submitted.</p></div>}
      </section>
    </div>
  </div>
}
function App(){
  const [secret,setSecret]=useState(false); const [dbEnabled,setDbEnabled]=useState(false); const [active,setActive]=useState('new'); const [panel,setPanel]=useState(null); const [debuggerOpen,setDebuggerOpen]=useState(false); const [trigger,setTrigger]=useState(()=>localStorage.getItem(TRIGGER_KEY)||'');
  const [messages,setMessages]=useState([]); const [recents,setRecents]=useState(()=>loadJson(RECENT_KEY,[]));
  const [state,setStateRaw]=useState(getInitialState);
  const setState=(updater)=>setStateRaw(s=>{const n=typeof updater==='function'?updater(s):updater;saveJson(STATE_KEY,n);return n});

  useEffect(()=>{document.title='ChatGPT'; fetch('/api/health').then(r=>r.ok?r.json():null).then(h=>setDbEnabled(h?.database==='ok')).catch(()=>setDbEnabled(false));},[]);
  useEffect(()=>{
    let last=0;
    const key=e=>{
      const now=Date.now();
      if(e.key==='Escape'&&now-last<600)setSecret(false);
      last=now;
      if(e.altKey&&e.shiftKey&&e.key.toLowerCase()==='x')setSecret(false);
    };
    window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);
  },[]);
  const saveTrigger=(value)=>{const v=value.trim().replace(/\s+/g,' ');localStorage.setItem(TRIGGER_KEY,v);setTrigger(v);setPanel(null)};
  const enterSecret=()=>{
    setPanel(null);
    setDebuggerOpen(false);
    setSecret(true);
  };

  if(secret)return <SecretDashboard state={state} setState={setState} dbEnabled={dbEnabled} onExit={()=>setSecret(false)}/>;
  const select=(id,item)=>{
    if(id==='new'){setMessages([]);setActive('new');setPanel(null);return}
    if(id==='recent'&&item){setMessages([{role:'user',text:item.prompt || item.title,id:crypto.randomUUID()}]);setActive('recent');setPanel(null);return}
    if(['images','library','scheduled','plugins','projects','codex','more'].includes(id)){setPanel(id);setActive(id);return}
  };
  if(!trigger)return <InitialTriggerSetup value={DEFAULT_TRIGGER} onSave={saveTrigger}/>;
  return <div className="app"><Sidebar active={active} onSelect={select} recents={recents}/><ChatHome messages={messages} setMessages={setMessages} recents={recents} setRecents={setRecents} onUnlock={enterSecret} onOpenPanel={setPanel} trigger={trigger}/>{panel&&<Panel type={panel} onClose={()=>setPanel(null)} onDebug={()=>{setPanel(null);setDebuggerOpen(true)}} onTrigger={()=>{setPanel(null);setPanel('trigger')}}/>}{panel==='trigger'&&<TriggerSettings value={trigger} onSave={saveTrigger} onClose={()=>setPanel(null)}/>} {debuggerOpen&&<CodexDebug onClose={()=>setDebuggerOpen(false)} onUnlock={enterSecret} trigger={trigger}/>}</div>
}
createRoot(document.getElementById('root')).render(<App/>);
