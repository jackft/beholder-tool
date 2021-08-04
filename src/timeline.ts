import { SVG, Svg, Rect, Line, Polyline, PointArrayAlias, Point, PointArray, G } from '@svgdotjs/svg.js';

import { ZoomHelper } from './zoom-helper';

function inJestTest() {
    return typeof process !== "undefined" && process.env.JEST_WORKER_ID !== undefined;
}

interface timelineOption {
    width?: number
    height?: number

    treeWidth?: number

    channelHeight?: number
}

class StateTransition {
    redoCallback: () => void;
    undoCallback:() => void;

    constructor(redoCallback, undoCallback) {
        this.redoCallback = redoCallback;
        this.undoCallback = undoCallback;
    }
}

interface TimelineTimeChange {
    x: number;
}

interface TimelineEvents {
    "timeline.resize": Array<(event: ResizeObserverEntry) => void>,
    "timeline.timechange": Array<(event: TimelineTimeChange) => void>
    "timeline.click": Array<(event: MouseEvent) => void>
}

/** Class representing a multichannel timeline. */
export class Timeline {

    maxChannelDepth: number
    channels: Array<Channel>

    cursor: Cursor
    timelineindex: Cursor

    // drawing options
    treeMargin: number = 2;
    width: number = 800;
    height: number = 100;
    treeWidth: number = 15;
    channelHeight: number = 50;

    // drawn things
    element: HTMLElement;

    svg: Svg = SVG();

    treesvg: Svg = SVG();
    treeBackgroundRect: Rect = new Rect();

    panel: HTMLElement = document.createElement("div");

    zoomHelper: ZoomHelper


    events: TimelineEvents;


    /**
    * Timeline.
    * @constructor
    * @param {HTMLElement} element - The element in which to construct the timeline
    * @param {timelineOption} options - Optional parameters
    */
    constructor(element: HTMLElement, options: timelineOption) {
        // drawing options
        this.width = options.width ?? 800;
        this.height = options.height ?? 100;
        this.treeWidth = options.width ?? 15;
        this.channelHeight = options.height ?? 50;

        // stateful things
        this.maxChannelDepth = 0;

        // drawing
        this.element = element;
        this.drawInit();

        // add channels
        this.channels = [new Channel(this, this.channelHeight), new Channel(this, this.channelHeight)];
        this.cursor = new Cursor(this, "cursor");
        this.timelineindex = new Cursor(this, "index");

        this.events = {
            "timeline.resize": [],
            "timeline.timechange": [],
            "timeline.click": [],
        };
        console.log(this.events);

        this.subscribeToEvents();
        this.svg.attr("preserveAspectRatio", "none");
        this.zoomHelper = new ZoomHelper(this.svg, {});


        this.draw();
    }

    //--------------------------------------------------------------------------

    numChannels() {
        return this.channels.reduce((accum, channel) => accum + channel.size(), 0);
    }

    //--------------------------------------------------------------------------

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
        const timelineResizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this.events["timeline.resize"].forEach(f => f(entry));
            });
        });
        timelineResizeObserver.observe(this.svg.node);
        this.svg.on("click", (event, cb, context) => {
                this.events["timeline.click"].forEach(f => f(event));
        });
        //
        this.cursor.subscribeEvents();
        this.timelineindex.subscribeEvents();
        this.channels.forEach(channel => channel.subscribeEvents());
    }

    //--------------------------------------------------------------------------

    point(x: number, y: number) {
        return this.svg.point(x, y);
    }


    //--------------------------------------------------------------------------

    resize(width: number, height: number) {
        this.zoomHelper.original.width = width;
        this.zoomHelper.original.height = height;
        this.svg.size(width, height);
        this.zoomHelper.resize();
        this.zoomHelper.transform();
        this.treesvg.size(this.treesvg.width(), height);
    }

    drawInit() {
        // draw
        this.treesvg.addTo(this.element).size(this.treeWidth, this.height);
        this.treeBackgroundRect = this.treesvg.rect(this.treeWidth, this.height).addClass("beholder-background");

        this.panel = document.createElement("div");
        this.element.append(this.panel);
        this.panel.setAttribute("class", "beholder-channel-panel");


        this.svg.addTo(this.element).size(this.width, this.height).viewbox(0, 0, this.width, this.height);

    }

    draw() {
        this.drawChannels();
    }

    drawChannels() {
        let y = 0;
        this.channels.forEach(channel => {channel.y = y; y += channel.height(); channel.draw();})
        if (y != this.svg.height()) {
            this.resize(this.svg.width(), y);
            this.treeBackgroundRect.attr("height", y);
        }
    }
}

