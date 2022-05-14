import { MediaState } from './state';
import { inJestTest } from './utils';

export interface Media {
    rootElem: HTMLElement
    element: HTMLElement
    state: MediaState
    addEventListener(name, handler): void
    updateTime(timeMs: number): void
}

interface TimeUpdateEvent {
    timeMs: number
}

interface MediaEvents {
    "media.resize": Array<(event: ResizeObserverEntry) => void>,
    "media.timeupdate": Array<(event: TimeUpdateEvent) => void>,
}

export class Video implements Media {
    rootElem: HTMLElement
    element: HTMLVideoElement = document.createElement("video")
    state: MediaState
    events: MediaEvents
    _time: number
    constructor(rootElem: HTMLElement, state: MediaState) {
        this.rootElem = rootElem;
        this.rootElem.appendChild(this.element);
        this.state = state;

        this.events = {
            "media.resize": [],
            "media.timeupdate": []
        };

        this.subscribeToEvents();

        this.initVideo();
        this.element.setAttribute("controls", "");
        this._time = this.element.currentTime;
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

        this.element.addEventListener("play", () => {this._onplay()});
        this.element.addEventListener("pause", () => {this._onpause()});
        this.element.addEventListener("seeked", () => {this._onseeked()});
    }

    updateTime(timeMs: number) {
        this.element.currentTime = timeMs;
    }

    timeUpdate() {
        const timeupdateevent = {timeMs: this._time * 1000};
        this.events["media.timeupdate"].forEach(f => f(timeupdateevent));
    }

    _watchForFrameUpdate() {
        const time = this.element.currentTime;
        if (time != this._time) {
            this._time = time;
            this.timeUpdate();
        }
        if (!this.element.paused) {
            requestAnimationFrame(() => this._watchForFrameUpdate());
        }
    }

    _onplay() {
        this._watchForFrameUpdate();
    }

    _onpause() {
        this._time = this.element.currentTime;
        this.timeUpdate();
    }

    _onseeked() {
        this._time = this.element.currentTime;
        this.timeUpdate();
    }

}
