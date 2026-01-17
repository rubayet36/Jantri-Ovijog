// police-chat.js - Modernized Logic

// --- DATA ---
const channels = [
  {
    id: "fraud",
    name: "Fare & Fraud Cell",
    type: "Team",
    description: "Handles overcharging, fake tickets & fare scams.",
    members: ["Officer Rahim", "Officer Nabila", "Officer Hasan"],
    unread: 2
  },
  {
    id: "traffic",
    name: "Traffic Enforcement",
    type: "Team",
    description: "Reckless driving, speeding and road-safety issues.",
    members: ["Officer Karim", "Officer Biplob"],
    unread: 0
  },
  {
    id: "women",
    name: "Women & Child Safety",
    type: "Team",
    description: "Harassment & gender-based safety cases.",
    members: ["Officer Asma", "Officer Tania"],
    unread: 5
  },
  {
    id: "control",
    name: "Central Control Room",
    type: "Broadcast",
    description: "Emergency coordination and routing.",
    members: ["Duty Officer", "SOS Monitor"],
    unread: 0
  },
];

const channelMessages = {
  fraud: [
    { from: "Officer Rahim", me: false, text: "We have repeated fare complaints on Raida bus DHA-15-9988.", time: "09:20 AM" },
    { from: "Me", me: true, text: "Copy. I’ll request GPS and ticket logs for the last 3 days.", time: "09:22 AM" },
  ],
  traffic: [
    { from: "Officer Karim", me: false, text: "Reckless driving on Jatrabari flyover yesterday, case #53.", time: "06:45 PM" },
  ],
  women: [
    { from: "Officer Asma", me: false, text: "Farmgate harassment case, need CCTV tags by tonight.", time: "02:10 PM" },
  ],
  control: [
    { from: "Duty Officer", me: false, text: "New SOS alert from Mirpur-10, sending details.", time: "09:30 PM" },
  ],
};

let cases = [
  { id: 42, category: "Fare Dispute", status: "open", thana: "Uttara East", bus: "Asmani (DHA-12-3456)", assignedTo: "None" },
  { id: 37, category: "Harassment", status: "progress", thana: "Tejgaon", bus: "Raida (DHA-15-9988)", assignedTo: "Women & Child Safety" },
  { id: 53, category: "Reckless Driving", status: "resolved", thana: "Jatrabari", bus: "City Link (DHA-17-2211)", assignedTo: "Traffic Enforcement" },
  { id: 61, category: "Fare Dispute", status: "open", thana: "Mohammadpur", bus: "Shyamoli (DHA-19-4432)", assignedTo: "None" },
];

// --- STATE ---
let currentChannelId = null;
let pendingImageDataUrl = null;

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
  renderChannels();
  renderCaseList();
  
  if (channels.length > 0) {
    switchChannel(channels[0].id);
  }
  
  attachInputHandlers();
});

