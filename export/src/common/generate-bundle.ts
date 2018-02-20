const rollup = require('rollup');
const resolve = require('rollup-plugin-node-resolve');
export function generateBundle(input: string, options: { file: string, globals: {[key: string]: string}, name: string }) {
  return rollup.rollup({
    input,
    external: Object.keys(options.globals),
    plugins: [resolve()],
  }).then((bundle: any) => {
    return bundle.write({
      format: 'umd',
      ...options,
      sourcemap: true
    });
  });
}
