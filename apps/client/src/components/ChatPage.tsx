import { createSignal, For, Show, createEffect } from 'solid-js';
import { useNavigate } from '@solidjs/router';
import type { ChatMessage, ChatStreamEvent } from '@polka/shared';
import { ChevronLeftIcon } from './ChevronLeftIcon.tsx';
import { ChatMessageContent } from './ChatMessageContent.tsx';
import { sendChatMessage } from '../lib/api';
import { applyChatStreamEvent } from '../lib/chat/applyChatStreamEvent.ts';
import { i18n } from '../i18n';

export function ChatPage() {
  const navigate = useNavigate();

  const [messages, setMessages] = createSignal<ChatMessage[]>([]);
  const [draft, setDraft] = createSignal('');
  const [sending, setSending] = createSignal(false);
  const [error, setError] = createSignal('');
  const [notice, setNotice] = createSignal('');

  let messagesEl!: HTMLDivElement;
  createEffect(() => {
    messages();
    messagesEl?.scrollTo({ top: messagesEl.scrollHeight });
  });

  function updateReply(update: (reply: ChatMessage) => ChatMessage) {
    setMessages((prev) => {
      const last = prev.at(-1);
      if (!last || last.role !== 'assistant') {
        return prev;
      }
      return [...prev.slice(0, -1), update(last)];
    });
  }

  function handleStreamEvent(event: ChatStreamEvent) {
    if (event.type !== 'message_end') {
      updateReply((reply) => applyChatStreamEvent(reply, event));
      return;
    }
    if (event.stopReason === 'max_tokens') {
      setNotice(i18n('chat.replyCutOffNotice'));
    } else if (event.stopReason === 'refusal') {
      setNotice(i18n('chat.replyDeclinedNotice'));
    }
    // A reply declined before any text would otherwise stay as an empty bubble.
    setMessages((prev) => {
      const last = prev.at(-1);
      return last?.role === 'assistant' && last.content.length === 0 ? prev.slice(0, -1) : prev;
    });
  }

  async function handleSend() {
    const text = draft().trim();
    if (!text || sending()) {
      return;
    }
    setError('');
    setNotice('');
    setDraft('');
    const userMessage: ChatMessage = { role: 'user', content: [{ type: 'text', text }] };
    const history = [...messages(), userMessage];
    setMessages([...history, { role: 'assistant', content: [] }]);
    setSending(true);
    try {
      await sendChatMessage({ messages: history, onEvent: handleStreamEvent });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setMessages(history);
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  return (
    <div class="page chat-page">
      <div class="page-header">
        <button
          class="icon-btn"
          onClick={() => navigate('/')}
          title={i18n('chat.backTooltip')}
          aria-label={i18n('chat.backTooltip')}
        >
          <ChevronLeftIcon />
        </button>
        <h1 class="page-title">{i18n('chat.title')}</h1>
        <div style={{ width: '40px' }} />
      </div>

      <div class="chat-messages" ref={messagesEl}>
        <Show when={messages().length === 0}>
          <p class="empty-state-text">{i18n('chat.emptyStateText')}</p>
        </Show>
        <For each={messages()}>
          {(message) => (
            <div class={`chat-message chat-message-${message.role}`}>
              <ChatMessageContent content={message.content} />
            </div>
          )}
        </For>
      </div>

      <Show when={notice()}>
        <p class="chat-notice">{notice()}</p>
      </Show>

      <Show when={error()}>
        <p class="error-text">{error()}</p>
      </Show>

      <div class="chat-input-area">
        <textarea
          class="chat-textarea"
          placeholder={i18n('chat.placeholder')}
          value={draft()}
          onInput={(event) => setDraft(event.currentTarget.value)}
          onKeyDown={handleKeyDown}
          disabled={sending()}
          rows={1}
        />
        <button
          class="btn chat-send-btn"
          onClick={() => void handleSend()}
          disabled={sending() || !draft().trim()}
        >
          {i18n('chat.sendButton')}
        </button>
      </div>
    </div>
  );
}
