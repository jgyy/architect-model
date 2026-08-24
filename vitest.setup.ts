// Global Vitest setup: jsdom (the lightweight DOM implementation Node runs
// tests against, in place of a real browser) omits or only partially
// implements several browser APIs this app's components - especially the
// React Flow canvas (the @xyflow/react diagramming library this app's graph
// editor is built on) - rely on. This file patches those gaps so tests can
// render and interact with the UI as if a real browser were present.
import "@testing-library/jest-dom/vitest";

/** Stub for jsdom's missing ResizeObserver; `observe()` reports current dimensions once, without tracking real changes. */
class ResizeObserverStub {
    #callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
    }

    /**
     * Reports `target`'s current bounding box as one resize entry (jsdom has no real
     * layout to track over time).
     * @param target - element to report on
     */
    observe(target: Element) {
        queueMicrotask(() => {
            const rect = target.getBoundingClientRect();
            const size = { inlineSize: rect.width, blockSize: rect.height };
            const entry = {
                target,
                contentRect: rect,
                borderBoxSize: [size],
                contentBoxSize: [size],
            } as unknown as ResizeObserverEntry;
            this.#callback([entry], this as unknown as ResizeObserver);
        });
    }

    unobserve() {}
    disconnect() {}
}

/** Stub for jsdom's missing DOMMatrixReadOnly; parses only `m22`, the vertical scale factor React Flow's zoom math reads. */
class DOMMatrixReadOnlyStub {
    m22 = 1;

    /** @param transform - CSS transform; omitted/unparseable defaults `m22` to 1 (no zoom) */
    constructor(transform?: string) {
        const match = transform?.match(/matrix\(([^)]+)\)/);
        const values = match?.[1].split(",").map((value) => parseFloat(value));
        if (values && values.length >= 4) this.m22 = values[3];
    }
}

if (typeof window !== "undefined") {
    window.ResizeObserver ??= ResizeObserverStub;
    window.DOMMatrixReadOnly ??=
        DOMMatrixReadOnlyStub as unknown as typeof DOMMatrixReadOnly;
    // jsdom doesn't implement scrollIntoView either; a no-op keeps callers
    // from throwing when they invoke it (e.g. programmatic focus/scroll).
    Element.prototype.scrollIntoView ??= function scrollIntoView() {};

    // jsdom implements neither - used by the architecture export download
    window.URL.createObjectURL ??= () => "blob:jsdom-stub";
    window.URL.revokeObjectURL ??= () => {};

    // jsdom does no layout, so the stubs below give every element a fixed
    // size instead of a measured one.
    /**
     * True if `element` is React Flow's pannable viewport container, not an ordinary node.
     * @param element - element being measured
     */
    function isViewportContainer(element: Element): boolean {
        return element.classList?.contains("react-flow__renderer") ?? false;
    }

    // Viewport container gets large, canvas-like dimensions so React Flow's
    // pan/zoom math and node placement have room to work with; everything
    // else gets a small placeholder size.
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
        const width = isViewportContainer(this) ? 4000 : 150;
        const height = isViewportContainer(this) ? 3000 : 40;
        return {
            width,
            height,
            top: 0,
            left: 0,
            right: width,
            bottom: height,
            x: 0,
            y: 0,
            toJSON() {},
        };
    };
    // Same fixed-size rule as getBoundingClientRect above, for code that
    // reads dimensions via offsetWidth/offsetHeight instead.
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get(this: HTMLElement) {
            return isViewportContainer(this) ? 4000 : 150;
        },
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get(this: HTMLElement) {
            return isViewportContainer(this) ? 3000 : 40;
        },
    });

    // jsdom doesn't implement matchMedia; this stub always reports "no
    // match" and exposes both the legacy listener methods
    // (addListener/removeListener) and the modern EventTarget-style ones,
    // since callers may use either.
    window.matchMedia ??= function matchMedia(query: string) {
        return {
            matches: false,
            media: query,
            onchange: null,
            addListener: () => {},
            removeListener: () => {},
            addEventListener: () => {},
            removeEventListener: () => {},
            dispatchEvent: () => false,
        } as unknown as MediaQueryList;
    };
}
