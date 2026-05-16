// ═══════════════════════════════════════════════════
//  TransportFlow — App Controller
//  Full SPA routing, UI rendering, Socket.io chat
// ═══════════════════════════════════════════════════

/* ─── State ───────────────────────────────────────── */
let currentUser   = null;
let socket        = null;
let activeChatUser = null;
let allRequests   = [];
let typingTimer   = null;

/* ─── DOM shortcuts ───────────────────────────────── */
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

/* ─── Helpers ─────────────────────────────────────── */
function statusBadge(status) {
  const labels = {
    pending:'En attente', accepted:'Acceptée',
    in_progress:'En cours', completed:'Terminée',
    cancelled:'Annulée', rejected:'Rejetée'
  };
  return `<span class="badge badge-${status}">${labels[status] || status}</span>`;
}
function vehicleLabel(v) {
  return { small:'Petit (<1T)', medium:'Moyen (1–5T)', large:'Grand (>5T)', refrigerated:'Frigorifique' }[v] || v;
}
function roleBadge(role) {
  const labels = { client:'Client', transporter:'Transporteur', admin:'Administrateur' };
  return `<span class="badge badge-${role}">${labels[role] || role}</span>`;
}
function timeAgo(date) {
  const s = Math.floor((Date.now() - new Date(date)) / 1000);
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s/60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s/3600)}h`;
  return new Date(date).toLocaleDateString('fr-FR');
}
function formatDate(date) {
  return new Date(date).toLocaleDateString('fr-FR', { day:'2-digit', month:'short', year:'numeric' });
}
function formatTime(date) {
  return new Date(date).toLocaleTimeString('fr-FR', { hour:'2-digit', minute:'2-digit' });
}
function initials(name = '') {
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  el.style.cssText = `
    position:fixed; bottom:24px; right:24px; z-index:9999;
    padding:12px 20px; border-radius:10px; font-size:14px; font-weight:500;
    background:${type==='success'?'#22c55e':type==='error'?'#ef4444':'#f97316'};
    color:white; box-shadow:0 4px 20px rgba(0,0,0,.2);
    animation:slideUp .3s ease; max-width:320px;
  `;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}

/* ─── Router ──────────────────────────────────────── */
const pages = {
  dashboard : '#page-dashboard',
  requests  : '#page-requests',
  messages  : '#page-messages',
  users     : '#page-users',
  profile   : '#page-profile',
};
const titles = {
  dashboard:'Tableau de bord', requests:'Demandes de transport',
  messages:'Messagerie', users:'Gestion des utilisateurs', profile:'Mon profil',
};

function navigate(page) {
  // hide all pages
  $$('.page').forEach(p => p.classList.add('hidden'));
  const target = $(pages[page]);
  if (target) target.classList.remove('hidden');

  // update nav
  $$('.nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });

  $('#page-title').textContent = titles[page] || page;

  // close sidebar on mobile
  if (window.innerWidth < 900) $('#sidebar').classList.remove('open');

  // load page data
  loadPage(page);
}

async function loadPage(page) {
  switch (page) {
    case 'dashboard': await loadDashboard(); break;
    case 'requests':  await loadRequests();  break;
    case 'messages':  await loadConversations(); break;
    case 'users':     await loadUsers();     break;
    case 'profile':   loadProfile();         break;
  }
}

/* ─── Nav menu by role ────────────────────────────── */
function buildNav(role) {
  const nav = $('#sidebar-nav');
  const items = [
    { page:'dashboard', icon:'📊', label:'Tableau de bord', roles:['client','transporter','admin'] },
    { page:'requests',  icon:'📦', label:'Demandes',        roles:['client','transporter','admin'] },
    { page:'messages',  icon:'💬', label:'Messagerie',      roles:['client','transporter','admin'] },
    { section:'Administration', roles:['admin'] },
    { page:'users',     icon:'👥', label:'Utilisateurs',    roles:['admin'] },
    { page:'profile',   icon:'👤', label:'Mon profil',      roles:['client','transporter','admin'] },
  ];

  nav.innerHTML = '';
  items.forEach(item => {
    if (!item.roles.includes(role)) return;
    if (item.section) {
      const s = document.createElement('div');
      s.className = 'nav-section';
      s.textContent = item.section;
      nav.appendChild(s);
    } else {
      const btn = document.createElement('button');
      btn.className = 'nav-item';
      btn.dataset.page = item.page;
      btn.innerHTML = `<span class="nav-icon">${item.icon}</span>${item.label}`;
      btn.addEventListener('click', () => navigate(item.page));
      nav.appendChild(btn);
    }
  });
}

/* ─── DASHBOARD ───────────────────────────────────── */
async function loadDashboard() {
  try {
    if (currentUser.role === 'admin') {
      const stats = await AdminAPI.getStats();
      renderAdminStats(stats);
      const reqs = await AdminAPI.getRequests();
      renderRecentActivity(reqs);
      renderStatusBreakdown(reqs);
    } else {
      const reqs = await RequestsAPI.getAll();
      renderUserStats(reqs);
      renderRecentActivity(reqs);
      renderStatusBreakdown(reqs);
    }
  } catch (e) { toast(e.message, 'error'); }
}

function renderAdminStats(s) {
  $('#stats-grid').innerHTML = `
    <div class="stat-card" data-icon="👥">
      <div class="stat-value">${s.totalUsers}</div>
      <div class="stat-label">Utilisateurs</div>
    </div>
    <div class="stat-card" data-icon="📦">
      <div class="stat-value">${s.totalRequests}</div>
      <div class="stat-label">Demandes totales</div>
    </div>
    <div class="stat-card" data-icon="✅">
      <div class="stat-value">${s.completedRequests}</div>
      <div class="stat-label">Terminées</div>
    </div>
    <div class="stat-card" data-icon="⏳">
      <div class="stat-value">${s.pendingRequests}</div>
      <div class="stat-label">En attente</div>
    </div>
    <div class="stat-card" data-icon="🚚">
      <div class="stat-value">${s.transporters}</div>
      <div class="stat-label">Transporteurs</div>
    </div>
    <div class="stat-card" data-icon="💬">
      <div class="stat-value">${s.totalMessages}</div>
      <div class="stat-label">Messages</div>
    </div>
  `;
}

function renderUserStats(reqs) {
  const pending   = reqs.filter(r => r.status === 'pending').length;
  const active    = reqs.filter(r => ['accepted','in_progress'].includes(r.status)).length;
  const completed = reqs.filter(r => r.status === 'completed').length;
  $('#stats-grid').innerHTML = `
    <div class="stat-card" data-icon="📦">
      <div class="stat-value">${reqs.length}</div>
      <div class="stat-label">Mes demandes</div>
    </div>
    <div class="stat-card" data-icon="⏳">
      <div class="stat-value">${pending}</div>
      <div class="stat-label">En attente</div>
    </div>
    <div class="stat-card" data-icon="🚛">
      <div class="stat-value">${active}</div>
      <div class="stat-label">En cours</div>
    </div>
    <div class="stat-card" data-icon="✅">
      <div class="stat-value">${completed}</div>
      <div class="stat-label">Terminées</div>
    </div>
  `;
}

function renderRecentActivity(reqs) {
  const list = $('#recent-activity');
  const sorted = [...reqs].sort((a,b) => new Date(b.updatedAt||b.createdAt) - new Date(a.updatedAt||a.createdAt)).slice(0, 8);
  list.innerHTML = sorted.length ? sorted.map(r => `
    <div class="activity-item">
      <div class="activity-dot"></div>
      <div>
        <strong>${r.fromLocation} → ${r.toLocation}</strong>
        <div>${statusBadge(r.status)}</div>
      </div>
      <div class="activity-time">${timeAgo(r.updatedAt || r.createdAt)}</div>
    </div>
  `).join('') : '<div class="activity-item">Aucune activité récente</div>';
}

function renderStatusBreakdown(reqs) {
  const total = reqs.length || 1;
  const statuses = [
    { key:'pending',    label:'En attente', color:'#f59e0b' },
    { key:'accepted',   label:'Acceptées',  color:'#3b82f6' },
    { key:'in_progress',label:'En cours',   color:'#a855f7' },
    { key:'completed',  label:'Terminées',  color:'#22c55e' },
    { key:'cancelled',  label:'Annulées',   color:'#94a3b8' },
  ];
  $('#status-breakdown').innerHTML = statuses.map(s => {
    const count = reqs.filter(r => r.status === s.key).length;
    const pct = Math.round((count / total) * 100);
    return `
      <div class="status-row">
        <div class="status-row-header"><span>${s.label}</span><span>${count}</span></div>
        <div class="status-bar-bg">
          <div class="status-bar-fill" style="width:${pct}%;background:${s.color}"></div>
        </div>
      </div>`;
  }).join('');
}

/* ─── REQUESTS ────────────────────────────────────── */
async function loadRequests() {
  try {
    allRequests = currentUser.role === 'admin'
      ? await AdminAPI.getRequests()
      : await RequestsAPI.getAll();
    renderRequestCards(allRequests);
    $('#new-request-btn').style.display = currentUser.role === 'client' ? 'block' : 'none';
  } catch (e) { toast(e.message, 'error'); }
}

function renderRequestCards(reqs) {
  const grid = $('#requests-grid');
  if (!reqs.length) {
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:60px;color:#64748b">
        <div style="font-size:48px;margin-bottom:12px">📭</div>
        <p style="font-size:16px">Aucune demande trouvée</p>
      </div>`;
    return;
  }
  grid.innerHTML = reqs.map((r, i) => `
    <div class="req-card" data-id="${r._id}" style="animation-delay:${i*0.05}s">
      <div class="req-card-header">
        <div class="req-route">
          ${r.fromLocation} <span>→</span> ${r.toLocation}
        </div>
        ${statusBadge(r.status)}
      </div>
      <div class="req-card-body">
        <div class="req-meta">🚚 <strong>${vehicleLabel(r.vehicleType)}</strong></div>
        <div class="req-meta">📅 <strong>${formatDate(r.scheduledDate)}</strong></div>
        ${r.weight ? `<div class="req-meta">⚖️ <strong>${r.weight} kg</strong></div>` : ''}
        ${r.description ? `<div class="req-meta" style="font-style:italic;color:#94a3b8">${r.description.slice(0,60)}${r.description.length>60?'…':''}</div>` : ''}
      </div>
      <div class="req-card-footer">
        <div class="req-client">
          ${r.client ? `👤 ${r.client.name}` : ''}
          ${r.transporter ? ` &nbsp;·&nbsp; 🚚 ${r.transporter.name}` : ''}
        </div>
        <div class="req-price">
          ${r.estimatedPrice ? `${r.estimatedPrice} €` : '—'}
          ${r.estimatedPrice ? '<span> estimé</span>' : ''}
        </div>
      </div>
    </div>
  `).join('');

  // click → detail
  $$('.req-card').forEach(card => {
    card.addEventListener('click', () => openRequestDetail(card.dataset.id));
  });
}

