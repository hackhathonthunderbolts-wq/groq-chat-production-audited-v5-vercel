/*
 * Add-on feature: incoming connection request approval.
 * Kept separate from the existing React application so the core chat UI/logic
 * is not rewritten. The existing API already supports pending/declined states.
 */
(() => {
  const STATE_KEY = 'demo-secret-state-v2';
  const POLL_MS = 2500;
  const STYLE_ID = 'connection-request-addon-style';
  const ROOT_ID = 'connection-request-addon';

  const readState = () => {
    try {
      const value = JSON.parse(localStorage.getItem(STATE_KEY) || 'null');
      return value && typeof value.me === 'string' ? value : null;
    } catch {
      return null;
    }
  };

  const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[char]));

  function installStyles() {
    if (document.getElementById(STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${ROOT_ID}{position:fixed;right:22px;top:22px;z-index:2147483000;width:min(390px,calc(100vw - 32px));font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;}
      .cra-card{background:rgba(255,255,255,.98);border:1px solid rgba(0,0,0,.10);border-radius:18px;box-shadow:0 18px 55px rgba(0,0,0,.18);padding:18px;color:#171717;backdrop-filter:blur(14px);animation:cra-in .22s ease-out}
      .cra-head{display:flex;align-items:center;gap:11px}.cra-icon{width:38px;height:38px;border-radius:12px;display:grid;place-items:center;background:#111;color:#fff;font-weight:800}.cra-title{font-size:15px;font-weight:750}.cra-sub{font-size:12px;color:#737373;margin-top:2px}
      .cra-text{font-size:13px;line-height:1.45;margin:14px 0 16px;color:#444}.cra-actions{display:flex;gap:9px}.cra-btn{border:0;border-radius:10px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer}.cra-accept{background:#111;color:#fff}.cra-reject{background:#f1f1f1;color:#333}.cra-btn:disabled{opacity:.55;cursor:wait}.cra-status{font-size:12px;margin-top:10px;color:#666}
      @keyframes cra-in{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-color-scheme:dark){.cra-card{background:rgba(28,28,28,.98);border-color:rgba(255,255,255,.12);color:#f5f5f5}.cra-sub,.cra-text,.cra-status{color:#aaa}.cra-reject{background:#333;color:#eee}}
    `;
    document.head.appendChild(style);
  }

  const getRoot = () => {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      root = document.createElement('div');
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    return root;
  };

  const hide = () => {
    const root = document.getElementById(ROOT_ID);
    if (root) root.innerHTML = '';
  };

  async function request(url, options) {
    const response = await fetch(url, options);
    const raw = await response.text();
    let data = {};
    try { data = raw ? JSON.parse(raw) : {}; } catch { /* handled below */ }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }

  async function loadIncoming() {
    const state = readState();
    if (!state?.me) return;

    try {
      const rows = await request(`/api/connections/${encodeURIComponent(state.me)}`);
      const incoming = Array.isArray(rows)
        ? rows.find(row => row.status === 'pending' && row.addressee_id === state.me)
        : null;
      if (!incoming) {
        hide();
        return;
      }

      installStyles();
      const root = getRoot();
      if (root.dataset.requestId === incoming.id) return;
      root.dataset.requestId = incoming.id;
      root.innerHTML = `
        <div class="cra-card" role="dialog" aria-live="polite" aria-label="Connection request">
          <div class="cra-head">
            <div class="cra-icon">↗</div>
            <div><div class="cra-title">New connection request</div><div class="cra-sub">${escapeHtml(incoming.name || 'Another user')}</div></div>
          </div>
          <div class="cra-text">This user has sent you their sender link. Would you like to accept the connection and enable messaging?</div>
          <div class="cra-actions">
            <button class="cra-btn cra-accept" data-action="accept">Accept</button>
            <button class="cra-btn cra-reject" data-action="reject">Reject</button>
          </div>
          <div class="cra-status" hidden></div>
        </div>`;

      root.querySelectorAll('.cra-btn').forEach(button => {
        button.addEventListener('click', async () => {
          const action = button.dataset.action;
          const buttons = [...root.querySelectorAll('.cra-btn')];
          const status = root.querySelector('.cra-status');
          buttons.forEach(item => item.disabled = true);
          status.hidden = false;
          status.textContent = action === 'accept' ? 'Accepting connection…' : 'Rejecting request…';
          try {
            if (action === 'reject') {
              await request(`/api/connections/${encodeURIComponent(incoming.id)}`, {
                method: 'PATCH',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({status: 'declined'})
              });
            } else {
              // The existing backend completes the mutual handshake when the
              // receiver submits their own sender link. This is the same action
              // as pressing Accept, without requiring the user to paste a link.
              await request('/api/connections', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({requesterId: state.me, addresseeId: incoming.requester_id})
              });
            }
            root.dataset.requestId = '';
            hide();
          } catch (error) {
            status.textContent = error.message || 'Could not update the request.';
            buttons.forEach(item => item.disabled = false);
          }
        });
      });
    } catch {
      // Database/API may be disabled; leave the existing application untouched.
    }
  }

  function start() {
    loadIncoming();
    setInterval(loadIncoming, POLL_MS);
    window.addEventListener('storage', loadIncoming);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
