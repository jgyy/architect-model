import "@testing-library/jest-dom/vitest";

// jsdom implements neither ResizeObserver, scrollIntoView, nor
// DOMMatrixReadOnly. @xyflow/react measures nodes with the first (and reads
// the viewport's CSS transform via the third to derive zoom); console-panel
// autoscrolls with the second.
//
// The observer stub fires once per observed target (async, like the real
// thing) so @xyflow/react considers nodes "measured" — without that, handle
// bounds stay undefined and connection-drag gestures silently no-op.
class ResizeObserverStub {
    #callback: ResizeObserverCallback;

    constructor(callback: ResizeObserverCallback) {
        this.#callback = callback;
    }

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

// Only the zoom factor (m22, from a `matrix(a, b, c, d, e, f)` transform) is
// read by @xyflow/react — a full CSS matrix implementation isn't needed.
class DOMMatrixReadOnlyStub {
    m22 = 1;

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
    Element.prototype.scrollIntoView ??= function scrollIntoView() {};

    // jsdom does no layout, so getBoundingClientRect/offsetWidth/offsetHeight
    // always report zero. @xyflow/react treats a zero-size node as "not yet
    // measured" (it reads offsetWidth/Height) and skips computing its handle
    // bounds entirely, which would make every connection-drag gesture
    // silently no-op in tests. A fixed non-zero size is enough for the
    // library to consider nodes measured.
    Element.prototype.getBoundingClientRect = function getBoundingClientRect() {
        return {
            width: 150,
            height: 40,
            top: 0,
            left: 0,
            right: 150,
            bottom: 40,
            x: 0,
            y: 0,
            toJSON() {},
        };
    };
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        configurable: true,
        get: () => 150,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        configurable: true,
        get: () => 40,
    });

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
