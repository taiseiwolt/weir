/**
 * Weir Chat Widget v1.0
 *
 * 共通チャットウィジェット。事業者向け / エンドユーザー向け 両対応。
 *
 * Usage:
 *   <script src="aiden-chat-widget.js"></script>
 *   <script>
 *     new AidenChatWidget({
 *       contextType: 'merchant', // or 'enduser'
 *       storeId: '...',
 *       brandId: '...',
 *       memberId: '...',       // optional (logged-in member)
 *       operatorId: '...',     // optional (merchant operator)
 *       supabaseClient: sb,    // existing Supabase client
 *       apiBase: 'https://weir.co.jp',
 *     });
 *   </script>
 */

class AidenChatWidget {
  constructor(options = {}) {
    this.contextType = options.contextType || 'enduser';
    this.storeId = options.storeId || null;
    this.brandId = options.brandId || null;
    this.memberId = options.memberId || null;
    this.operatorId = options.operatorId || null;
    this.guestSessionId = options.guestSessionId || null;
    this.sb = options.supabaseClient || null;
    this.apiBase = options.apiBase || 'https://weir.co.jp';

    this.sessionId = null;
    this.isOpen = false;
    this.isLoading = false;
    this.realtimeChannel = null;

    // Restore session from localStorage
    const storageKey = `aiden_chat_session_${this.contextType}_${this.storeId || 'global'}`;
    this.sessionId = localStorage.getItem(storageKey) || null;
    this.storageKey = storageKey;

    // Generate guest session ID if needed
    if (!this.memberId && !this.operatorId && !this.guestSessionId) {
      this.guestSessionId = localStorage.getItem('aiden_guest_session') || this._generateGuestId();
      localStorage.setItem('aiden_guest_session', this.guestSessionId);
    }

    this._injectStyles();
    this._createDOM();
    this._attachEvents();

    // Load history if session exists
    if (this.sessionId) {
      this._loadHistory();
      this._subscribeRealtime();
    }
  }

  _generateGuestId() {
    return 'guest_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 8);
  }

