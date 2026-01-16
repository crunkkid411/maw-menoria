import chalk from 'chalk';

export interface Logger {
  info: (msg: string) => void;
  success: (msg: string) => void;
  error: (msg: string) => void;
  warn: (msg: string) => void;
  dim: (msg: string) => void;
  progress: (current: number, total: number, label: string) => void;
  progressUpdate: (current: number, label: string) => void; // In-place update (no newline)
  progressEnd: () => void; // End progress with newline
  status: (msg: string) => void; // Inline status that overwrites current line
}

let quietMode = false;
let verboseMode = false;

// "Did you know?" facts about the web and tech
const WEB_FACTS = [
  'The first website went live on August 6, 1991',
  'Google processes over 8.5 billion searches per day',
  'The first email was sent by Ray Tomlinson in 1971',
  'There are over 1.9 billion websites on the internet',
  'The average webpage is about 2MB in size',
  'Tim Berners-Lee invented the World Wide Web in 1989',
  'The first domain ever registered was symbolics.com',
  'WiFi stands for nothing - it\'s just a catchy name',
  'The first YouTube video was uploaded on April 23, 2005',
  'Amazon was originally called "Cadabra"',
  'The first computer virus was created in 1983',
  'Over 500 hours of video are uploaded to YouTube every minute',
  'The @ symbol was chosen for email because it was rarely used',
  'Firefox\'s original name was "Phoenix"',
  'The first banner ad appeared in 1994',
  'Google\'s original name was "BackRub"',
  'The average person spends 7 hours online daily',
  'CAPTCHA stands for Completely Automated Public Turing test',
  'The first webcam watched a coffee pot at Cambridge',
  'Over 300 billion emails are sent every day',
  'The internet weighs about 50 grams (as electrons)',
  'JavaScript was created in just 10 days',
  'The first tweet was sent on March 21, 2006',
  'More than 70% of all internet traffic is video',
  'The first .com domain cost $100 per year',
  'There are over 1.5 billion Gmail users worldwide',
  'The "404 error" comes from room 404 at CERN',
  'DNS is often called the phone book of the internet',
  'The first smartphone was IBM Simon in 1994',
  'Over 4 million blog posts are published daily',
  'The first GIF was created in 1987',
  'HTTP was designed by Tim Berners-Lee in 1991',
  'The first online purchase was a pizza in 1994',
  'Unicode supports over 150,000 characters',
  'The cloud stores about 100 zettabytes of data',
  'RSS stands for Really Simple Syndication',
  'The first computer mouse was made of wood',
  'About 90% of the world\'s data was created in the last 2 years',
  'The first hard drive (1956) weighed over a ton',
  'Robots.txt has been a standard since 1994',
  'The term "surfing the internet" was coined in 1992',
  'Linux powers most of the world\'s servers',
  'The first emoji was created in Japan in 1999',
  'A single Google search uses 1,000 computers',
  'The internet uses about 10% of global electricity',
  'Qwerty keyboards were designed to slow typing',
  'MP3 was invented in Germany in 1993',
  'The first browser was called WorldWideWeb',
  'Over 2 billion people use Facebook monthly',
  'The average website loads in 2.5 seconds',
  'Markdown was created by John Gruber in 2004',
  'Git was created by Linus Torvalds in just 2 weeks',
  'The first computer bug was an actual moth',
  'JPEG was standardized in 1992',
  'API stands for Application Programming Interface',
  'The original iPod could hold 1,000 songs',
  'Bitcoin\'s first transaction was for two pizzas',
  'The term "spam" comes from a Monty Python sketch',
  'PDF was created by Adobe in 1993',
  'The first search engine was Archie in 1990',
  'About 95% of web servers run Linux',
  'The first selfie was taken in 1839',
  'PNG was created as a patent-free alternative to GIF',
  'The term "blog" is short for "weblog"',
  'Stack Overflow has over 23 million questions',
  'The first online bank was Stanford FCU in 1994',
  'Cookies were invented by Netscape in 1994',
  'The first spam email was sent in 1978',
  'React was released by Facebook in 2013',
  'TypeScript was released by Microsoft in 2012',
  'Docker containers were introduced in 2013',
  'Kubernetes was released by Google in 2014',
  'Node.js was released in 2009',
  'Python was named after Monty Python',
  'Rust has been "most loved language" 7 years running',
  'The first version control system was SCCS in 1972',
  'JSON was specified by Douglas Crockford in 2001',
  'REST was defined by Roy Fielding in 2000',
  'The first wiki was WikiWikiWeb in 1995',
  'Vim was released in 1991',
  'VS Code is the most popular code editor',
  'GitHub has over 100 million developers',
  'NPM hosts over 2 million packages',
  'The first hashtag on Twitter was #barcamp in 2007',
  'WebSocket was standardized in 2011',
  'The first live stream was in 1993',
  'HTTPS was created by Netscape in 1994',
  'The first social network was SixDegrees in 1997',
  'SVG was first released in 2001',
  'Regular expressions were invented in 1951',
  'CSS was first proposed in 1994',
  'The first podcast was in 2004',
  'WebAssembly was announced in 2015',
  'GraphQL was released by Facebook in 2015',
  'The average API response time is 200-500ms',
  'AJAX was coined as a term in 2005',
  'The first AI chatbot ELIZA was created in 1966',
  'Neural networks were first conceived in 1943',
  'GPT-3 has 175 billion parameters',
];

