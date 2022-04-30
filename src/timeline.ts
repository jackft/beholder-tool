import { SVG, Shape, Svg, Rect, Line, Polyline, PointArrayAlias, Point, PointArray, G, Matrix, on, off } from '@svgdotjs/svg.js';

import { ChannelState, Layout, TimelineAnnotationState, TimelineState } from './state';
import { LinearScale } from './scales';
import { inJestTest } from './utils';
import { ZoomHelper } from './zoom-helper';

function deepCopy(o) {return JSON.parse(JSON.stringify(o))}

function overlaps(a: {startTime: number, endTime: number}, b: {startTime: number, endTime: number}) {
    return !(a.endTime < b.startTime || b.endTime < a.startTime);
}

const cumSum = (sum => value => sum += value)(0);

function overlappingSets(annotations: Array<TimelineAnnotation>) {
    if (annotations.length == 0) return [];
    let equivalenceClasses: Array<{g: Array<TimelineAnnotation>, maxOverlapSize: number}> = [];
    let equivalenceClass: Array<TimelineAnnotation> = [];
    let currentAnnotation: null | TimelineAnnotation = null;
    let coordinates: Array<[number, number]> = [];
    let added = false;
    annotations.forEach(annotation => {
        if (currentAnnotation == null || overlaps(currentAnnotation.state, annotation.state)) {
            equivalenceClass.push(annotation);
            coordinates.push([annotation.state.startTime, 1]);
            coordinates.push([annotation.state.endTime, -1]);
            if (currentAnnotation == null || currentAnnotation.state.endTime < annotation.state.endTime) {
                currentAnnotation = annotation;
            }
        } else if (equivalenceClass.length > 0) {
            const maxOverlapSize = Math.max(...coordinates.sort((a, b) => a[0] - b[0]).map(x => x[1]).map(cumSum));
            equivalenceClasses.push({g: equivalenceClass, maxOverlapSize: maxOverlapSize});
            currentAnnotation = annotation;
            equivalenceClass = [annotation];
            coordinates = [];
            coordinates.push([annotation.state.startTime, 1]);
            coordinates.push([annotation.state.endTime, -1]);
        }
    });
    const maxOverlapSize = Math.max(...coordinates.sort((a, b) => a[0] - b[0]).map(x => x[1]).map(cumSum));
    equivalenceClasses.push({g: equivalenceClass, maxOverlapSize: maxOverlapSize});
    return equivalenceClasses;
}

interface timelineOption {
    width?: number
    height?: number

    treeWidth?: number

    channelHeight?: number
}


interface TimelineTimeChange {
    x: number;
}

interface TimelineEvents {
    "timeline.resize": Array<(event: ResizeObserverEntry) => void>,
    "timeline.timechange": Array<(event: TimelineTimeChange) => void>
    "timeline.click": Array<(event: MouseEvent) => void>
    "timeline.createChannel": Array<(event: ChannelState) => void>
}

/** Class representing a multichannel timeline. */
export class Timeline {
    state: TimelineState
    ruler: Ruler | null
    channels: Array<Channel>
    timelineAnnotations: Array<TimelineAnnotation> = []
    layout: Layout

    maxChannelDepth: number

    cursor: Cursor
    timelineindex: Cursor

    // drawing options
    treeMargin: number = 2;
    width: number = 800;
    height: number = 100;
    treeWidth: number = 15;
    channelHeight: number = 50;

    xscale: LinearScale;

    // drawn things
    rootElem: HTMLElement;

    timelineSvg: Svg;
    panel: HTMLElement;
    treeSvg: Svg;

    zoomHelper: ZoomHelper


    events: TimelineEvents;


    /**
    * Timeline.
    * @constructor
    * @param {HTMLElement} element - The element in which to construct the timeline
    * @param {timelineOption} options - Optional parameters
    */
    constructor(rootElem: HTMLElement, state: TimelineState, layout: Layout) {
        this.rootElem = rootElem;
        this.state = state;
        this.layout = layout;
        this.treeSvg = this.initTree();
        this.panel = this.initPanel();
        this.timelineSvg = this.initTimeline();
        this.zoomHelper = this.initZoomHelper();
        this.ruler = this.initRuler();
        this.channels = this.initChannels();

        // drawing options
        this.channelHeight = layout.channelHeight ?? 800;
        this.treeWidth = layout.treeWidth ?? 15;
        this.xscale = new LinearScale([0, this.width], [this.state.startTime, this.state.endTime]);

        // stateful things
        this.maxChannelDepth = 0;

        // drawing
        this.drawInit();

        // add channels
        //this.channels = [];
        //state.channels.forEach(x=>this.channels.push(new Channel(this, 100)));
        this.cursor = new Cursor(this, "cursor");
        this.timelineindex = new Cursor(this, "index");

        this.events = {
            "timeline.resize": [],
            "timeline.timechange": [],
            "timeline.click": [],
            "timeline.createChannel": [],
        };

        this.subscribeToEvents();


        this.draw();
    }

