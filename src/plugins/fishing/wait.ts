import type { FishingWaitRecord, FishingWaitResolution } from './types';

export function createFishingWaitRecord(): FishingWaitRecord {
  let finished = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let resolveWait: (resolution: FishingWaitResolution) => void = () => {};

  const wait = new Promise<FishingWaitResolution>((resolve) => {
    resolveWait = resolve;
  });

  const finish = (resolution: FishingWaitResolution) => {
    if (finished) {
      return;
    }

    finished = true;
    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }
    resolveWait(resolution);
  };

  return {
    wait,
    start(waitMs) {
      if (finished) {
        return;
      }

      timer = setTimeout(() => finish('settle'), waitMs);
    },
    finish,
  };
}
