// tsx/node loader hook: turn `import './x.css'` into an empty module.
export function load(url, ctx, next) {
  if (url.endsWith('.css')) return { format: 'module', shortCircuit: true, source: 'export default {}' };
  return next(url, ctx);
}
