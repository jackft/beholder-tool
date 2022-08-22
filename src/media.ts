import { MediaState } from './state';
import { inJestTest } from './utils';

export interface Media {
    rootElem: HTMLElement
    element: HTMLElement
    state: MediaState
    addEventListener(name, handler): void
    updateTime(timeMs: number): void
    height(): number
    playpause(): void
    stepForward(n: number): void
    stepBackward(n: number): void
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
    controls: HTMLDivElement = document.createElement("div")
    playpauseElem: HTMLButtonElement = document.createElement("button")
    volume: HTMLInputElement = document.createElement("input")
    currentTime: HTMLSpanElement = document.createElement("span")
    totalTime: HTMLSpanElement = document.createElement("span")
    state: MediaState
    events: MediaEvents
    framerate: number | null
    frameDuration: number | null
    frameOffset: number | null
    _time: number
    constructor(rootElem: HTMLElement, state: MediaState) {
        this.rootElem = rootElem;
        this.rootElem.appendChild(this.element);
        this.rootElem.appendChild(this.controls);
        this.state = state;

        this.events = {
            "media.resize": [],
            "media.timeupdate": []
        };

        this.framerate = state.framerate;
        this.frameDuration = 1/this.framerate;
        this.frameOffset = 0.3 * this.frameDuration; // magic number. don't know why this works.

        this.initVideo();
        this.initControls();
        this._time = this.element.currentTime;
        this.subscribeToEvents();
    }

    initVideo() {
        this.element.src = this.state.src;
        this.element.setAttribute("class", "beholder-video");
        this.element.style.setProperty("width", "100%");
        this.element.style.setProperty("height", "auto");
        this.element.style.setProperty("display", "block");
    }

    initControls() {
        this.controls.setAttribute("class", "beholder-media-controls");

        const playContainer = document.createElement("div");
        playContainer.setAttribute("class", "beholder-media-control")
        playContainer.appendChild(this.playpauseElem);
        if (this.element.paused) {
            this.playpauseElem.innerHTML = "<i class='fa fa-play'></i>";
        } else {
            this.playpauseElem.innerHTML = "<i class='fa fa-pause'></i>";
        }
        this.controls.appendChild(playContainer);

        const volumeContainer = document.createElement("div");
        const downIcon = document.createElement("i");
        downIcon.setAttribute("class", "fa fa-volume-down");
        volumeContainer.appendChild(downIcon);
        volumeContainer.setAttribute("class", "beholder-media-control")
        this.volume.setAttribute("type", "range");
        this.volume.setAttribute("min", "0");
        this.volume.setAttribute("max", "1");
        this.volume.setAttribute("step", "any");
        this.volume.setAttribute("class", "slider");
        volumeContainer.appendChild(this.volume);
        const upIcon = document.createElement("i");
        upIcon.setAttribute("class", "fa fa-volume-up");
        volumeContainer.appendChild(upIcon);
        this.controls.appendChild(volumeContainer);

        const timeContainer = document.createElement("div");
        timeContainer.setAttribute("class", "beholder-media-control")
        timeContainer.appendChild(this.currentTime);
        const divider = document.createElement("span");
        divider.innerText = "/";
        timeContainer.appendChild(divider);
        timeContainer.appendChild(this.totalTime);
        this.element.addEventListener("loadedmetadata", () => {
            this.totalTime.innerText = `${new Date(this.element.duration * 1000).toISOString().slice(11,23)}`;
        });
        this.currentTime.innerText = `${new Date(this.element.currentTime * 1000).toISOString().slice(11,23)}`;
        this.controls.appendChild(timeContainer);
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

        this.volume.addEventListener("input", (event) => {
            this.element.volume = +this.volume.value;
        });

        this.playpauseElem.addEventListener("click", (event) => {
            if (this.element.paused) {
                this.element.play();
            } else if (!this.element.paused) {
                this.element.pause();
            }
        });
    }

    updateTime(timeMs: number) {
        this.currentTime.innerText = `${new Date(timeMs * 1000).toISOString().slice(11,23)}`;
        this.element.currentTime = timeMs;
    }

    timeUpdate() {
        const timeupdateevent = {timeMs: this._time * 1000};
        this.currentTime.innerText = `${new Date(this._time * 1000).toISOString().slice(11,23)}`;
        this.events["media.timeupdate"].forEach(f => f(timeupdateevent));
    }

    height() {
        return this.rootElem.getBoundingClientRect().height;
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
        this.playpauseElem.innerHTML = "<i class='fa fa-pause'></i>";
        this._watchForFrameUpdate();
    }

    _onpause() {
        this.playpauseElem.innerHTML = "<i class='fa fa-play'></i>";
        this._time = this.element.currentTime;
        this.timeUpdate();
    }

    _onseeked() {
        this._time = this.element.currentTime;
        this.timeUpdate();
    }

    _setFrame(frame, force=false) {
        if (force || frame != this._getFrame())
            this.element.currentTime = this.frameDuration * frame + this.frameOffset;
        return {frame: frame, time: this.element.currentTime}
    }

    _getFrame() {
        return Math.floor(this.element.currentTime / this.frameDuration);
    }

    _frameStep(n=1, force=false) {
        this._setFrame(n + this._getFrame(), force)
    }

    playpause() {
        if (this.element.paused) {
            this.element.play();
        } else if (!this.element.paused) {
            this.element.pause();
        }
    }

    stepForward(n = 1) {
        this._frameStep(n);
    }

    stepBackward(n = -1) {
        this._frameStep(n);
    }

}