// filter/search
function filterRequests() {
  const q      = $('#req-search').value.toLowerCase();
  const status = $('#req-filter').value;
  const filtered = allRequests.filter(r => {
    const matchQ = !q ||
      r.fromLocation.toLowerCase().includes(q) ||
      r.toLocation.toLowerCase().includes(q) ||
      (r.client?.name||'').toLowerCase().includes(q);
    const matchS = !status || r.status === status;
    return matchQ && matchS;
  });
  renderRequestCards(filtered);
}

async function openRequestDetail(id) {
  try {
    const r = await RequestsAPI.getOne(id);
    const content = $('#request-detail-content');
    const role    = currentUser.role;

    let actions = '';
    if (role === 'transporter' && r.status === 'pending') {
      actions += `<button class="btn-success" onclick="changeStatus('${r._id}','accepted')">✅ Accepter</button>`;
      actions += `<button class="btn-danger"  onclick="changeStatus('${r._id}','rejected')">✗ Refuser</button>`;
    }
    if (role === 'transporter' && r.status === 'accepted') {
      actions += `<button class="btn-primary" onclick="changeStatus('${r._id}','in_progress')">🚛 Démarrer</button>`;
    }
    if (role === 'transporter' && r.status === 'in_progress') {
      actions += `<button class="btn-success" onclick="changeStatus('${r._id}','completed')">✅ Terminer</button>`;
    }
    if (role === 'client' && r.status === 'pending') {
      actions += `<button class="btn-danger" onclick="changeStatus('${r._id}','cancelled')">✗ Annuler</button>`;
    }
    if (r.transporter && role === 'client') {
      actions += `<button class="btn-secondary" onclick="openChatWith('${r.transporter._id}','${r.transporter.name}')">💬 Contacter le transporteur</button>`;
    }
    if (r.client && role === 'transporter' && r.transporter?._id === currentUser._id) {
      actions += `<button class="btn-secondary" onclick="openChatWith('${r.client._id}','${r.client.name}')">💬 Contacter le client</button>`;
    }

    content.innerHTML = `
      <div class="modal-body">
        <div class="detail-grid">
          <div class="detail-item">
            <div class="detail-label">Départ</div>
            <div class="detail-value">📍 ${r.fromLocation}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Arrivée</div>
            <div class="detail-value">📍 ${r.toLocation}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Véhicule</div>
            <div class="detail-value">🚚 ${vehicleLabel(r.vehicleType)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Date souhaitée</div>
            <div class="detail-value">📅 ${formatDate(r.scheduledDate)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Poids</div>
            <div class="detail-value">${r.weight ? r.weight+' kg' : '—'}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Prix estimé</div>
            <div class="detail-value" style="color:#f97316;font-weight:700">${r.estimatedPrice ? r.estimatedPrice+' €' : '—'}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Statut</div>
            <div class="detail-value">${statusBadge(r.status)}</div>
          </div>
          <div class="detail-item">
            <div class="detail-label">Créé le</div>
            <div class="detail-value">${formatDate(r.createdAt)}</div>
          </div>
          ${r.client ? `
          <div class="detail-item">
            <div class="detail-label">Client</div>
            <div class="detail-value">👤 ${r.client.name} · ${r.client.phone || r.client.email}</div>
          </div>` : ''}
          ${r.transporter ? `
          <div class="detail-item">
            <div class="detail-label">Transporteur</div>
            <div class="detail-value">🚛 ${r.transporter.name} · ${r.transporter.phone || r.transporter.email}</div>
          </div>` : ''}
        </div>
        ${r.description ? `
        <div class="detail-item" style="margin-bottom:16px">
          <div class="detail-label">Description</div>
          <div class="detail-value" style="font-style:italic;color:#64748b">${r.description}</div>
        </div>` : ''}
        ${actions ? `<div class="detail-actions">${actions}</div>` : ''}
      </div>
    `;
    openModal('modal-request-detail');
  } catch (e) { toast(e.message, 'error'); }
}

