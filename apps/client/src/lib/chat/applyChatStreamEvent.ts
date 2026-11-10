import {
  isSupportedChatContentBlockType,
  type ChatMessage,
  type ChatStreamEvent,
} from '@polka/shared';

export function applyChatStreamEvent(message: ChatMessage, event: ChatStreamEvent): ChatMessage {
  switch (event.type) {
    case 'block_start': {
      // The server may ship a new block type before this client can render it
      // (they deploy separately), so unknown blocks are skipped instead of
      // stored. That also keeps them out of the history sent back, which the
      // server would reject.
      if (!isSupportedChatContentBlockType(event.block.type)) {
        return message;
      }
      return { ...message, content: [...message.content, event.block] };
    }
    case 'text_delta': {
      // A delta belongs to the most recently started block. If that block was
      // an unsupported one and got skipped, there's nothing to append to.
      const lastBlock = message.content.at(-1);
      if (!lastBlock) {
        return message;
      }
      switch (lastBlock.type) {
        case 'text':
          return {
            ...message,
            content: [
              ...message.content.slice(0, -1),
              { ...lastBlock, text: lastBlock.text + event.text },
            ],
          };
        default: {
          const unsupportedType: never = lastBlock.type;
          throw new Error(`Unsupported chat content block type: ${String(unsupportedType)}`);
        }
      }
    }
    default:
      return message;
  }
}
