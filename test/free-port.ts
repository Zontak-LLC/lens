import { createServer } from "node:net";

/** A port nobody listens on right now, on 127.0.0.1, for a test that starts the real command. */
export const freePort = () =>
  new Promise<number>((resolve) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const address = s.address();
      const port = typeof address === "object" && address ? address.port : 0;
      s.close(() => resolve(port));
    });
  });