// --- CHANNELS ---
function renderChannels() {
  const list = document.getElementById("channelList");
  if (!list) return;
  list.innerHTML = "";

  channels.forEach((ch) => {
    const div = document.createElement("div");
    div.className = `channel-item ${currentChannelId === ch.id ? 'active' : ''}`;
    div.dataset.id = ch.id;
    div.onclick = () => switchChannel(ch.id);

    // Initial (First letter of first two words)
    const initials = ch.name.split(" ").slice(0, 2).map(n => n[0]).join("");

    div.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span class="channel-title"># ${ch.name}</span>
        ${ch.unread > 0 ? `<span style="background:#EF4444; color:white; font-size:10px; padding:2px 6px; border-radius:10px;">${ch.unread}</span>` : ''}
      </div>
      <span class="channel-meta">${ch.members.length} members</span>
    `;
    list.appendChild(div);
  });
}

function switchChannel(id) {
  currentChannelId = id;
  const ch = channels.find(c => c.id === id);
  if (!ch) return;

  // Update Header
  document.getElementById("currentChannelName").textContent = "# " + ch.name;
  document.getElementById("currentChannelMeta").textContent = ch.description;
  document.getElementById("currentChannelType").textContent = ch.type;

  // Update Active Class
  renderChannels();
  
  // Render Messages
  renderMessages();
}

// --- MESSAGES ---
function renderMessages() {
  const container = document.getElementById("messageList");
  if (!container) return;

  container.innerHTML = "";
  const msgs = channelMessages[currentChannelId] || [];

  msgs.forEach(msg => {
    const div = document.createElement("div");
    div.className = `message-item ${msg.me ? 'me' : ''}`;
    
    // Initials for avatar
    const initials = msg.from.substring(0,2).toUpperCase();

    div.innerHTML = `
      <div class="message-avatar" title="${msg.from}">${initials}</div>
      <div class="message-body">
        ${!msg.me ? `<div style="font-size:11px; font-weight:700; color:#64748B; margin-bottom:2px;">${msg.from}</div>` : ''}
        <div class="message-text">${escapeHtml(msg.text)}</div>
        ${msg.imageDataUrl ? `<img src="${msg.imageDataUrl}" class="message-image" />` : ''}
        ${msg.caseId ? renderCaseTag(msg) : ''}
        <span class="message-time">${msg.time}</span>
      </div>
    `;
    container.appendChild(div);
  });

  scrollToBottom();
}

function renderCaseTag(msg) {
  const color = msg.caseTagType === 'resolved' ? '#059669' : '#D97706';
  return `
    <div class="message-tag" style="border-left: 3px solid ${color}">
      <strong>Case #${msg.caseId}</strong><br/>
      ${msg.caseTagType === 'assigned' ? 'Assigned to this channel' : 'Marked as Resolved'}
    </div>
  `;
}

function scrollToBottom() {
  const container = document.getElementById("messageList");
  if(container) {
    container.scrollTop = container.scrollHeight;
  }
}

// --- INPUT & SENDING ---
function attachInputHandlers() {
  const input = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const imgInput = document.getElementById("imageInput");

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener("click", sendMessage);

  if (imgInput) {
    imgInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          pendingImageDataUrl = ev.target.result;
          input.placeholder = "Image attached. Type caption or press send...";
          input.focus();
        };
        reader.readAsDataURL(file);
      }
    });
  }
}

function sendMessage(extra = {}) {
  const input = document.getElementById("chatInput");
  const text = input.value.trim();

  if (!text && !pendingImageDataUrl && !extra.text) return;

  const msg = {
    from: "Me",
    me: true,
    text: text || extra.text || "",
    time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    imageDataUrl: pendingImageDataUrl,
    ...extra
  };

  if (!channelMessages[currentChannelId]) channelMessages[currentChannelId] = [];
  channelMessages[currentChannelId].push(msg);

  // Reset
  input.value = "";
  input.placeholder = "Type a message...";
  pendingImageDataUrl = null;
  renderMessages();
}

// --- CASES PANEL ---
function renderCaseList() {
  const list = document.getElementById("caseList");
  if (!list) return;
  list.innerHTML = "";

  cases.forEach(c => {
    const div = document.createElement("div");
    div.className = "case-item";
    div.innerHTML = `
      <div class="case-item-header">
        <span class="case-id">#${c.id} ${c.category}</span>
        <span class="case-status-pill case-status-${c.status}">${c.status}</span>
      </div>
      <div style="font-size:11px; color:#64748B; margin-bottom:8px;">
        📍 ${c.thana}<br>
        🚌 ${c.bus}
      </div>
      <div class="case-actions">
        <button class="case-assign-btn" onclick="assignCase(${c.id})">Assign Here</button>
        <button class="case-assign-btn" onclick="resolveCase(${c.id})">Resolve</button>
      </div>
    `;
    list.appendChild(div);
  });
}

function assignCase(id) {
  const c = cases.find(x => x.id === id);
  if (!c) return;
  c.status = "progress";
  sendMessage({ 
    text: `Taking ownership of Case #${id}`,
    caseId: id,
    caseTagType: "assigned"
  });
  renderCaseList();
}

function resolveCase(id) {
  const c = cases.find(x => x.id === id);
  if (!c) return;
  c.status = "resolved";
  sendMessage({ 
    text: `Case #${id} has been resolved.`,
    caseId: id,
    caseTagType: "resolved"
  });
  renderCaseList();
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}