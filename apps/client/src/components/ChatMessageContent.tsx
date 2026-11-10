import { For, type JSX } from 'solid-js';
import type { ChatContentBlock } from '@polka/shared';

// The place to add rendering for new block types (cards, links, external
// content).
//
// Reading props.block once is fine: <For> creates a new ChatBlock whenever a
// block object is replaced, so the block never changes under it.
function ChatBlock(props: { block: ChatContentBlock }): JSX.Element {
  const block = props.block;
  switch (block.type) {
    case 'text':
      return <span class="chat-block-text">{block.text}</span>;
    default: {
      const unsupportedType: never = block.type;
      throw new Error(`Unsupported chat content block type: ${String(unsupportedType)}`);
    }
  }
}

export function ChatMessageContent(props: { content: ChatContentBlock[] }) {
  return <For each={props.content}>{(block) => <ChatBlock block={block} />}</For>;
}
