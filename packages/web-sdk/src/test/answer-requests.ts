// Stories run without a server: each one answers the app's requests itself, then puts the real fetch back.
export function answerRequests(respond: (request: Request) => Promise<Response>) {
  return () => {
    const realFetch = globalThis.fetch;
    globalThis.fetch = (input) => respond(input instanceof Request ? input : new Request(input));
    return () => {
      globalThis.fetch = realFetch;
    };
  };
}
