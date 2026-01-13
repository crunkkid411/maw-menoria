import chalk from 'chalk';

export interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
  dim: (msg: string) => void;
  progress: (current: number, total: number, label: string) => void;
  status: (msg: string) => void; // Inline status that overwrites current line
}

let quietMode = false;
let verboseMode = false;

export function setLogMode(quiet: boolean, verbose: boolean): void {
  quietMode = quiet;
  verboseMode = verbose;
}

export function createLogger(): Logger {
  return {
    info: (msg: string) => {
      if (!quietMode) console.log(msg);
    },
    success: (msg: string) => {
      if (!quietMode) console.log(chalk.green(msg));
    },
    error: (msg: string) => {
      console.error(chalk.red(msg));
    },
    warn: (msg: string) => {
      if (!quietMode) console.log(chalk.yellow(msg));
    },
    dim: (msg: string) => {
      if (verboseMode) console.log(chalk.dim(msg));
    },
    progress: (current: number, total: number, label: string) => {
      if (quietMode) return;

      const width = 20;
      const filled = Math.round((current / total) * width);
      const bar = '\u2593'.repeat(filled) + '\u2591'.repeat(width - filled);

      // Clear line and write progress
      process.stdout.write(`\r  ${bar} ${current}/${total} ${label.slice(0, 40)}`);

      if (current >= total) {
        process.stdout.write('\n');
      }
    },
    status: (msg: string) => {
      if (quietMode) return;
      // Show status on new line (will be overwritten by next progress)
      process.stdout.write(`\r  ${chalk.cyan('⋯')} ${msg.padEnd(55)}`);
    },
  };
}