    initTree() {
        const treeSvg = SVG();
        treeSvg.addTo(this.rootElem).size(this.treeWidth, this.height);
        return treeSvg;
    }

    initPanel() {
        const panel = document.createElement("div");
        panel.setAttribute("class", "beholder-channel-panel");
        this.rootElem.appendChild(panel);
        return panel;
    }

    initTimeline() {
        const timelineSvg = SVG();
        this.width = this.layout.maxTimelineInitWidth;
        timelineSvg.addTo(this.rootElem).size(this.width, this.height).viewbox(0, 0, this.width, this.height);
        timelineSvg.attr("preserveAspectRatio", "none");
        return timelineSvg;
    }

    initRuler() {
        return (this.layout.ruler !== undefined && this.layout.ruler) ? new Ruler(this, this.layout) : null;
    }

    initZoomHelper() {return new ZoomHelper(this.timelineSvg, {});}

    initChannels() {
        return this.state.channels.map(channelState => new Channel(this, channelState, this.layout));
    }

    //--------------------------------------------------------------------------

    getChannel(channelId: number): Channel | null {
        const channelIdx = this.channels.map(c=>c.state.id).indexOf(channelId);
        if (channelIdx == -1) return null;
        return this.channels[channelIdx];
    }

    getTimelineAnnotation(annotationId: number): TimelineAnnotation | null {
        const annotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(annotationId);
        if (annotationIdx == -1) return null;
        return this.timelineAnnotations[annotationIdx];
    }

    //--------------------------------------------------------------------------

    createChannel(state: ChannelState) {
        this.channels.push(new Channel(this, state, this.layout));
        this.state.channels.push(state);
    }

    updateChannel(state: ChannelState) {
        const channel = this.getChannel(state.id);
        const channelStateIdx = this.state.channels.map(c=>c.id).indexOf(state.id);
        if (channel === null || channelStateIdx == -1) return null;
        channel.state = state;
        this.state.channels[channelStateIdx] = state;
    }

    deleteChannel(channelId) {
        const channelIdx = this.channels.map(c=>c.state.id).indexOf(channelId);
        const channelStateIdx = this.state.channels.map(c=>c.id).indexOf(channelId);
        if (channelIdx == -1 || channelStateIdx == -1) return null;
        this.channels[channelIdx].delete();
        this.channels.splice(channelIdx, 1);
        this.state.channels.splice(channelStateIdx, 1);
    }

    createTimelineAnnotation(state: TimelineAnnotationState) {
        const ta = new TimelineAnnotation(this, state);
        this.timelineAnnotations.push(ta);
        this.state.timelineAnnotations.push(state);
        return ta;
    }

    updateTimelineAnnotation(state: TimelineAnnotationState) {
        const timelineAnnotation = this.getTimelineAnnotation(state.id);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(state.id);
        if (timelineAnnotation === null || timelineAnnotationStateIdx == -1) return null;
        timelineAnnotation.state = state;
        this.state.timelineAnnotations[timelineAnnotationStateIdx] = state;
        timelineAnnotation.draw();
        this.drawAnnotations();
    }

    deleteTimelineAnnotation(timelineAnnotationId) {
        const timelineAnnotationIdx = this.timelineAnnotations.map(a=>a.state.id).indexOf(timelineAnnotationId);
        const timelineAnnotationStateIdx = this.state.timelineAnnotations.map(c=>c.id).indexOf(timelineAnnotationId);
        if (timelineAnnotationIdx == -1 || timelineAnnotationStateIdx == -1) return null;
        this.timelineAnnotations[timelineAnnotationIdx].delete();
        this.timelineAnnotations.splice(timelineAnnotationIdx, 1);
        this.state.timelineAnnotations.splice(timelineAnnotationStateIdx, 1);
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
        timelineResizeObserver.observe(this.timelineSvg.node);
        this.timelineSvg.on("click", (event, cb, context) => {
                this.events["timeline.click"].forEach(f => f(event));
        });
        //
        this.cursor.subscribeEvents();
        this.timelineindex.subscribeEvents();
    }

