declare module 'cliui' {
  interface UIOptions {
    width?: number;
    wrap?: boolean;
  }

  interface Column {
    text: string;
    width?: number;
    align?: 'left' | 'center' | 'right';
    padding?: [number, number, number, number];
    border?: boolean;
  }

  interface UI {
    div(...columns: (string | Column)[]): void;
    span(...columns: (string | Column)[]): void;
    resetOutput(): void;
    toString(): string;
  }

  function cliui(options?: UIOptions): UI;
  export = cliui;
}