function normalizeEvent(event: MouseEvent): [number, number] {
    return [event.clientX, event.clientY];
}

/** Class representing a cursor on the timeline. */
class Cursor {
    timeline: Timeline
    type: string
    x: number

    // drawing
    height: number = 0;
    line: Line = new Line();

    /**
    * Cursor.
    * @constructor
    * @param {Timeline} timeline - The timeline to which this cursor belongs.
    */
    constructor(timeline: Timeline, type: string) {
        this.timeline = timeline;
        this.type = type;
        this.x = 0;

        // drawing
        this.drawInit();
    }

    //--------------------------------------------------------------------------

    /**
     * Handles move movement.
     * @param {MouseEvent} event - SVG.js MouseEvent.
     */
    mousemove(event: MouseEvent) {
        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.timeline.point(xMouse, yMouse);
        this.x = x;
        //
        this.draw();
    }

    resize(event: ResizeObserverEntry) {
        this.height = event.contentRect.height;
        this.draw();
    }

    reindex(event: TimelineTimeChange) {
        this.x = event.x;
    }

    /**
     * Handle events
     * - mousemove.timeline -> draw cursor
     */
    subscribeEvents() {
        if (inJestTest()) return;
        if (this.type === "cursor") {
            this.timeline.svg.on("mousemove", (event) => this.mousemove(event));
        }
        if (this.type === "index") {
            this.timeline.addEventListener("timeline.timechange", (event) => this.reindex(event));
        }
        this.timeline.addEventListener("timeline.resize", (event) => this.resize(event));
    }

    //--------------------------------------------------------------------------

    drawInit() {
        this.line = this.timeline.svg.line(0, 0, 0, 100);
        if (this.type === "cursor")
            this.line.attr("class", "beholder-cursor");
        else if (this.type === "index")
            this.line.attr("class", "beholder-cursor-index");
    }

    draw() {
        this.line.plot(this.x, 0, this.x, this.height).front();
    }
}

interface ChannelButtons {
    minimize: HTMLButtonElement,
    delete: HTMLButtonElement,
    child: HTMLButtonElement
};

let channelCounter = 0;

export class Channel {
    id: number;

    subchannels: Array<Channel> = [];
    annotations: Array<Annotation> = [];
    parent?: Channel;

    visible: boolean = true;
    _height: number;
    y: number = 0;

    resizeObserver?: ResizeObserver;
    resize: boolean = true;

    timeline: Timeline;
    rect: Rect = new Rect();
    treePath: Polyline = new Polyline();
    panel: HTMLDivElement = document.createElement("div");
    panelBorder: HTMLDivElement = document.createElement("div");
    channelButtonsDiv: HTMLDivElement = document.createElement("div");
    channelButtons: ChannelButtons = Channel.createChannelButtons();

    constructor(timeline: Timeline, height: number, parent?: Channel) {
        this.id = channelCounter++;

        this._height = height;
        this.timeline = timeline;
        this.parent = parent;
        this.drawInit();
        //

        // events
        this.channelButtons.child.addEventListener("click", () => {this.newChild()});
        this.channelButtons.delete.addEventListener("click", () => {this.delete()});
    }

    height(): number {
        return this.subchannels.reduce((accum, channel) => accum + channel.height(), this._height);
    }

    depth(): number {
        let node: Channel = this;
        let d = 0;
        while (node.parent !== undefined) {
            node = node.parent;
            d += 1;
        }
        return d;
    }

    size(): number {
        return this.subchannels.reduce((accum, subchannel) => accum + subchannel.size(), 1);
    }

