// `localStorage` does not exist under vitest's node environment, and a run
// checkpoints on level entry (DESIGN.md 8.3), so every test that starts a game
// needs a storage and a clock. Installing them once here means a test that does
// not care about persistence cannot fail for that reason. Tests that do care
// call installTestStorage() themselves to get a clean slot.
import { installTestStorage } from "./fixtures.js";

installTestStorage();