  _injectStyles() {
    if (document.getElementById('aiden-chat-widget-styles')) return;

    const style = document.createElement('style');
    style.id = 'aiden-chat-widget-styles';
    style.textContent = `
      .acw-btn {
        position: fixed;
        bottom: 24px;
        right: 24px;
        width: 56px;
        height: 56px;
        border-radius: 50%;
        background: #D32F2F;
        color: #fff;
        border: none;
        cursor: pointer;
        box-shadow: 0 4px 16px rgba(211,47,47,0.35);
        z-index: 9998;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: transform 0.2s, box-shadow 0.2s;
        font-size: 24px;
        line-height: 1;
      }
      .acw-btn:hover {
        transform: scale(1.08);
        box-shadow: 0 6px 24px rgba(211,47,47,0.45);
      }
      .acw-btn svg {
        width: 28px;
        height: 28px;
        fill: #fff;
      }

      .acw-window {
        position: fixed;
        bottom: 92px;
        right: 24px;
        width: 380px;
        height: 60vh;
        max-height: 600px;
        min-height: 400px;
        background: #fff;
        border-radius: 16px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.18);
        z-index: 9999;
        display: none;
        flex-direction: column;
        overflow: hidden;
        font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'Noto Sans JP', sans-serif;
      }
      .acw-window.acw-open {
        display: flex;
      }

      .acw-header {
        background: #D32F2F;
        color: #fff;
        padding: 16px 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-shrink: 0;
      }
      .acw-header-title {
        font-size: 15px;
        font-weight: 700;
        letter-spacing: 0.5px;
      }
      .acw-header-sub {
        font-size: 11px;
        opacity: 0.85;
        margin-top: 2px;
      }
      .acw-close {
        background: none;
        border: none;
        color: #fff;
        font-size: 22px;
        cursor: pointer;
        padding: 0 4px;
        opacity: 0.8;
        line-height: 1;
      }
      .acw-close:hover { opacity: 1; }

      .acw-messages {
        flex: 1;
        overflow-y: auto;
        padding: 16px;
        display: flex;
        flex-direction: column;
        gap: 12px;
        background: #F8F9FA;
      }

      .acw-msg {
        max-width: 85%;
        padding: 10px 14px;
        border-radius: 12px;
        font-size: 14px;
        line-height: 1.6;
        word-break: break-word;
        position: relative;
      }
      .acw-msg-user {
        align-self: flex-end;
        background: #D32F2F;
        color: #fff;
        border-bottom-right-radius: 4px;
      }
      .acw-msg-assistant {
        align-self: flex-start;
        background: #fff;
        color: #333;
        border: 1px solid #E0E0E0;
        border-bottom-left-radius: 4px;
      }
      .acw-msg-system {
        align-self: center;
        background: #FFF3E0;
        color: #E65100;
        font-size: 12px;
        text-align: center;
        border-radius: 8px;
        max-width: 90%;
      }

      .acw-feedback {
        display: flex;
        gap: 8px;
        margin-top: 6px;
      }
      .acw-feedback button {
        background: none;
        border: 1px solid #E0E0E0;
        border-radius: 6px;
        padding: 2px 8px;
        cursor: pointer;
        font-size: 14px;
        transition: background 0.15s;
      }
      .acw-feedback button:hover {
        background: #F5F5F5;
      }
      .acw-feedback button.acw-fb-active {
        background: #E8F5E9;
        border-color: #4CAF50;
      }
      .acw-feedback button.acw-fb-active-neg {
        background: #FFEBEE;
        border-color: #F44336;
      }

      .acw-typing {
        align-self: flex-start;
        padding: 12px 18px;
        background: #fff;
        border: 1px solid #E0E0E0;
        border-radius: 12px;
        border-bottom-left-radius: 4px;
        display: none;
      }
      .acw-typing.acw-show { display: block; }
      .acw-typing span {
        display: inline-block;
        width: 8px;
        height: 8px;
        background: #999;
        border-radius: 50%;
        margin: 0 2px;
        animation: acwBounce 1.4s infinite ease-in-out both;
      }
      .acw-typing span:nth-child(1) { animation-delay: -0.32s; }
      .acw-typing span:nth-child(2) { animation-delay: -0.16s; }

      @keyframes acwBounce {
        0%, 80%, 100% { transform: scale(0); }
        40% { transform: scale(1); }
      }

      .acw-input-area {
        padding: 12px 16px;
        border-top: 1px solid #E0E0E0;
        display: flex;
        gap: 8px;
        background: #fff;
        flex-shrink: 0;
      }
      .acw-input {
        flex: 1;
        border: 1px solid #E0E0E0;
        border-radius: 10px;
        padding: 10px 14px;
        font-size: 14px;
        outline: none;
        resize: none;
        max-height: 80px;
        font-family: inherit;
        line-height: 1.4;
      }
      .acw-input:focus { border-color: #D32F2F; }
      .acw-send {
        background: #D32F2F;
        color: #fff;
        border: none;
        border-radius: 10px;
        padding: 0 16px;
        cursor: pointer;
        font-size: 15px;
        font-weight: 600;
        transition: background 0.15s;
        flex-shrink: 0;
      }
      .acw-send:hover { background: #B71C1C; }
      .acw-send:disabled { background: #BDBDBD; cursor: not-allowed; }

      .acw-error {
        text-align: center;
        padding: 24px;
        color: #666;
        font-size: 13px;
        line-height: 1.6;
      }
      .acw-error a {
        color: #D32F2F;
        text-decoration: underline;
      }

      .acw-welcome {
        text-align: center;
        padding: 32px 24px;
        color: #666;
      }
      .acw-welcome-icon {
        font-size: 48px;
        margin-bottom: 12px;
      }
      .acw-welcome-title {
        font-size: 16px;
        font-weight: 700;
        color: #333;
        margin-bottom: 8px;
      }
      .acw-welcome-desc {
        font-size: 13px;
        line-height: 1.6;
      }

      @media (max-width: 480px) {
        .acw-window {
          width: calc(100vw - 16px);
          right: 8px;
          bottom: 80px;
          height: 70vh;
          max-height: none;
          border-radius: 12px;
        }
        .acw-btn {
          bottom: 16px;
          right: 16px;
          width: 48px;
          height: 48px;
        }
      }
    `;
    document.head.appendChild(style);
  }

