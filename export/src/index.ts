#!/usr/bin/env node

import { Observable } from 'rxjs/Observable';
import 'rxjs/add/observable/forkJoin';
import chalk from 'chalk';
import * as camelcase from 'camelcase';
import * as ora from 'ora';
import { Console } from './common/console';
import { generateBundle } from './common/generate-bundle';
import { ngc } from './common/ngc';
import { mergeRecursive } from './common/merge-recursive';
import { uglifyJsFile } from './common/minify-sources';
const inlineResources = require('./common/inline-resources');
import { extname } from 'path';
import { readdir } from 'fs';
import { writeFileSync, removeSync, copySync, pathExists, pathExistsSync, readFileSync } from 'fs-extra';
const ambConfig = require(`${process.cwd()}/.amb.json`);
const libRoot = ambConfig['root'];
const tmp = ambConfig['tmp'] = `${process.cwd()}/.tmp/${libRoot.split('/').reverse()[0]}`;
const GLOBALS = ambConfig['globals'];
const version = '0.1.1';

Console.log('Angular Module Builder CLI');
/** Clean */
function clean() {
  removeSync(`${process.cwd()}/.tmp`);
  removeSync(`${process.cwd()}/${ambConfig['outDir']}`);
}

clean();

/** Copy sources to .tmp */
copySync(libRoot, `${tmp}`);

const modules: Module[] = ambConfig['libs'];
const checkPath = (path: string) => {
  if (!pathExistsSync(path)) {
    Console.error(`does not exist: ${path}`);
  }
  return path;
};


/** Check folder libRoot */
checkPath(libRoot);

function getPkg(module: Module) {
  /** Verifying its existence {root}/{dir}/package.json */
  if (module.pkg) {
    module.pkg = `${tmp}/${module.dir}/${module.pkg}/package.json`;
  } else if (pathExistsSync(`${tmp}/${module.dir}/package.json`)) {
    module.pkg = `${tmp}/${module.dir}/package.json`;
  } else {
    module.pkg = `${tmp}/package.json`;
  }
  return module.pkg;
}

/** Update Modules */
modules.forEach((module) => {
  const name = module.name;
  /**
   * set default
   */
  if (!module.dir) {
    module.dir = `${name}`;
  }
  module.outDir = `${process.cwd()}/${ambConfig['outDir']}/${module.dir}`;

  module.pkg = getPkg(module);

  if (!module.version) {
    module.version = version;
  }

  if (!module.es2015) {
    module.es2015 = `tsconfig-es2015.json`;
  }
  if (!module.esm) {
    module.esm = `tsconfig-esm.json`;
  }
  for (const $key in module) {
    if (
      module.hasOwnProperty($key) &&
      $key === 'esm' ||
      $key === 'es2015'
    ) {
      const moduleConfig = (module as any)[$key];
      /**
       * Set absolute routes
       * default to {root}/{dir}/key
       */
      (module as any)[$key] = `${tmp}/${module.dir}/${moduleConfig}`;
    }
  }
  checkPath(module.pkg);
  module.dir = `${process.cwd()}/${libRoot}/${module.dir}`;
});

function writeTsConfig(module: Module): {state: boolean, err: any} {
  const es2015 = {
    'compilerOptions': {
      'baseUrl': '.',
      'experimentalDecorators': true,
      'emitDecoratorMetadata': true,
      'module': 'es2015',
      'target': 'es2015',
      'noImplicitAny': false,
      'outDir': '{outDir}/es2015',
      'rootDir': '.',
      'sourceMap': true,
      'inlineSources': true,
      'declaration': false,
      'strictNullChecks': true,
      'lib': ['es2015', 'dom'],
      'skipLibCheck': true,
      'moduleResolution': 'node',
      'paths': { }
    },
    'files': [
      'index.ts'
    ],
    'angularCompilerOptions': {
      'skipTemplateCodegen': true,
      'strictMetadataEmit': true,
      'enableSummariesForJit': false
    }
  };
  const copy_es2015 = JSON.parse(JSON.stringify(es2015));
  const esm = mergeRecursive(copy_es2015, {
    'compilerOptions': {
      'target': 'es5',
      'outDir': '{outDir}',
      'declaration': true
    },
    'files': [
      'public_api.ts'
    ],
    'angularCompilerOptions': {
      'skipTemplateCodegen': true,
      'strictMetadataEmit': true,
      'enableSummariesForJit': false,
      'flatModuleOutFile': 'index.js',
      'flatModuleId': `{name}`
    }
  });
  /** If not exist, create a new one*/
  const createOrUpdateTsConfig = (type: 'es2015' | 'esm') => {
    let tsconfigContent = {} as any;
    if (!pathExistsSync(`${module[type]}`)) {
      tsconfigContent = type === 'es2015' ? es2015 : esm;
    } else {
      tsconfigContent = JSON.parse(readFileSync(`${module[type]}`, {encoding: 'utf8'}));
    }
    if (type === 'es2015') {
      tsconfigContent['compilerOptions']['outDir'] = '{dir}/es2015';
      writeFileSync(`${module[type]}`, JSON.stringify(tsconfigContent, null, 2));
    } else {
      tsconfigContent['compilerOptions']['outDir'] = '{dir}';
      tsconfigContent['angularCompilerOptions']['flatModuleId'] = `${module.name}`;
      writeFileSync(`${module[type]}`, JSON.stringify(tsconfigContent, null, 2));
    }
  };
  try {
    ['es2015', 'esm'].forEach((val: 'es2015' | 'esm') => {
      createOrUpdateTsConfig(val);
    });
    return {
      state: true,
      err: null
    };
  } catch (error) {
    return {
      state: false,
      err: error
    };
  }
}

