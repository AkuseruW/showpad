import { buildApp } from "../src/app";
import {
  fixedWindowContract,
  testClients,
} from "./helpers/fixed-window-contract";

fixedWindowContract("memory", (t, clock) => {
  const app = buildApp({ clients: testClients, clock });
  t.after(() => app.close());
  return app;
});