    //--------------------------------------------------------------------------

    /**
     * Handle events
     */
    subscribeEvents() {
    }

    //--------------------------------------------------------------------------

    newChild() {
        const child = new Channel(this.timeline, this._height, this);
        this.subchannels.push(child);
        this.timeline.maxChannelDepth = Math.max(this.timeline.maxChannelDepth, child.depth());
        return child;
    }

    delete() {
        console.log(`deleting channel ${this.id}`);
        this.subchannels.slice().reverse().forEach(channel => channel.delete());
        this.panel.remove();
        this.treePath.remove();
        this.rect.remove();
        if (this.parent === undefined) {
            const idx = this.timeline.channels.map(c=>c.id).indexOf(this.id);
            this.timeline.channels.splice(idx, 1);
        }
        else {
            const idx = this.parent.subchannels.map(c=>c.id).indexOf(this.id);
            this.parent.subchannels.splice(idx, 1);
        }
    }

    //--------------------------------------------------------------------------

    drawInit() {
        this.rect = this.timeline.svg.rect(this.timeline.svg.width(), this._height).addClass("beholder-channel");
        this.treePath = this.timeline.treesvg.polyline(this.treePathPoints())
                            .attr("class", "beholder-channel-tree");
        //
        this.panel.setAttribute("class", "beholder-channel-panel-child");
        this.panelBorder = document.createElement("div");
        this.panelBorder.setAttribute("class", "beholder-channel-panel-child-child");
        this.panel.appendChild(this.panelBorder);
        if (this.parent !== undefined) {
            const adjacent = (this.parent.subchannels.length == 0)
                           ? this.parent.panel
                           : this.parent.subchannels[this.parent.subchannels.length - 1].panel;
            if (adjacent.parentNode !== null)
                adjacent.parentNode.insertBefore(this.panel, adjacent.nextSibling);
            else
                this.timeline.panel.append(this.panel);
        }
        else
            this.timeline.panel.append(this.panel);

        this.panelBorder.append(this.channelButtonsDiv);
        Object.values(this.channelButtons)
              .forEach(v => this.channelButtonsDiv.append(v));
        //
        if (inJestTest()) return;
        this.resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this._height = entry.contentRect.height;
                this.resize = false;
                this.timeline.draw();
            });
        });
        this.resizeObserver.observe(this.panel);
        //
        this.draw();
    }

    draw() {
        this.rect.attr("y", this.y);
        this.rect.attr("height", this._height);
        if (this.resize)
            this.panel.style.setProperty("height", `${this._height}px`);
        this.resize = true;

        this.treePath.plot(this.treePathPoints());

        let y = this.y + this._height;
        this.subchannels.forEach(channel => {channel.y = y; y += channel.height(); channel.draw();})
    }

    static createChannelButtons(): ChannelButtons {
        const channelButtons = {
            minimize: document.createElement("button"),
            delete: document.createElement("button"),
            child: document.createElement("button"),
        }
        channelButtons.minimize.innerText = "-";
        channelButtons.minimize.setAttribute("class", "beholder-minimize");
        channelButtons.delete.innerText = "x";
        channelButtons.delete.setAttribute("class", "beholder-delete");
        channelButtons.child.innerText = "+";
        channelButtons.child.setAttribute("class", "beholder-child");
        return channelButtons;
    }

    treePathPoints(): PointArray {
        const depthFrac = this.depth()/(this.timeline.maxChannelDepth + 1);
        const width = this.timeline.treesvg.width()-2*this.timeline.treeMargin;
        let rx, ry, ny, lx: number;

        if (this.parent === undefined) {
            ry = this.y + this._height/2;
            rx = 0;
        }
        else {
            ry = this.parent.y + this.parent._height/2;
            rx = this.timeline.treeMargin + (depthFrac*width);
        }
        ny = this.y + this._height/2;
        lx = this.timeline.treesvg.width();
        return new PointArray([
            [rx, ry],
            [rx, ny],
            [lx, ny],
        ]);
    }
}

interface Annotation {
    draw(): void;
}

class Sequence implements Annotation {
    constructor() {

    }

    draw() {

    }
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