window.changeStatus = async function(id, status) {
  try {
    await RequestsAPI.updateStatus(id, status);
    socket?.emit('request_updated', { id, status });
    toast('Statut mis à jour');
    closeModal('modal-request-detail');
    await loadRequests();
    if (currentUser.role === 'admin' || document.querySelector('#page-dashboard:not(.hidden)')) {
      await loadDashboard();
    }
  } catch (e) { toast(e.message, 'error'); }
};

/* ─── NEW REQUEST FORM ────────────────────────────── */
async function submitNewRequest(e) {
  e.preventDefault();
  const err = $('#req-error');
  err.textContent = '';

  const payload = {
    fromLocation  : $('#req-from').value.trim(),
    toLocation    : $('#req-to').value.trim(),
    vehicleType   : $('#req-vehicle').value,
    weight        : parseFloat($('#req-weight').value) || 0,
    scheduledDate : $('#req-date').value,
    estimatedPrice: parseFloat($('#req-price').value) || 0,
    description   : $('#req-desc').value.trim(),
  };

  if (!payload.fromLocation || !payload.toLocation || !payload.vehicleType || !payload.scheduledDate) {
    err.textContent = 'Veuillez remplir tous les champs obligatoires.';
    return;
  }

  try {
    await RequestsAPI.create(payload);
    toast('Demande publiée avec succès !');
    closeModal('modal-new-request');
    $('#new-request-form').reset();
    await loadRequests();
  } catch (e2) {
    err.textContent = e2.message;
  }
}

