<template>
  <div id="chat-panel" class="chat-panel">
    <div class="chat-toolbar">
      <div class="chat-toolbar-left">
        <button id="chat-history-btn" class="chat-toolbar-btn" type="button" title="Chats">Chats</button>
        <span id="chat-agent-badge" class="chat-agent-badge" hidden></span>
        <input id="chat-name-input" class="chat-name-input" type="text" title="Chat title" autocomplete="off" hidden />
      </div>
      <button id="chat-session-badge" class="chat-session-badge" type="button" hidden title="Click to copy full session id"></button>
      <button id="chat-delete" class="chat-toolbar-btn chat-delete-btn" type="button" title="Delete this chat" aria-label="Delete chat">🗑</button>
      <div id="chat-history-dropdown" class="chat-history-dropdown" hidden>
        <div class="chat-history-head">
          <span>Saved Chats</span>
          <button id="chat-new-btn" class="chat-history-new" type="button" title="Start a new chat">+ New</button>
        </div>
        <div id="chat-history-list" class="chat-history-list"></div>
      </div>
    </div>
    <div id="chat-messages" class="chat-messages"></div>
    <div class="chat-input-area">
      <input id="chat-new-title-input" class="chat-new-title-input" type="text" placeholder="Chat name/title" autocomplete="off" hidden />
      <form id="chat-form" class="chat-form">
        <textarea
          id="chat-input"
          class="chat-input"
          placeholder="Message..."
          rows="3"
          autocomplete="off"
        ></textarea>
        <div class="chat-actions">
          <button id="chat-interrupt" class="chat-interrupt" type="button" hidden title="Stop current run" aria-label="Interrupt">✋</button>
          <button id="chat-send" class="chat-send" type="submit" title="Send message" aria-label="Send">↑</button>
        </div>
        <button id="chat-cancel" class="chat-cancel" type="button" hidden>Cancel</button>
      </form>
    </div>
  </div>
</template>