    //--------------------------------------------------------------------------

    point(x: number, y: number) {
        return this.timelineSvg.point(x, y);
    }


    //--------------------------------------------------------------------------

    resize(width: number, height: number) {
        this.zoomHelper.original.width = width;
        this.zoomHelper.original.height = height;
        this.timelineSvg.size(width, height);
        this.zoomHelper.resize();
        this.zoomHelper.transform();
        this.treeSvg.size(this.treeSvg.width(), height);
        this.width = width;
        this.height = height;

        this.xscale = new LinearScale([0, this.timelineSvg.width()], [this.state.startTime, this.state.endTime]);
    }

    resizeFullWidth() {
        const width = this.rootElem.clientWidth - this.treeSvg.width() - this.panel.clientWidth;
        this.resize(width, this.treeSvg.height());
    }

    drawInit() {
        // draw



    }

    draw() {
        this.drawRuler();
        this.drawChannels();
        this.drawAnnotations();
    }

    drawRuler() {
        if (this.ruler !== null)
            this.ruler.draw();
    }

    drawChannels() {
        let y = this.ruler !== null ? this.ruler.height : 0;
        this.channels.forEach(channel => {channel.y = y; y += channel.height; channel.draw();})
        if (y != this.timelineSvg.height()) {
            this.resize(this.timelineSvg.width(), y);
        }
    }

    drawAnnotations() {
        this.channels.forEach(channel => {
            let annotations = this.timelineAnnotations.filter(
                a => a.state.channelId == channel.state.id
            );
            let sets = overlappingSets(annotations.sort((a, b) => a.state.startTime - b.state.startTime));
            sets.forEach(set => {
                const maxOverlapSize = set.maxOverlapSize;
                const occupied: Array<null | TimelineAnnotation> = Array(maxOverlapSize).fill(null);
                set.g.sort((a, b) => a.state.id - b.state.id).forEach((annotation) => {
                    let index = -1;
                    for (let i = 0; i < occupied.length; ++i) {
                        const elem = occupied[i];
                        if (elem == null) {
                            index = i;
                            occupied[i] = annotation;
                            break;
                        } else if (elem.state.endTime <= annotation.state.startTime) {
                            index = i;
                            occupied[i] = annotation;
                            break;
                        }
                    }
                    if (index == -1) {
                        index = occupied.length - 1;
                    }
                    annotation.height = channel.height / maxOverlapSize;
                    annotation.y = channel.y + (annotation.height * index);
                    annotation.draw();
                });
            });
        })
    }
}

function normalizeEvent(event: MouseEvent): [number, number] {
    return [event.clientX, event.clientY];
}

interface CursorState {
    type: string,
    x: number,
    height: number
}

/** Class representing a cursor on the timeline. */
class Cursor {
    timeline: Timeline
    state: CursorState

    // drawing
    line: Line = new Line();

    /**
    * Cursor.
    * @constructor
    * @param {Timeline} timeline - The timeline to which this cursor belongs.
    */
    constructor(timeline: Timeline, type: string) {
        this.timeline = timeline;

        this.state = {type: type, x: 0, height: 0};

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
        this.state.x = this.timeline.xscale.call(x);
        //
        this.draw();
    }

    resize(event: ResizeObserverEntry) {
        this.state.height = event.contentRect.height;
        this.draw();
    }

    reindex(event: TimelineTimeChange) {
        this.state.x = event.x;
    }

    /**
     * Handle events
     * - mousemove.timeline -> draw cursor
     */
    subscribeEvents() {
        if (inJestTest()) return;
        if (this.state.type === "cursor") {
            this.timeline.timelineSvg.on("mousemove", (event) => this.mousemove(event));
        }
        if (this.state.type === "index") {
            this.timeline.addEventListener("timeline.timechange", (event) => this.reindex(event));
        }
        this.timeline.addEventListener("timeline.resize", (event) => this.resize(event));
    }

    //--------------------------------------------------------------------------

    drawInit() {
        this.line = this.timeline.timelineSvg.line(0, 0, 0, 100);
        if (this.state.type === "cursor")
            this.line.attr("class", "beholder-cursor");
        else if (this.state.type === "index")
            this.line.attr("class", "beholder-cursor-index");
    }