/* ─── MESSAGES / CHAT ─────────────────────────────── */
async function loadConversations() {
  try {
    const convs = await MessagesAPI.getConversations();
    const list  = $('#conversations-list');

    list.innerHTML = convs.length ? convs.map(c => `
      <div class="conv-item" data-uid="${c.partner._id}" data-name="${c.partner.name}">
        <div class="conv-avatar">${initials(c.partner.name)}</div>
        <div class="conv-info">
          <div class="conv-name">${c.partner.name}</div>
          <div class="conv-preview">${c.lastMessage?.content || '…'}</div>
        </div>
        ${c.unread > 0 ? `<div class="conv-unread">${c.unread}</div>` : ''}
      </div>
    `).join('') : `<div style="padding:24px;text-align:center;color:#94a3b8;font-size:14px">Aucune conversation</div>`;

    $$('.conv-item').forEach(item => {
      item.addEventListener('click', () => {
        $$('.conv-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        openChat(item.dataset.uid, item.dataset.name);
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

async function openChat(userId, userName) {
  activeChatUser = { _id: userId, name: userName };
  const main = $('#chat-main');

  main.innerHTML = `
    <div class="chat-header">
      <div class="conv-avatar" style="width:36px;height:36px;font-size:14px">${initials(userName)}</div>
      <div>
        <div style="font-weight:600;font-size:15px">${userName}</div>
        <div class="typing-indicator" id="typing-indicator"></div>
      </div>
    </div>
    <div class="chat-messages" id="chat-messages"></div>
    <div class="chat-input-area">
      <textarea id="chat-textarea" rows="1" placeholder="Écrire un message…"></textarea>
      <button class="chat-send-btn" id="chat-send">Envoyer</button>
    </div>
  `;

  await fetchMessages(userId);

  const textarea = $('#chat-textarea');
  const sendBtn  = $('#chat-send');

  sendBtn.addEventListener('click', sendMessage);
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  });
  textarea.addEventListener('input', () => {
    socket?.emit('typing', { receiverId: userId, senderName: currentUser.name });
  });

  // auto-resize textarea
  textarea.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
  });
}

async function fetchMessages(userId) {
  try {
    const msgs = await MessagesAPI.getThread(userId);
    renderMessages(msgs);
  } catch (e) { toast(e.message, 'error'); }
}

function renderMessages(msgs) {
  const container = $('#chat-messages');
  if (!container) return;
  container.innerHTML = msgs.length ? msgs.map(m => {
    const mine = m.sender._id === currentUser._id || m.sender === currentUser._id;
    return `
      <div class="msg-row ${mine ? 'mine' : ''}">
        ${!mine ? `<div class="msg-avatar">${initials(m.sender.name || '')}</div>` : ''}
        <div>
          <div class="msg-bubble">${escapeHtml(m.content)}</div>
          <div class="msg-time">${formatTime(m.createdAt)}</div>
        </div>
      </div>`;
  }).join('') : `<div style="flex:1;display:flex;align-items:center;justify-content:center;color:#94a3b8;font-size:14px">Démarrez la conversation !</div>`;
  container.scrollTop = container.scrollHeight;
}

async function sendMessage() {
  const textarea = $('#chat-textarea');
  const content  = textarea.value.trim();
  if (!content || !activeChatUser) return;

  textarea.value = '';
  textarea.style.height = 'auto';

  try {
    const msg = await MessagesAPI.send({ receiver: activeChatUser._id, content });

    // Optimistic add
    const container = $('#chat-messages');
    const div = document.createElement('div');
    div.className = 'msg-row mine';
    div.innerHTML = `
      <div>
        <div class="msg-bubble">${escapeHtml(content)}</div>
        <div class="msg-time">${formatTime(new Date())}</div>
      </div>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;

    // emit via socket
    socket?.emit('send_message', {
      ...msg,
      receiverId: activeChatUser._id,
      senderId  : currentUser._id,
    });
  } catch (e) { toast(e.message, 'error'); }
}

function escapeHtml(str) {
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

// Open chat from request detail
window.openChatWith = function(userId, userName) {
  closeModal('modal-request-detail');
  navigate('messages');
  setTimeout(() => openChat(userId, userName), 200);
};

/* ─── ADMIN USERS ─────────────────────────────────── */
async function loadUsers() {
  try {
    const users = await AdminAPI.getUsers();
    renderUsersTable(users);

    // live search + filter
    $('#user-search').addEventListener('input', () => {
      const q = $('#user-search').value.toLowerCase();
      const role = $('#user-role-filter').value;
      renderUsersTable(users.filter(u =>
        (!q || u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)) &&
        (!role || u.role === role)
      ));
    });
    $('#user-role-filter').addEventListener('change', () => $('#user-search').dispatchEvent(new Event('input')));
  } catch (e) { toast(e.message, 'error'); }
}

function renderUsersTable(users) {
  const tbody = $('#users-tbody');
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>
        <div class="td-user">
          <div class="td-avatar">${initials(u.name)}</div>
          <strong>${u.name}</strong>
        </div>
      </td>
      <td>${u.email}</td>
      <td>${roleBadge(u.role)}</td>
      <td>${u.phone || '—'}</td>
      <td>${formatDate(u.createdAt)}</td>
      <td>
        <div class="td-actions">
          <select class="filter-select" style="padding:6px 10px;font-size:12px" onchange="changeUserRole('${u._id}',this.value)">
            <option value="client"      ${u.role==='client'?'selected':''}>Client</option>
            <option value="transporter" ${u.role==='transporter'?'selected':''}>Transporteur</option>
            <option value="admin"       ${u.role==='admin'?'selected':''}>Admin</option>
          </select>
          <button class="btn-danger" onclick="deleteUser('${u._id}','${u.name}')">🗑</button>
        </div>
      </td>
    </tr>
  `).join('');
}

window.changeUserRole = async function(id, role) {
  try {
    await AdminAPI.updateUser(id, { role });
    toast('Rôle mis à jour');
  } catch (e) { toast(e.message, 'error'); }
};

window.deleteUser = async function(id, name) {
  if (!confirm(`Supprimer l'utilisateur "${name}" ?`)) return;
  try {
    await AdminAPI.deleteUser(id);
    toast('Utilisateur supprimé');
    await loadUsers();
  } catch (e) { toast(e.message, 'error'); }
};

/* ─── PROFILE ─────────────────────────────────────── */
function loadProfile() {
  const u = currentUser;
  $('#profile-avatar-display').textContent = initials(u.name);
  $('#profile-name').value    = u.name    || '';
  $('#profile-email').value   = u.email   || '';
  $('#profile-phone').value   = u.phone   || '';
  $('#profile-address').value = u.address || '';
}

async function submitProfile(e) {
  e.preventDefault();
  const msg = $('#profile-msg');
  try {
    const updated = await AuthAPI.updateProfile({
      name   : $('#profile-name').value.trim(),
      phone  : $('#profile-phone').value.trim(),
      address: $('#profile-address').value.trim(),
    });
    currentUser = { ...currentUser, ...updated };
    Auth.setUser(currentUser);
    updateNavUser();
    msg.textContent = '✓ Profil mis à jour avec succès';
    setTimeout(() => msg.textContent = '', 3000);
  } catch (err) { toast(err.message, 'error'); }
}

/* ─── AUTH FORMS ──────────────────────────────────── */
async function submitLogin(e) {
  e.preventDefault();
  const err = $('#login-error');
  err.textContent = '';
  try {
    const { token, user } = await AuthAPI.login(
      $('#login-email').value, $('#login-password').value
    );
    Auth.setToken(token);
    Auth.setUser(user);
    currentUser = user;
    bootApp();
  } catch (ex) { err.textContent = ex.message; }
}

async function submitRegister(e) {
  e.preventDefault();
  const err = $('#reg-error');
  err.textContent = '';
  const role = $('input[name="role"]:checked').value;
  try {
    const { token, user } = await AuthAPI.register({
      name    : $('#reg-name').value.trim(),
      email   : $('#reg-email').value.trim(),
      password: $('#reg-password').value,
      phone   : $('#reg-phone').value.trim(),
      role,
    });
    Auth.setToken(token);
    Auth.setUser(user);
    currentUser = user;
    bootApp();
  } catch (ex) { err.textContent = ex.message; }
}

/* ─── SOCKET.IO ───────────────────────────────────── */
function initSocket() {
  socket = io();
  socket.emit('user_online', currentUser._id);

  socket.on('receive_message', (msg) => {
    // If the chat is open with this sender → append
    if (activeChatUser && msg.senderId === activeChatUser._id) {
      const container = $('#chat-messages');
      if (container) {
        const div = document.createElement('div');
        div.className = 'msg-row';
        div.innerHTML = `
          <div class="msg-avatar">${initials(activeChatUser.name)}</div>
          <div>
            <div class="msg-bubble">${escapeHtml(msg.content)}</div>
            <div class="msg-time">${formatTime(new Date())}</div>
          </div>`;
        container.appendChild(div);
        container.scrollTop = container.scrollHeight;
      }
    } else {
      // Show notification badge
      const badge = $('#notif-badge');
      badge.classList.remove('hidden');
      badge.textContent = parseInt(badge.textContent || 0) + 1;
      toast(`💬 Nouveau message de ${msg.sender?.name || 'quelqu\'un'}`, 'info');
    }
  });

  socket.on('typing', (data) => {
    if (activeChatUser && data.receiverId === currentUser._id) {
      const ind = $('#typing-indicator');
      if (ind) {
        ind.textContent = `${data.senderName} écrit…`;
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => { if (ind) ind.textContent = ''; }, 2000);
      }
    }
  });

  socket.on('request_status_changed', async () => {
    const reqPage = $('#page-requests:not(.hidden)');
    if (reqPage) await loadRequests();
  });
}

/* ─── MODALS ──────────────────────────────────────── */
function openModal(id)  { $(`#${id}`).classList.remove('hidden'); }
function closeModal(id) { $(`#${id}`).classList.add('hidden'); }

/* ─── UI UTILS ────────────────────────────────────── */
function updateNavUser() {
  const u = currentUser;
  $('#nav-name').textContent    = u.name;
  $('#nav-role').textContent    = u.role;
  $('#nav-avatar').textContent  = initials(u.name);
  $('#topbar-avatar').textContent = initials(u.name);
}

/* ─── BOOT ────────────────────────────────────────── */
function bootApp() {
  // Hide auth, show app
  $('#auth-overlay').classList.remove('active');
  $('#auth-overlay').classList.add('hidden');
  $('#app').classList.remove('hidden');

  updateNavUser();
  buildNav(currentUser.role);
  initSocket();

  // Set min date for request form
  const today = new Date().toISOString().split('T')[0];
  const dateInput = $('#req-date');
  if (dateInput) dateInput.min = today;

  navigate('dashboard');
}

/* ─── EVENT LISTENERS ─────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {

  // ── Auth tabs ──
  $$('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      $$('.auth-tab').forEach(t => t.classList.remove('active'));
      $$('.auth-form').forEach(f => f.classList.remove('active'));
      tab.classList.add('active');
      $(`#${tab.dataset.tab}-form`).classList.add('active');
    });
  });

  // ── Auth forms ──
  $('#login-form').addEventListener('submit', submitLogin);
  $('#register-form').addEventListener('submit', submitRegister);

  // ── Request filters ──
  $('#req-search').addEventListener('input', filterRequests);
  $('#req-filter').addEventListener('change', filterRequests);

  // ── New request button ──
  $('#new-request-btn').addEventListener('click', () => openModal('modal-new-request'));
  $('#new-request-form').addEventListener('submit', submitNewRequest);

  // ── Profile form ──
  $('#profile-form').addEventListener('submit', submitProfile);

  // ── Modal close buttons ──
  $$('.modal-close').forEach(btn => {
    btn.addEventListener('click', () => closeModal(btn.dataset.modal));
  });
  $$('.modal-overlay').forEach(overlay => {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.classList.add('hidden');
    });
  });

  // ── Sidebar toggle (mobile) ──
  $('#menu-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#sidebar-close').addEventListener('click', () => $('#sidebar').classList.remove('open'));

  // ── Logout ──
  $('#logout-btn').addEventListener('click', () => {
    socket?.disconnect();
    Auth.clear();
    currentUser = null;
    activeChatUser = null;
    $('#app').classList.add('hidden');
    $('#auth-overlay').classList.remove('hidden');
    $('#auth-overlay').classList.add('active');
    $('#login-form').reset();
    $('#register-form').reset();
    toast('Déconnecté avec succès', 'info');
  });

  // ── Notification bell clears badge ──
  $('#notif-btn').addEventListener('click', () => {
    $('#notif-badge').classList.add('hidden');
    $('#notif-badge').textContent = '0';
    navigate('messages');
  });

  // ── Check existing session ──
  if (Auth.isLoggedIn()) {
    currentUser = Auth.getUser();
    if (currentUser) {
      bootApp();
      // Re-validate token silently
      AuthAPI.me().then(u => {
        currentUser = u;
        Auth.setUser(u);
        updateNavUser();
      }).catch(() => {
        Auth.clear();
        location.reload();
      });
    }
  }

  // ── Demo seed button hint ──
  // Creates a demo admin if no account exists
  setupDemoData();
});

/* ─── DEMO DATA SEEDER ────────────────────────────── */

  // Try to register a demo admin silently — will fail if already exists, that's fine
  try {
    await AuthAPI.register({
      name: 'Administrateur', email: 'admin@demo.com',
      password: 'admin123', role: 'admin'
    });
  } catch (_) { /* already exists */ }

  try {
    await AuthAPI.register({
      name: 'Jean Client', email: 'client@demo.com',
      password: 'client123', role: 'client', phone: '+213 555 00 01'
    });
  } catch (_) {}

  try {
    await AuthAPI.register({
      name: 'Ahmed Transport', email: 'transport@demo.com',
      password: 'transport123', role: 'transporter', phone: '+213 555 00 02'
    });
  } catch (_) {}

