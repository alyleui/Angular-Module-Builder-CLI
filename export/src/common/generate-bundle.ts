const rollup = require('rollup');
const resolve = require('rollup-plugin-node-resolve');
export function generateBundle(input: string, options: { file: string, globals: {[key: string]: string}, name: string }) {
  return rollup.rollup({
    input,
    external: Object.keys(options.globals),
    plugins: [resolve()],
    onwarn: (warning: any) => {
      // Suppress this error message... there are hundreds of them. Angular team says to ignore it.
      // https://github.com/rollup/rollup/wiki/Troubleshooting#this-is-undefined
      if (warning['code'] === 'THIS_IS_UNDEFINED') {
          return;
      }
      console.error(warning.message);
  },
  }).then((bundle: any) => {
    return bundle.write({
      format: 'umd',
      ...options,
      sourcemap: true
    });
  });
}
