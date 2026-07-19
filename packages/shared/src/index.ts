export type BookFormat = 'epub' | 'fb2';

export type Book = {
  id: string;
  name: string;
  author?: string;
  lang?: string;
  format: BookFormat;
  totalPages: number;
  addedAt: number;
  /**
   * Small JPEG thumbnail of the book cover as a data URL, when the file has one.
   */
  cover?: string;
};

export type Progress = {
  bookId: string;
  bookName: string;
  currentPage: number;
  totalPages: number;
  percent: number;
  lastRead: number;
  finished: boolean;
  smbPath?: string;
};

export type SMBConfig = {
  ip: string;
  port: number;
  username: string;
  password: string;
  share: string;
};

export type FileEntry = {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
};

export type ApiError = {
  error: string;
};
