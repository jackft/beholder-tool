import { SVG, Svg, Rect, Line } from '@svgdotjs/svg.js';

import { ZoomHelper } from './zoom-helper';


interface timelineOption {
    width?: number
    height?: number
}

export class Timeline {
    svg: Svg;
    zoomHelper: ZoomHelper

    backgroundRect: Rect

    channels: Array<Channel>

    cursor: Cursor
    constructor(element: HTMLElement, options: timelineOption) {
        const width = options.width ?? 800;
        const height = options.width ?? 100;
        this.svg = SVG().addTo(element).size(width, height).viewbox(0, 0, width, height);
        this.zoomHelper = new ZoomHelper(this.svg, {});

        this.backgroundRect = this.svg.rect(width, height).addClass("psych-coder-background");

        this.channels = [new Channel(this.svg)];

        this.cursor = new Cursor(this.svg);

        this.svg.attr("preserveAspectRatio", "none");
    }
}

function normalizeEvent(event: MouseEvent): [number, number] {
    return [event.clientX, event.clientY];
}

class Cursor {
    x: number
    //
    line: Line
    parent: Svg

    constructor(parent: Svg) {
        this.x = 0;
        //
        this.line = parent.line([0, 100]).attr("class", "beholder-cursor");
        this.parent = parent;
        parent.on("mousemove", (event) => this.mouseMove(event), parent);
    }

    mouseMove(event: MouseEvent) {
        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.parent.point(xMouse, yMouse);
        this.x = x;
    }

    draw() {
        this.line.attr("x", this.x);
    }
}

class Channel {

    annotations: Array<Annotation> = [];

    constructor(parent: Svg) {
        [0, 100, 200, 300].forEach(x => parent.rect(2, 100).attr("x", x).addClass("psych-coder-line"));
    }
}

interface Annotation {
    draw(): void;
}

class Interval implements Annotation {
    constructor() {

    }

    draw() {

    }
}

class Instant implements Annotation {
    constructor() {

    }

    draw() {

    }
}

