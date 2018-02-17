import { main as _ngc } from '@angular/compiler-cli/src/main';

export function ngc(tsconfig: string): Promise<number> {
  return new Promise((resolve, reject) => {
    !_ngc([ '--project', tsconfig ]) ? resolve(1) : reject(Error('erroe'));
  });
}