function buildModules():
Observable<{module: Module, state: 'start' | 'end' | 'err' | 'finish', msg: string}> {
  return new Observable((observer) => {

    /** Inline resources */
    (<Promise<void>>inlineResources(tmp))
    .then(() => {
      modules.forEach((module) => {
        const state = (st: 'start' | 'end' | 'err' | 'finish', msg = '') => (observer.next({module, state: st, msg}));
        state('start', 'Updating tsconfigs');
        writeTsConfig(module).state ? state('end', 'tsconfigs updated') : state('err');
        state('start');
        const es2015 = () => {
          return ngc(`${module.es2015}`, `${module.outDir}`)
          // .then(() => state('end'))
          .catch(() => state('err'));
        };
        const esm = () => {
          return ngc(`${module.esm}`, `${module.outDir}`, 'esm')
          // .then(() => state('end'))
          .catch(() => state('err'));
        };
        Observable.forkJoin(
          es2015(),
          esm()
        )
        .subscribe(() => {
          const globals = GLOBALS as any;
          const inputPathJS = `${module.outDir}/index.js`;
          const outputPathUMD = `${module.outDir}/${module.name}.umd.js`;
          const outputPathUMDmin = `${module.outDir}/${module.name}.umd.min.js`;
          generateBundle(inputPathJS, {
            file: outputPathUMD,
            globals,
            name: camelcase(module.name)
          })
          .catch((err: any) => state('err', err))
          .then(() => {
            uglifyJsFile(outputPathUMD, outputPathUMDmin);
            const pkgContent = JSON.parse(readFileSync(`${module.pkg}`, {encoding: 'utf8'}));
            /** Set Config */
            pkgContent['name'] = module.name;
            pkgContent['version'] = module.version;
            pkgContent['main'] = `${module.name}.umd.js`;
            pkgContent['es2015'] = `es2015/index.js`;
            pkgContent['module'] = `index.js`;
            pkgContent['typings'] = `index.d.js`;
            writeFileSync(`${module.outDir}/package.json`, JSON.stringify(pkgContent, null, 2));
            state('end');
          });
        });
      });
    });
  });
}

const spinner = ora();
buildModules().subscribe((state) => {
  const name = chalk.hex('#304ffe')(`${camelcase(state.module.name)}: `);
  if (state.state === 'start') {
    state.msg ?
              spinner.start(`${name}${state.msg}`) :
              spinner.start(`${name}Compiling...`);
  } else if (state.state === 'end') {
    state.msg ?
              spinner.succeed(`${name}${state.msg}`) :
              spinner.succeed(`${name}Successfully compilation`);
  } else if (state.state === 'err') {
    clean();
    spinner.fail(`Fail: ${name}`);
    spinner.stop();
    Console.error('~Failed compilation', state.msg ? `=> ${state.msg}` : '');
  } else if (state.state === 'finish') {
    clean();
    spinner.stop();
    Console.log('~All the compilation has been successful');
  }
});

export interface Module {
  name: string;
  /** component folder */
  dir?: string;
  outDir?: string;
  pkg?: string;
  version?: string;
  es2015?: string;
  esm?: string;
}
