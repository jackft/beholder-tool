import { MediaState } from './state';

export interface Media {
    rootElem: HTMLElement
    element: HTMLElement
    state: MediaState
}

export class Video implements Media {
    rootElem: HTMLElement
    element: HTMLVideoElement = document.createElement("video")
    state: MediaState
    constructor(rootElem: HTMLElement, state: MediaState) {
        this.rootElem = rootElem;
        this.rootElem.appendChild(this.element);
        this.state = state;
        this.initVideo();
    }

    initVideo() {
        this.element.src = this.state.src;
        this.element.setAttribute("class", "beholder-video");
        this.element.style.setProperty("width", "100%");
        this.element.style.setProperty("height", "auto");
        this.element.style.setProperty("display", "block");
    }
}
