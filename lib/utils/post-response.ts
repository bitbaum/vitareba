import { after } from "next/server";

/**
 * Schedule non-critical work after the response finishes and log failures
 * consistently so route handlers do not hand-roll the same pattern.
 */
export function runAfterResponse(work: () => void | Promise<void>, errorLabel: string) {
  after(async () => {
    try {
      await work();
    } catch (err) {
      console.error(errorLabel, err);
    }
  });
}