let lastMessageIndex = -1;
let messageUpdateCounter = 0;
let crawlStartTime = 0;
let lastMilestone = 0;

// Milestones to celebrate
const MILESTONES = [10, 25, 50, 75, 100, 150, 200, 300, 500];
const MILESTONE_MESSAGES = [
  '🔥 Nice start!',
  '⚡ Picking up speed!',
  '🚀 Halfway to 100!',
  '💪 Going strong!',
  '🎯 Triple digits!',
  '🌟 150 and counting!',
  '✨ 200 pages deep!',
  '🏆 300 club!',
  '👑 500 pages!',
];

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
    progressUpdate: (current: number, label: string) => {
      if (quietMode) return;

      // Track start time on first call
      if (crawlStartTime === 0) {
        crawlStartTime = Date.now();
      }

      // In-place update without newline - shows spinning indicator
      const spinner = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'][current % 10];

      // Calculate speed (pages per second)
      const elapsed = (Date.now() - crawlStartTime) / 1000;
      const speed = elapsed > 0 ? (current / elapsed).toFixed(1) : '0.0';

      // Check for milestone
      let milestoneMsg = '';
      for (let i = 0; i < MILESTONES.length; i++) {
        if (current >= MILESTONES[i] && lastMilestone < MILESTONES[i]) {
          lastMilestone = MILESTONES[i];
          milestoneMsg = MILESTONE_MESSAGES[i];
          break;
        }
      }

      // Detect if we're saving or crawling based on label
      const isSaving = label.startsWith('Saving ');
      let displayLine: string;

      if (isSaving) {
        // Show: "30 crawled • 2.5/s • Saving 5/10..."
        displayLine = `${chalk.green(current)} crawled ${chalk.dim('•')} ${chalk.blue(speed)}/s ${chalk.dim('•')} ${chalk.yellow(label)}`;
      } else {
        // Show: "30 crawled • 2.5/s • Page title..."
        const truncatedLabel = label.length > 30 ? label.slice(0, 27) + '...' : label;
        displayLine = `${chalk.green(current)} crawled ${chalk.dim('•')} ${chalk.blue(speed)}/s ${chalk.dim('•')} ${chalk.dim(truncatedLabel)}`;
      }

      // Update fact every 20 updates, or show milestone message
      messageUpdateCounter++;
      let bottomLine: string;

      if (milestoneMsg) {
        // Show milestone celebration briefly
        bottomLine = milestoneMsg;
      } else {
        if (messageUpdateCounter % 20 === 0 || lastMessageIndex < 0) {
          // Pick a random fact (more interesting than sequential)
          lastMessageIndex = Math.floor(Math.random() * WEB_FACTS.length);
        }
        const fact = WEB_FACTS[lastMessageIndex >= 0 ? lastMessageIndex : 0];
        bottomLine = `Did you know? ${fact}`;
      }

      // Clear current line and line below, then write both lines
      process.stdout.write('\x1b[2K'); // Clear current line
      process.stdout.write(`\r  ${chalk.cyan(spinner)} ${displayLine.padEnd(55)}\n`);
      process.stdout.write('\x1b[2K'); // Clear next line
      process.stdout.write(`  ${chalk.dim(bottomLine.length > 65 ? bottomLine.slice(0, 62) + '...' : bottomLine)}`);
      process.stdout.write('\x1b[1A\r'); // Move cursor back up one line
    },
    progressEnd: () => {
      if (quietMode) return;
      // Clear both lines and move to new line
      process.stdout.write('\x1b[2K\n\x1b[2K\x1b[1A\n');
      lastMessageIndex = -1;
      messageUpdateCounter = 0;
      crawlStartTime = 0;
      lastMilestone = 0;
    },
    status: (msg: string) => {
      if (quietMode) return;
      // Show status on new line (will be overwritten by next progress)
      process.stdout.write(`\r  ${chalk.cyan('⋯')} ${msg.padEnd(55)}`);
    },
  };
}