    draw() {
        this.line.plot(this.timeline.xscale.inv(this.state.x), 0, this.timeline.xscale.inv(this.state.x), this.state.height).front();
    }
}

export class Ruler {

    timeline: Timeline;
    layout: Layout;

    height: number;
    y: number;

    // resize observer things
    resizeObserver?: ResizeObserver;
    resize: boolean = true;

    panel: HTMLDivElement = document.createElement("div");
    panelBorder: HTMLDivElement = document.createElement("div");
    ruler: Rect = new Rect();
    ticks: Array<Line>;

    constructor(timeline: Timeline, layout: Layout) {
        this.timeline = timeline;
        this.layout = layout;
        this.y = 0;
        this.height = 25;

        this.ruler = this.initRuler();
        this.ticks = this.initTicks();
        this.panel = this.initPanel();

        this.draw();
    }

    initRuler() {
        const ruler = this.timeline.timelineSvg
                          .rect(this.timeline.timelineSvg.width(), this.height)
                          .addClass("beholder-ruler");
        return ruler;
    }

    initTicks() {
        const ticks = [];
        const blockWidth = Math.floor(this.timeline.width / 10);
        const tickWidth = Math.floor(this.timeline.width / 100)
        let j=0;
        for (let i=0; i < this.timeline.width; i+=tickWidth) {
            let height = this.height / 6;
            if (j % 10 == 0) {
                height = this.height / 2;
            } else if (j % 5 == 0) {
                height = this.height / 3;
            }
            this.timeline.timelineSvg
                         .line(i, 0, i, height)
                         .addClass("beholder-ruler-ticks");
            ++j;
        }
        return ticks;
    }

    initPanel() {
        this.panel.setAttribute("class", "beholder-ruler-panel-child");
        this.panelBorder.setAttribute("class", "beholder-ruler-panel-child-child");

        this.timeline.panel.append(this.panel);
        this.panel.appendChild(this.panelBorder);

        if (inJestTest()) return this.panel;
        this.resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this.height = entry.contentRect.height;
                this.resize = false;
                this.timeline.draw();
            });
        });
        this.resizeObserver.observe(this.panel);
        return this.panel;
    }

    draw() {
        this.ruler.attr("y", this.y);
        this.ruler.attr("width", this.timeline.timelineSvg.width());
        this.ruler.attr("height", this.height);

        if (this.resize)
            this.panel.style.setProperty("height", `${this.height}px`);

        this.resize = true;


        let y = this.y + this.height;
    }
}

interface ChannelButtons {
    minimize: HTMLButtonElement,
    delete: HTMLButtonElement,
    child: HTMLButtonElement
};

let channelCounter = 0;

export class Channel {
    timeline: Timeline;
    state: ChannelState
    parent: Channel | null;
    // resize observer things
    resizeObserver?: ResizeObserver;
    resize: boolean = true;
    // drawn things
    height: number;
    y: number;
    channel: Rect = new Rect();
    treePath: Polyline = new Polyline();
    panel: HTMLDivElement = document.createElement("div");
    panelBorder: HTMLDivElement = document.createElement("div");
    channelButtonsDiv: HTMLDivElement = document.createElement("div");
    channelButtons: ChannelButtons = Channel._createChannelButtons();

    constructor(timeline: Timeline, state: ChannelState, layout: Layout) {
        this.timeline = timeline;
        this.state = state;
        this.parent = this.state.parentId == null
                    ? null
                    : timeline.getChannel(this.state.parentId);
        //
        this.height = layout.channelHeight ?? 100;
        this.y = 0;
        this.treePath = this.initTree();
        this.panel = this.initPanel();
        this.channel = this.initChannel();
        //
        this.subscribeEvents();
        // events
        //this.channelButtons.child.addEventListener("click", () => {this.newChild()});
        //this.channelButtons.delete.addEventListener("click", () => {this.delete()});

        this.draw();
    }

    _treePathPoints(): PointArray {
        const depthFrac = this.depth()/(this.timeline.maxChannelDepth + 1);
        const width = this.timeline.treeSvg.width()-2*this.timeline.treeMargin;
        let rx, ry, ny, lx: number;

        if (this.parent === null) {
            ry = this.y + this.height/2;
            rx = 0;
        }
        else {
            ry = this.parent.y + this.parent.height/2;
            rx = this.timeline.treeMargin + (depthFrac*width);
        }
        ny = this.y + this.height/2;
        lx = this.timeline.treeSvg.width();
        return new PointArray([
            [rx, ry],
            [rx, ny],
            [lx, ny],
        ]);
    }

