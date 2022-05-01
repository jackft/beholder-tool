import { MediaState } from './state';
import { inJestTest } from './utils';

export interface Media {
    rootElem: HTMLElement
    element: HTMLElement
    state: MediaState
    addEventListener(name, handler): void
}


interface MediaEvents {
    "media.resize": Array<(event: ResizeObserverEntry) => void>,
}

export class Video implements Media {
    rootElem: HTMLElement
    element: HTMLVideoElement = document.createElement("video")
    state: MediaState
    events: MediaEvents
    constructor(rootElem: HTMLElement, state: MediaState) {
        this.rootElem = rootElem;
        this.rootElem.appendChild(this.element);
        this.state = state;

        this.events = {
            "media.resize": [],
        };

        this.subscribeToEvents();

        this.initVideo();
    }

    initVideo() {
        this.element.src = this.state.src;
        this.element.setAttribute("class", "beholder-video");
        this.element.style.setProperty("width", "100%");
        this.element.style.setProperty("height", "auto");
        this.element.style.setProperty("display", "block");
    }

    addEventListener(name, handler) {
        this.events[name].push(handler);
    }

    removeEventListener(name, handler) {
        if (!this.events.hasOwnProperty(name)) return;
        const index = this.events[name].indexOf(handler);
        if (index != -1)
            this.events[name].splice(index, 1);
    }

    subscribeToEvents() {
        if (inJestTest()) return;
        const mediaResizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this.events["media.resize"].forEach(f => f(entry));
            });
        });
        mediaResizeObserver.observe(this.rootElem);
    }

}
