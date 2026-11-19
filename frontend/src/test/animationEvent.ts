// jsdom lacks AnimationEvent, so react-dom would listen for `webkitAnimationEnd`.
// Import before anything that loads react-dom.
class AnimationEventPolyfill extends Event {
  readonly animationName: string;
  readonly elapsedTime: number;
  readonly pseudoElement: string;

  constructor(type: string, init: AnimationEventInit = {}) {
    super(type, init);
    this.animationName = init.animationName ?? "";
    this.elapsedTime = init.elapsedTime ?? 0;
    this.pseudoElement = init.pseudoElement ?? "";
  }
}

if (!("AnimationEvent" in window)) {
  Object.defineProperty(window, "AnimationEvent", {
    value: AnimationEventPolyfill,
    writable: true,
    configurable: true,
  });
}