    initTree() {
        const treePath = this.timeline.treeSvg.polyline(this._treePathPoints())
                       .attr("class", "beholder-channel-tree");
        return treePath;
    }

    static _createChannelButtons(): ChannelButtons {
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

    initPanel() {
        this.panel.setAttribute("class", "beholder-channel-panel-child");
        this.panelBorder.setAttribute("class", "beholder-channel-panel-child-child");

        this.timeline.panel.append(this.panel);
        this.panel.appendChild(this.panelBorder);
        this.panelBorder.append(this.channelButtonsDiv);

        Object.values(this.channelButtons)
              .forEach(v => this.channelButtonsDiv.append(v));

        if (inJestTest()) return this.panel;
        this.resizeObserver = new ResizeObserver(entries => {
            entries.forEach(entry => {
                this.height = entry.contentRect.height;
                this.resize = false;
                this.timeline.draw();
            });
        });
        this.resizeObserver.observe(this.panel);
        return this.panel;
    }

    initChannel() {
        const channel = this.timeline.timelineSvg
                            .rect(this.timeline.timelineSvg.width(), this.height)
                            .addClass("beholder-channel");
        return channel;
    }

    draw() {
        this.channel.attr("y", this.y);
        this.channel.attr("width", this.timeline.timelineSvg.width());
        this.channel.attr("height", this.height);
        if (this.resize)
            this.panel.style.setProperty("height", `${this.height}px`);
        this.resize = true;

        this.treePath.plot(this._treePathPoints());

        let y = this.y + this.height;
    }

    //--------------------------------------------------------------------------

    depth(): number {
        let node: Channel = this;
        let d = 0;
        while (node.parent != null) {
            node = node.parent
            d += 1;
        }
        return d;
    }

    //--------------------------------------------------------------------------

    /**
     * Handle events
     */
    subscribeEvents() {
        this.channelButtons.child.addEventListener("click", (event) => {
            console.log(this, this.state);
            this.timeline.events["timeline.createChannel"].forEach(f => {
                const newState = deepCopy(this.state);
                newState.id = Math.max(...this.timeline.channels.map(c => c.state.id)) + 1;
                newState.parentId = this.state.id;
                newState.name = `c(${newState.name})`;
                f(newState);
            });
        });
    }

    //--------------------------------------------------------------------------

    delete() {
        console.log(`deleting channel ${this.state.id}`);
        this.panel.remove();
        this.treePath.remove();
        this.channel.remove();
    }

    //--------------------------------------------------------------------------


}

interface AnnotationEvents {
    "annotation.dragend": Array<(event: {oldState: TimelineAnnotationState, newState: TimelineAnnotationState}) => void>,
}

class TimelineAnnotation {
    state: TimelineAnnotationState;
    timeline: Timeline;

    g: G = new G();
    rect: Rect = new Rect();
    l: Line = new Line();
    r: Line = new Line();
    height: number = 0;
    y: number = 0;

    events: AnnotationEvents;
    dragStartState: TimelineAnnotationState | null = null;
    draggedShape: string = "";
    dragStartX: number = -1;

    constructor(timeline: Timeline, state: TimelineAnnotationState) {
        this.timeline = timeline;
        this.state = state;
        if (this.state.type == "interval") {
            this.g = this.initInterval();
            this.drawInterval();
            this.timeline.drawAnnotations();
        }
        this.events = {
            "annotation.dragend": [],
        };
        this.subscribeEvents();
    }

    initInterval() {
        const g = this.timeline.timelineSvg.group().attr("class", "beholder-interval");
        this.rect = g.rect();
        this.l = g.line();
        this.r = g.line();
        return g;
    }

    draw() {
        if (this.state.type == "interval") {
            this.drawInterval();
        }
    }

