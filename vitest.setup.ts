import "@testing-library/jest-dom/vitest";

// jsdom implements neither ResizeObserver, scrollIntoView
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

// Only the zoom factor (m22, from a `matrix(a, b, c, d, e, f)` transform)
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

    // jsdom implements neither - used by the architecture export download
    window.URL.createObjectURL ??= () => "blob:jsdom-stub";
    window.URL.revokeObjectURL ??= () => {};

    // jsdom does no layout.
    function isViewportContainer(element: Element): boolean {
        return element.classList?.contains("react-flow__renderer") ?? false;
    }

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
