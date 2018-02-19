import { main as _ngc } from '@angular/compiler-cli/src/main';

export function ngc(tsconfig: string, outDir: string, type: 'esm' | 'es2015' = 'es2015'): Promise<number> {
  const typeDir = type === 'es2015' ? `/${type}` : '';
  return new Promise((resolve, reject) => {
    !_ngc([ '--project', tsconfig, '--outDir', `${outDir}${typeDir}` ]) ? resolve(1) : reject(Error('erroe'));
  });
}
