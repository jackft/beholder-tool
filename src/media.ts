import { MediaState } from './state';
import { inJestTest } from './utils';

export interface Media {
    mediaElem: HTMLElement
    element: HTMLElement
    state: MediaState
    readState(state: MediaState): void
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
    mediaElem: HTMLElement
    element: HTMLVideoElement = document.createElement("video")
    controls: HTMLDivElement = document.createElement("div")
    playpauseElem: HTMLButtonElement = document.createElement("button")
    nextFrameElem: HTMLButtonElement = document.createElement("button")
    prevFrameElem: HTMLButtonElement = document.createElement("button")
    volume: HTMLInputElement = document.createElement("input")
    currentTime: HTMLSpanElement = document.createElement("span")
    totalTime: HTMLSpanElement = document.createElement("span")
    frameElem: HTMLSpanElement = document.createElement("span")
    playbackElem: HTMLSpanElement = document.createElement("span")
    playbackSpeeds: Array<number> = [0.05, 0.1, 0.5, 0.75, 1.0, 1.5, 2.0, 2.25, 2.5, 3.0, 5.0, 10.0]
    playbackSpeedIdx: number = 4
    state: MediaState
    events: MediaEvents
    framerate: number
    frameDuration: number
    frameOffset: number
    _time: number
    constructor(rootElem: HTMLElement, state: MediaState) {
        this.mediaElem = document.createElement("div");
        this.mediaElem.setAttribute("class", "beholder-media");
        rootElem.appendChild(this.mediaElem);
        this.mediaElem.appendChild(this.element);
        this.mediaElem.appendChild(this.controls);
        this.state = state;

        this.events = {
            "media.resize": [],
            "media.timeupdate": []
        };

        this.framerate = state.framerate || 30;
        this.frameDuration = 1/this.framerate;
        this.frameOffset = 0.3 * this.frameDuration; // magic number. don't know why this works.

        this.initVideo();
        this.initControls();
        this._time = this.element.currentTime;
        this.subscribeToEvents();
    }

    readState(state: MediaState) {
        this.state = state;
        this.element.src = state.src;
        this.framerate = state.framerate || 30;
        this.frameDuration = 1/this.framerate;
        this.frameOffset = 0.3 * this.frameDuration; // magic number. don't know why this works.
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
        this.playpauseElem.setAttribute("title", "play/pause");
        if (this.element.paused) {
            this.playpauseElem.innerHTML = "<i class='fa fa-play'></i>";
        } else {
            this.playpauseElem.innerHTML = "<i class='fa fa-pause'></i>";
        }

        const prevFrameContainer = document.createElement("div");
        prevFrameContainer.setAttribute("class", "beholder-media-control")
        this.prevFrameElem.innerHTML = "<i class='fa fa-step-backward'></i>";
        this.prevFrameElem.setAttribute("title", "prev frame");
        prevFrameContainer.appendChild(this.prevFrameElem);
        this.controls.append(prevFrameContainer);

        this.controls.appendChild(playContainer);
        const nextFrameContainer = document.createElement("div");
        nextFrameContainer.setAttribute("class", "beholder-media-control")
        this.nextFrameElem.innerHTML = "<i class='fa fa-step-forward'></i>";
        this.nextFrameElem.setAttribute("title", "next frame");
        nextFrameContainer.appendChild(this.nextFrameElem);
        this.controls.append(nextFrameContainer);

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

        const frameContainer = document.createElement("div");
        frameContainer.setAttribute("class", "beholder-media-control")
        const frameLabel = document.createElement("span");
        frameLabel.innerText = "#:"
        frameContainer.appendChild(frameLabel);
        frameContainer.appendChild(this.frameElem);
        this.frameElem.innerText = `${this._getFrame()}`;
        this.controls.appendChild(frameContainer);

        const playbackContainer = document.createElement("div");
        playbackContainer.setAttribute("class", "beholder-media-control")
        playbackContainer.appendChild(this.playbackElem);
        const playbackLabel = document.createElement("span");
        playbackLabel.innerText = "x";
        playbackContainer.appendChild(playbackLabel);
        this.playbackElem.innerText = `${this._getPlayback()}`;
        this.controls.appendChild(playbackContainer);
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
        mediaResizeObserver.observe(this.mediaElem);

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

        this.nextFrameElem.addEventListener("click", (event) => this.stepForward());
        this.prevFrameElem.addEventListener("click", (event) => this.stepBackward());
    }

    updateTime(timeMs: number) {
        this.currentTime.innerText = `${new Date(timeMs).toISOString().slice(11,23)}`;
        this.frameElem.innerText = `${this._getFrame()}`;
        this.element.currentTime = timeMs/1000;
    }

    timeUpdate() {
        const timeupdateevent = {timeMs: this._time * 1000};
        this.currentTime.innerText = `${new Date(this._time * 1000).toISOString().slice(11,23)}`;
        this.frameElem.innerText = `${this._getFrame()}`;
        this.events["media.timeupdate"].forEach(f => f(timeupdateevent));
    }

    height() {
        return this.mediaElem.getBoundingClientRect().height;
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

    _getPlayback() {
        return this.element.playbackRate;
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

    speedUp(factor) {
        this.playbackSpeedIdx = Math.min(this.playbackSpeeds.length - 1, this.playbackSpeedIdx + 1);
        this.element.playbackRate = this.playbackSpeeds[this.playbackSpeedIdx];
        this.playbackElem.innerText = `${this.element.playbackRate}`;
    }
    slowDown(factor) {
        this.playbackSpeedIdx = Math.max(0, this.playbackSpeedIdx - 1);
        this.element.playbackRate = this.playbackSpeeds[this.playbackSpeedIdx];
        this.playbackElem.innerText = `${this.element.playbackRate}`;
    }

    stepForward(n = 1) {
        this._frameStep(n);
    }

    stepBackward(n = 1) {
        this._frameStep(-n);
    }

}
