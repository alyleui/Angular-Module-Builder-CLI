import chalk from 'chalk';
export class Console {
  static error(...text: string[]) {
    console.log(chalk.red(...text));
    process.exit(1);
  }
  static log(...text: string[]) {
    console.log(chalk.hex('#e040fb')(...text));
  }
}
