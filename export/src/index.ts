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
import { writeFileSync, removeSync, copySync, pathExists, pathExistsSync, readFileSync } from 'fs-extra';
const ambConfig = require(`${process.cwd()}/.amb.json`);
const libRoot = ambConfig['root'];
const GLOBALS = ambConfig['globals'];
const version = '0.1.1';

Console.log('Angular Module Builder CLI');
removeSync(`${process.cwd()}/${ambConfig['outDir']}`);

const modules: Module[] = ambConfig['libs'];
const checkPath = (path: string) => {
  if (!pathExistsSync(path)) {
    Console.error(`does not exist: ${path}`);
  }
  return path;
};

/** Check folder libRoot */
checkPath(libRoot);

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
  module.dir = `${process.cwd()}/${libRoot}/${module.dir}`;

  if (!module.pkg) {
    module.pkg = `package.json`;
  }

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
    if (module.hasOwnProperty($key) &&
    $key !== 'version' &&
    $key !== 'name' &&
    $key !== 'outDir' &&
    $key !== 'dir') {
      const moduleConfig = (module as any)[$key];
      /**
       * Set absolute routes
       * default to {root}/{dir}/key
       */
      (module as any)[$key] = `${module.dir}/${moduleConfig}`;
      /** Verifying its existence */
      checkPath((module as any)[$key]);
    }
  }
});

Console.log('module', JSON.stringify(modules, null, 2));

function writeTsConfig(module: Module) {
  const es2015 = {
    'compilerOptions': {
      'baseUrl': '.',
      'experimentalDecorators': true,
      'emitDecoratorMetadata': true,
      'module': 'es2015',
      'target': 'es2015',
      'noImplicitAny': false,
      'outDir': '../../../dist/packages-dist/my-module/es2015',
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
  const esm = mergeRecursive(es2015, {
    'compilerOptions': {
      'target': 'es5',
      'outDir': '../../../dist/packages-dist/my-module',
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
      'flatModuleId': '{name}'
    }
  });
  let tsconfigContent = {} as any;
  /** If not exist, ccreate a new one*/
  const createOrUpdateTsConfig = (type: 'es2015' | 'esm') => {
    if (!pathExistsSync(`${module[type]}`)) {
      tsconfigContent = type === 'es2015' ? es2015 : esm;
    } else {
      tsconfigContent = JSON.parse(readFileSync(`${module[type]}`, {encoding: 'utf8'}));
    }
    if (type === 'es2015') {
      tsconfigContent['outDir'] = '{dir}/es2015';
    } else {
      tsconfigContent['outDir'] = '{dir}';
      writeFileSync(`${module[type]}`, JSON.stringify(tsconfigContent));
    }
  };
}

function buildModules():
Observable<{module: Module, state: 'start' | 'end' | 'err', msg: string}> {
  return new Observable((observer) => {
    modules.forEach((module) => {
      const state = (st: 'start' | 'end' | 'err', msg = '') => (observer.next({module, state: st, msg}));
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
        .catch(err => state('err', err))
        .then(() => {
          uglifyJsFile(outputPathUMD, outputPathUMDmin);
          const pkgContent = JSON.parse(readFileSync(`${module.pkg}`, {encoding: 'utf8'}));
          // copySync(`${process.cwd()}/${module.pkg}`, `${module.outDir}/package.json`);
          /** Set Config */
          pkgContent['name'] = module.name;
          pkgContent['version'] = module.version;
          pkgContent['main'] = `${module.name}.umd.js`;
          pkgContent['es2015'] = `es2015/index.js`;
          pkgContent['module'] = `index.js`;
          pkgContent['typings'] = `index.d.js`;
          writeFileSync(`${module.outDir}/package.json`, JSON.stringify(pkgContent));
          state('end');
        });
      });
      // const spinner = ora(`Compiling ${module.name} es2015 `).start();
      // ngc(`${module.options.es2015}`)
      // .then(() => {
      //   observer.next();
      // })
      // .catch(() => spinner.fail());
      // spinner.start(`Compiling ${module.name} esm `);
      // ngc(`${module.options.esm}`)
      // .then(() => spinner.succeed())
      // .catch(() => spinner.fail());
    });
  });
}

const spinner = ora();
buildModules().subscribe((state) => {
  if (state.state === 'start') {
    spinner.start(`Compiling ${state.module.name}`);
  } else if (state.state === 'end') {
    spinner.succeed(`${state.module.name}: Successfully compilation`);
    Console.log('~All the compilation has been successful');
    spinner.stop();
  } else if (state.state === 'err') {
    spinner.fail(`Fail: ${state.module.name}`);
    spinner.stop();
    Console.error('~Failed compilation', state.msg ? `=> ${state.msg}` : '');
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
