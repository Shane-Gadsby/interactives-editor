// The graph library (@xyflow/react) has no option that silences its own dev-build console warning about a hidden
// attribution: proOptions.hideAttribution (which we set, the project holds the Pro licence) only removes the badge,
// and the check that warns runs in development builds only, whatever proOptions says. Its message says "you can ignore
// this warning if you are subscribed". So drop exactly that message from console.warn in development and pass
// everything else through. Production builds never run the check.

const HIDING = /It seems like you are hiding the attribution/;

/** Wrap console.warn so the library's hidden-attribution notice is not printed. Returns a function that undoes it. */
export function silenceFlowAttributionWarning(target: Pick<Console, 'warn'> = console): () => void {
  const original = target.warn;
  target.warn = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && HIDING.test(args[0])) return;
    original.apply(target, args as []);
  };
  return () => {
    target.warn = original;
  };
}
