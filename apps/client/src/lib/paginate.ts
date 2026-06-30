export type SectionItem = 
  | { level?: number; title?: string; paragraphs: string[] }

export type PageItem =
  | { title?: never; level?: never; content: string }
  | { title: string; level: number; content?: never };

export type Page = PageItem[];