    drawInterval() {
        if (this.state.startTime > this.state.endTime) {
            if (this.draggedShape == "l") {
                this.draggedShape = "r";
                let tmp = this.l;
                this.l = this.r;
                this.r = tmp;
            }
            else if (this.draggedShape == "r") {
                this.draggedShape = "l";
                let tmp = this.l;
                this.l = this.r;
                this.r = tmp;
            }
            this.r.off("mousedown");
            this.l.off("mousedown");
            this.rect.off("mousedown");
            this.r.on("mousedown", (event) => {
                this.draggedShape = "r";
                this.dragstart(event)
            });
            this.l.on("mousedown", (event) => {
                this.draggedShape = "l";
                this.dragstart(event)
            });
            this.rect.on("mousedown", (event) => {
                this.draggedShape = "rect";
                this.dragstart(event)
            });
            const tmp = this.state.startTime;
            this.state.startTime = this.state.endTime;
            this.state.endTime = tmp;
        }
        const channel = this.timeline.getChannel(this.state.channelId);
        if (channel == null) return;
        const width = this.timeline.xscale.inv(this.state.endTime - this.state.startTime);
        this.rect.attr("width", width);
        this.rect.attr("height", this.height);
        this.l.plot([[0, 0], [0, this.height]])
        this.r.plot([[width, 0], [width, this.height]])
        this.g.transform({translateX: this.timeline.xscale.inv(this.state.startTime), translateY: this.y});
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

    subscribeEvents() {
        this.r.on("mousedown", (event) => {
            this.draggedShape = "r";
            this.dragstart(event)
        });
        this.l.on("mousedown", (event) => {
            this.draggedShape = "l";
            this.dragstart(event)
        });
        this.rect.on("mousedown", (event) => {
            this.draggedShape = "rect";
            this.dragstart(event)
        });
    }

    dragstart(event: MouseEvent) {
        this.timeline.timelineSvg.addClass("beholder-interval-resize");
        this.g.addClass("beholder-dragging");
        this.dragStartState = deepCopy(this.state);
        event.preventDefault();
        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.timeline.point(xMouse, yMouse);
        this.dragStartX = x;
        on(document, "mousemove.annotation", ((event: MouseEvent) => this.drag(event)) as any);
        on(document, "mouseup.annotation", ((event: MouseEvent) => this.dragend(event)) as any);
    }

    drag(event: MouseEvent) {
        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.timeline.point(xMouse, yMouse);
        if (this.state.type == "interval") {
            if (this.draggedShape == "l")
                this.state.startTime = this.timeline.xscale.call(x);
            else if (this.draggedShape == "r")
                this.state.endTime = this.timeline.xscale.call(x);
            else if (this.draggedShape == "rect" && this.dragStartState != null) {
                const delta = this.timeline.xscale.call(x - this.dragStartX);
                this.state.endTime = this.dragStartState.endTime + delta;
                this.state.startTime = this.dragStartState.startTime + delta;
            }
            this._keepIntervalInBounds();
        }
        this.timeline.drawAnnotations();
    }

    dragend(event: MouseEvent) {
        this.timeline.timelineSvg.removeClass("beholder-interval-resize");
        this.g.removeClass("beholder-dragging");
        const [xMouse, yMouse] = normalizeEvent(event);
        const {x, y} = this.timeline.point(xMouse, yMouse);
        this.draggedShape = "";
        this.events["annotation.dragend"].forEach(f => {
            if (this.dragStartState != null)
                f({oldState: this.dragStartState, newState: deepCopy(this.state)});
        });
        this.dragStartState = null;
        off(document, "mousemove.annotation");
        off(document, "mouseup.annotation");
    }

    delete() {
        this.g.remove();
    }


    _keepIntervalInBounds() {
        if (this.draggedShape == "l") {
            this.state.startTime = Math.min(Math.max(this.timeline.xscale.call(0), this.state.startTime), this.timeline.xscale.call(this.timeline.width));
        } else if (this.draggedShape == "r") {
            this.state.endTime = Math.min(Math.max(this.timeline.xscale.call(0), this.state.endTime), this.timeline.xscale.call(this.timeline.width));
        } else if (this.draggedShape == "rect") {
            if (this.state.startTime < this.timeline.xscale.call(0)) {
                const width = this.state.endTime - this.state.startTime;
                this.state.startTime = 0;
                this.state.endTime = width;
            } else if (this.state.endTime > this.timeline.xscale.call(this.timeline.width)) {
                const width = this.state.endTime - this.state.startTime;
                this.state.startTime = this.timeline.xscale.call(this.timeline.width) - width;
                this.state.endTime = this.timeline.xscale.call(this.timeline.width);
            }
        }
    }
}
