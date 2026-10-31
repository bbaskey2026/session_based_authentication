/**
 * ANSI Terminal Color Logger Utility
 * Provides clean, modern colored terminal logging without ASCII icons or emojis.
 */

const colors = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  italic: '\x1b[3m',
  underline: '\x1b[4m',

  // Foreground colors
  black: '\x1b[30m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  gray: '\x1b[90m',

  // Background colors
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
  bgMagenta: '\x1b[45m',
  bgCyan: '\x1b[46m',
  bgWhite: '\x1b[47m',
};

// Formats a bracketed tag with ANSI colors and fixed visual alignment
const formatTag = (tag, color, bold = false, colWidth = 12) => {
  const visible = `[${tag}]`;
  const padding = ' '.repeat(Math.max(1, colWidth - visible.length));
  const style = bold ? `${colors.bold}${color}` : color;
  return `${style}${visible}${colors.reset}${padding}`;
};

const logger = {
  colors,

  divider(len = 54) {
    console.log(`${colors.gray}${'-'.repeat(len)}${colors.reset}`);
  },

  title(text) {
    console.log(`${colors.bold}${colors.white}${text}${colors.reset}`);
  },

  info(tag, message) {
    console.log(`${formatTag(tag, colors.cyan)}${message}`);
  },

  success(tag, message) {
    console.log(`${formatTag(tag, colors.green)}${message}`);
  },

  warn(tag, message) {
    console.warn(`${formatTag(tag, colors.yellow)}${colors.yellow}${message}${colors.reset}`);
  },

  error(tag, message) {
    console.error(`${formatTag(tag, colors.red, true)}${colors.red}${message}${colors.reset}`);
  },

  database(message) {
    console.log(`${formatTag('database', colors.green)}${message}`);
  },

  security(message) {
    console.log(`${formatTag('security', colors.blue)}${message}`);
  },

  network(message) {
    console.log(`${formatTag('network', colors.magenta)}${message}`);
  },

  ready(message) {
    console.log(`${formatTag('ready', colors.green, true)}${message}`);
  },

  http(method, path, status, durationMs = null) {
    let statusColor = colors.green;
    if (status >= 400 && status < 500) statusColor = colors.yellow;
    if (status >= 500) statusColor = colors.red;

    const methodColor = colors.cyan;
    const duration = durationMs !== null ? `${colors.gray}${durationMs}ms${colors.reset}` : '';

    console.log(
      `${colors.dim}[http]${colors.reset}    ${methodColor}${method.padEnd(6)}${colors.reset} ${path} ${statusColor}${status}${colors.reset} ${duration}`
    );
  },
};

module.exports = logger;