  _createDOM() {
    // Floating button
    this.btnEl = document.createElement('button');
    this.btnEl.className = 'acw-btn';
    this.btnEl.setAttribute('aria-label', 'チャットを開く');
    this.btnEl.innerHTML = `<svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H5.2L4 17.2V4h16v12z"/></svg>`;
    document.body.appendChild(this.btnEl);

    // Chat window
    this.windowEl = document.createElement('div');
    this.windowEl.className = 'acw-window';

    const isMerchant = this.contextType === 'merchant';
    const titleText = isMerchant ? 'Weir サポート' : 'チャットサポート';
    const subText = isMerchant ? 'お困りのことがあればお気軽にどうぞ' : 'ご質問がありましたらお気軽にどうぞ';

    this.windowEl.innerHTML = `
      <div class="acw-header">
        <div>
          <div class="acw-header-title">${titleText}</div>
          <div class="acw-header-sub">${subText}</div>
        </div>
        <button class="acw-close" aria-label="閉じる">&times;</button>
      </div>
      <div class="acw-messages" id="acwMessages">
        <div class="acw-welcome">
          <div class="acw-welcome-icon">${isMerchant ? '💼' : '👋'}</div>
          <div class="acw-welcome-title">${isMerchant ? 'Weir サポートへようこそ' : 'こんにちは！'}</div>
          <div class="acw-welcome-desc">${isMerchant
            ? 'Weirの使い方や設定についてお気軽にご質問ください。AIアシスタントがお答えします。'
            : 'ご注文やお店についてのご質問にお答えします。お気軽にどうぞ！'
          }</div>
        </div>
        <div class="acw-typing" id="acwTyping">
          <span></span><span></span><span></span>
        </div>
      </div>
      <div class="acw-input-area">
        <textarea class="acw-input" id="acwInput" placeholder="メッセージを入力..." rows="1"></textarea>
        <button class="acw-send" id="acwSend">送信</button>
      </div>
    `;
    document.body.appendChild(this.windowEl);

    // Cache refs
    this.messagesEl = this.windowEl.querySelector('#acwMessages');
    this.typingEl = this.windowEl.querySelector('#acwTyping');
    this.inputEl = this.windowEl.querySelector('#acwInput');
    this.sendBtn = this.windowEl.querySelector('#acwSend');
    this.welcomeEl = this.windowEl.querySelector('.acw-welcome');
  }

  _attachEvents() {
    // Toggle chat
    this.btnEl.addEventListener('click', () => this.toggle());

    // Close
    this.windowEl.querySelector('.acw-close').addEventListener('click', () => this.close());

    // Send
    this.sendBtn.addEventListener('click', () => this._sendMessage());

    // Enter to send (Shift+Enter for newline)
    this.inputEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        this._sendMessage();
      }
    });

    // Auto-resize textarea
    this.inputEl.addEventListener('input', () => {
      this.inputEl.style.height = 'auto';
      this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 80) + 'px';
    });

    // ESC to close
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isOpen) this.close();
    });
  }

  toggle() {
    this.isOpen ? this.close() : this.open();
  }

  open() {
    this.isOpen = true;
    this.windowEl.classList.add('acw-open');
    this.inputEl.focus();
    this._scrollToBottom();
  }

  close() {
    this.isOpen = false;
    this.windowEl.classList.remove('acw-open');
  }

  async _sendMessage() {
    const text = this.inputEl.value.trim();
    if (!text || this.isLoading) return;

    // Hide welcome
    if (this.welcomeEl) {
      this.welcomeEl.style.display = 'none';
    }

    // Show user message
    this._appendMessage('user', text);

    // Clear input
    this.inputEl.value = '';
    this.inputEl.style.height = 'auto';

    // Show typing indicator
    this.isLoading = true;
    this.sendBtn.disabled = true;
    this.typingEl.classList.add('acw-show');
    this._scrollToBottom();

    try {
      const body = {
        message: text,
        session_type: this.contextType,
        store_id: this.storeId,
        brand_id: this.brandId,
      };

      if (this.sessionId) body.session_id = this.sessionId;
      if (this.memberId) body.customer_id = this.memberId;
      if (this.operatorId) body.operator_id = this.operatorId;
      if (this.guestSessionId) body.guest_session_id = this.guestSessionId;

      const resp = await fetch(`${this.apiBase}/api/chat/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }

      const data = await resp.json();

      // Save session ID
      if (data.session_id && !this.sessionId) {
        this.sessionId = data.session_id;
        localStorage.setItem(this.storageKey, this.sessionId);
        this._subscribeRealtime();
      }

      // Show assistant message
      this._appendMessage('assistant', data.message.content, data.message.id);

      // Show escalation notice
      if (data.escalated) {
        this._appendMessage('system', '担当者にエスカレーションしました。対応をお待ちください。');
      }

    } catch (err) {
      console.error('Chat send error:', err);
      this._appendMessage('system',
        '送信に失敗しました。しばらくしてからお試しください。\n問題が続く場合: support@weir.co.jp'
      );
    } finally {
      this.isLoading = false;
      this.sendBtn.disabled = false;
      this.typingEl.classList.remove('acw-show');
      this._scrollToBottom();
    }
  }

  _appendMessage(role, content, messageId = null) {
    const div = document.createElement('div');
    div.className = `acw-msg acw-msg-${role}`;
    div.textContent = content;

    // Add feedback buttons for assistant messages
    if (role === 'assistant' && messageId) {
      const fbDiv = document.createElement('div');
      fbDiv.className = 'acw-feedback';

      const btnUp = document.createElement('button');
      btnUp.textContent = '👍';
      btnUp.title = '役に立った';
      btnUp.onclick = () => this._sendFeedback(messageId, 'helpful', btnUp, btnDown);

      const btnDown = document.createElement('button');
      btnDown.textContent = '👎';
      btnDown.title = '役に立たなかった';
      btnDown.onclick = () => this._sendFeedback(messageId, 'not_helpful', btnUp, btnDown);

      fbDiv.appendChild(btnUp);
      fbDiv.appendChild(btnDown);
      div.appendChild(fbDiv);
    }

    // Insert before typing indicator
    this.messagesEl.insertBefore(div, this.typingEl);
    this._scrollToBottom();
  }

  async _sendFeedback(messageId, feedback, btnUp, btnDown) {
    try {
      await fetch(`${this.apiBase}/api/chat/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: messageId, feedback }),
      });

      // Update UI
      btnUp.classList.remove('acw-fb-active');
      btnDown.classList.remove('acw-fb-active-neg');
      if (feedback === 'helpful') {
        btnUp.classList.add('acw-fb-active');
      } else {
        btnDown.classList.add('acw-fb-active-neg');
      }
    } catch (err) {
      console.error('Feedback error:', err);
    }
  }

  async _loadHistory() {
    if (!this.sessionId) return;

    try {
      const resp = await fetch(`${this.apiBase}/api/chat/history?session_id=${this.sessionId}`);
      if (!resp.ok) return;

      const data = await resp.json();
      if (data.messages && data.messages.length > 0) {
        // Hide welcome
        if (this.welcomeEl) this.welcomeEl.style.display = 'none';

        for (const msg of data.messages) {
          if (msg.role === 'system') continue;
          this._appendMessage(msg.role, msg.content, msg.role === 'assistant' ? msg.id : null);
        }
      }
    } catch (err) {
      console.error('History load error:', err);
    }
  }

  _subscribeRealtime() {
    if (!this.sb || !this.sessionId || this.realtimeChannel) return;

    this.realtimeChannel = this.sb
      .channel('chat-' + this.sessionId)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `session_id=eq.${this.sessionId}`,
      }, (payload) => {
        // Only show messages not sent by this widget (e.g., admin replies)
        if (payload.new.role === 'assistant' || payload.new.role === 'system') {
          // Avoid duplicates from the send flow
          const existing = this.messagesEl.querySelectorAll('.acw-msg');
          const lastMsg = existing[existing.length - 1];
          if (lastMsg && lastMsg.textContent.includes(payload.new.content.substring(0, 50))) return;

          this._appendMessage(payload.new.role, payload.new.content, payload.new.id);
        }
      })
      .subscribe();
  }

  _scrollToBottom() {
    requestAnimationFrame(() => {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    });
  }

  destroy() {
    if (this.realtimeChannel) {
      this.sb.removeChannel(this.realtimeChannel);
    }
    this.btnEl.remove();
    this.windowEl.remove();
  }
}

// Export for module usage
if (typeof window !== 'undefined') {
  window.AidenChatWidget = AidenChatWidget;
}
