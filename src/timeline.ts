import { SVG, Shape, Svg, Rect, Line, Polyline, PointArrayAlias, Point, PointArray, Text, G, Matrix, on, off } from '@svgdotjs/svg.js';

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
    "timeline.createAnnotation": Array<(event: {oldState: TimelineAnnotationState, newState: TimelineAnnotationState}) => void>
}

/** Class representing a multichannel timeline. */
export class Timeline {
    state: TimelineState
    readonly: boolean
    ruler: Ruler | null
    channels: Array<Channel>
    timelineAnnotations: Array<TimelineAnnotation> = []
    layout: Layout

    maxChannelDepth: number

    cursor: Cursor
    timelineindex: Cursor

    // drawing options
    treeMargin: number = 5;
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
    constructor(rootElem: HTMLElement, state: TimelineState, layout: Layout, readonly=false) {
        this.rootElem = rootElem;
        this.state = state;
        this.layout = layout;
        this.readonly = readonly;

        // drawing options
        this.channelHeight = layout.channelHeight ?? 800;
        this.treeWidth = layout.treeWidth ?? 15;
        this.xscale = new LinearScale([0, this.width], [this.state.startTime, this.state.endTime]);

        this.treeSvg = this.initTree();
        this.panel = this.initPanel();
        this.timelineSvg = this.initTimeline();
        this.zoomHelper = this.initZoomHelper();
        this.ruler = this.initRuler();
        this.channels = this.initChannels();

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
            "timeline.createAnnotation": [],
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

    sortChannels() {
        this.channels.sort((lhs, rhs) => {
            let lhsDepth = lhs.depth();
            let rhsDepth = rhs.depth();
            if (lhsDepth < rhsDepth) {
                return lhs.idAtDepth(lhsDepth) - rhs.idAtDepth(lhsDepth);
            }
            return lhs.idAtDepth(rhsDepth) - rhs.idAtDepth(rhsDepth);
        });
        console.log(this.channels.map(c => c.state));
        this.channels.forEach((channel, i) => channel.panel.style.setProperty("order", `${i}`));
    }

    createChannel(state: ChannelState) {
        this.channels.push(new Channel(this, state, this.layout));
        this.state.channels.push(state);
        this.sortChannels();
        this.maxChannelDepth = Math.max(...this.channels.map(c => c.depth()));
    }

    updateChannel(state: ChannelState) {
        const channel = this.getChannel(state.id);
        const channelStateIdx = this.state.channels.map(c=>c.id).indexOf(state.id);
        if (channel === null || channelStateIdx == -1) return null;
        channel.state = state;
        this.state.channels[channelStateIdx] = state;
        this.sortChannels();
    }

    deleteChannel(channelId) {
        const channelIdx = this.channels.map(c=>c.state.id).indexOf(channelId);
        const channelStateIdx = this.state.channels.map(c=>c.id).indexOf(channelId);
        if (channelIdx == -1 || channelStateIdx == -1) return null;
        this.channels[channelIdx].delete();
        this.channels.splice(channelIdx, 1);
        this.state.channels.splice(channelStateIdx, 1);
        this.sortChannels();
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

    selectTimelineAnnotation(timelineAnnotationId) {
        this.timelineAnnotations.forEach(x => x.deselect());
        const timelineAnnotation = this.getTimelineAnnotation(timelineAnnotationId);
        timelineAnnotation.select();
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
        // @ts-ignore
        this.timelineSvg.on("click", (event, cb, context) => {
                this.events["timeline.click"].forEach(f => f(event));
        });
        //
        this.cursor.subscribeEvents();
        this.timelineindex.subscribeEvents();
        this.zoomHelper.addEventListener("zoomHelper.zoom", () => {
            if (this.ruler !== null)
                this.ruler.draw(true);
        });
        this.zoomHelper.addEventListener("zoomHelper.pan", () => {
            if (this.ruler !== null)
                this.ruler.draw(false);
        });
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

        // @ts-ignore
        this.xscale = new LinearScale([0, this.timelineSvg.width()], [this.state.startTime, this.state.endTime]);
    }

    resizeFullWidth() {
        // @ts-ignore
        const width = this.rootElem.clientWidth - this.treeSvg.width() - this.panel.clientWidth;
        // @ts-ignore
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
            // @ts-ignore
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
            // @ts-ignore
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

const timescales = {
    "milliseconds":     new LinearScale([0, 1000], [0, 1000], false),
    "halfcentiseconds": new LinearScale([0, 1000], [0, 500], false),
    "centiseconds":     new LinearScale([0, 1000], [0, 100], false),
    "halfdeciseconds":  new LinearScale([0, 1000], [0, 50], false),
    "deciseconds":      new LinearScale([0, 1000], [0, 10], false),
    "halfseconds":      new LinearScale([0, 1000], [0, 2], false),
    "seconds":          new LinearScale([0, 1000], [0, 1], false),
    "5seconds":         new LinearScale([0, 1000], [0, 1/5], false),
    "decaseconds":      new LinearScale([0, 1000], [0, 1/10], false),
    "30seconds":        new LinearScale([0, 1000], [0, 1/30], false),
    "minutes":          new LinearScale([0, 1000], [0, 1/60], false),
    "5minutes":          new LinearScale([0, 1000], [0, 1/300], false),
    "10minutes":        new LinearScale([0, 1000], [0, 1/600], false),
};

export class Ruler {

    timeline: Timeline;
    layout: Layout;

    height: number;
    y: number;

    // resize observer things
    resizeObserver?: ResizeObserver
    resize: boolean = true

    scaleName: String
    start: number = 0

    panel: HTMLDivElement = document.createElement("div")
    panelBorder: HTMLDivElement = document.createElement("div")
    ruler: Rect = new Rect()
    g: G
    ticks: Array<Line>
    labels: Array<Text>

    constructor(timeline: Timeline, layout: Layout) {
        this.timeline = timeline;
        this.layout = layout;
        this.y = 0;
        this.height = 25;

        this.g = this.timeline.timelineSvg.group().attr("class", "beholder-ruler");
        this.ruler = this.initRuler();
        this.scaleName = "unset";
        [this.ticks, this.labels] = this.initTicksAndLabels();
        this.panel = this.initPanel();

        this.draw();
    }

    initRuler() {
        const ruler = this.g
                          // @ts-ignore
                          .rect(this.timeline.timelineSvg.width(), this.height)
                          .addClass("beholder-ruler");
        return ruler;
    }

    findBestScale(): [LinearScale, String] {
        const milliseconds = this.timeline.state.endTime - this.timeline.state.startTime;
        const width = this.timeline.width * (this.timeline.width / this.timeline.timelineSvg.viewbox().width);
        const target = 10 / 1; // 10 pixels per tick
        let bestMatch = 100000000;
        let bestScale = timescales["milliseconds"];
        let scaleName = "milliseconds"
        Object.entries(timescales).forEach(([name, timescale]) => {
            const units = width / timescale.call(milliseconds);
            const match = Math.abs(units - target);
            if (match < bestMatch) {
                bestMatch = match;
                bestScale = timescale;
                scaleName = name;
            }
        });
        return [bestScale, scaleName];
    }

    initTicksAndLabels(): [Array<Line>, Array<Text>] {
        const ticks: Array<Line> = [];
        const labels: Array<Text> = [];
        return [ticks, labels];
    }

    initLabels() {
        const labels = [];
        return labels;
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

    displayTime() {

    }

    draw(zoom=false) {
        // set the size of the ruler box
        this.ruler.attr("y", this.y);
        this.ruler.attr("width", this.timeline.timelineSvg.width());
        this.ruler.attr("height", this.height);
        const labelHeight = 3*this.height / 7; // magic number. bad.
        // if the ruler box has changed height do this
        if (this.resize)
            this.panel.style.setProperty("height", `${this.height}px`);
        this.resize = true;
        /*
         * Ruler Drawing
         *
         *  We want to draw a tick every at unit increment. Every 5 we make a
         *  slightly longer tick. Every 10 we make an even longer notch.
         *
         * Epicycles: One first complication
         *  As the level of zoom changes, we will want to add more tick marks.
         *  To accomplish this, we use several different timescales.
         *  We want to draw X number of ticks per pixel (where X < 1).
         *  We choose the timescale which most closely allows us to do this.
         *
         * Epicycles: One second complication
         *  As the level of zoom changes, we need to transform the text elements
         *  otherwise they look weird. We scale them in the x direction. We also
         *  have to translate them along the x direction to keep them left
         *  aligned.
         *
         * Epicycles: One third complication
         *  The number of ticks grows exponentially as we zoom into the timeline.
         *  This means we can't draw all ticks. Rather we draw just enough to
         *  cover the viewport and then a little extra padding to save updates to
         *  svg elements.
         *
         *
         **/
        const [scale, scaleName] = this.findBestScale();
        let scaleChange = false
        if (this.scaleName != scaleName) {
            scaleChange = true;
            this.scaleName = scaleName;
        }
        const tickWidth = this.timeline.xscale.inv(scale.inv(1));
        let viewStart = this.timeline.zoomHelper.translate[0];
        let viewEnd = viewStart + this.timeline.width * this.timeline.zoomHelper.scale[0];
        let end = Math.min(
            viewEnd + (viewEnd - viewStart),
            this.timeline.xscale.inv(this.timeline.state.endTime)
        );
        // be lazy and don't draw if you can help it!
        if (!scaleChange && this.start <= viewStart && viewEnd <= end) {
            if (zoom && this.labels.length) {
                const labelWidth = this.labels[0].bbox().width;
                for (let i=0; i < this.labels.length; ++i) {
                    this.labels[i]
                        .transform({
                            scale: this.timeline.zoomHelper.scale,
                            translateX: (labelWidth*this.timeline.zoomHelper.scale[0] - labelWidth)/2
                        });
                }
            }
            return;
        }
        // do all the drawing!
        this.start = Math.max(
            viewStart - (viewEnd - viewStart),
            this.timeline.xscale.inv(this.timeline.state.startTime)
        );
        this.start += this.start % tickWidth;


        let iOffset = Math.floor(this.start / tickWidth);
        let k=0;
        for (let i=0, p=this.start; p < end || i < this.ticks.length; p+=tickWidth, ++i) {
            let height = this.height / 6;
            // Draw a label
            if ((i + iOffset) % 40 == 0) {
                let label;
                if (k >= this.labels.length) {
                    label = this.g
                                .text(new Date(this.timeline.xscale.call(p)).toISOString().slice(11,23))
                                .addClass("beholder-ruler-label")
                    this.labels.push(label);
                } else {
                    label = this.labels[k]
                                .text(new Date(this.timeline.xscale.call(p)).toISOString().slice(11,23));
                }
                const labelWidth = this.labels[0].bbox().width;
                label.move(p, labelHeight)
                     .transform({
                         scale: this.timeline.zoomHelper.scale,
                         translateX: (labelWidth*this.timeline.zoomHelper.scale[0] - labelWidth)/2
                     });
                ++k
            }
            if ((i + iOffset) % 10 == 0) {
                height = this.height / 2;
            } else if ((i + iOffset) % 5 == 0) {
                height = this.height / 3;
            }
            if (i >= this.ticks.length) {
                const tick = this.g
                                 .line(p, 0, p, height)
                                 .addClass("beholder-ruler-ticks");
                this.ticks.push(tick);
            } else {
                this.ticks[i].plot(p, 0, p, height);
            }
        }
    }
}

interface ChannelButtons {
    minimize: HTMLButtonElement,
    delete: HTMLButtonElement,
    addchild: HTMLButtonElement
};

let channelCounter = 0;

export class Channel {
    timeline: Timeline
    state: ChannelState
    parent: Channel | null
    // resize observer things
    resizeObserver?: ResizeObserver
    resize: boolean = true
    // drawn things
    minimized: boolean =  false
    oldHeight: number | null = null
    height: number
    y: number
    channel: Rect = new Rect()
    treePath: Polyline = new Polyline()
    panel: HTMLDivElement = document.createElement("div")
    panelBorder: HTMLDivElement = document.createElement("div")
    channelNameDiv: HTMLSpanElement = document.createElement("div")
    channelNameSpan: HTMLSpanElement = document.createElement("span")
    channelButtonsDiv: HTMLDivElement = document.createElement("div")
    channelButtons: ChannelButtons = Channel._createChannelButtons()

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
        // @ts-ignore
        const width = this.timeline.treeSvg.width()-2*this.timeline.treeMargin;
        const xoffsets = width / (this.timeline.maxChannelDepth + 2);
        let rx, ry, ny, lx: number;

        if (this.parent === null) {
            ry = 0;
            rx = this.timeline.treeMargin;
        }
        else {
            ry = this.parent.y + this.parent.height/2;
            rx = this.timeline.treeMargin + xoffsets*this.depth();
        }
        ny = this.y + this.height/2;
        // @ts-ignore
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
            addchild: document.createElement("button"),
        }
        channelButtons.minimize.innerText = "-";
        channelButtons.minimize.setAttribute("class", "beholder-minimize");
        channelButtons.delete.innerText = "x";
        channelButtons.delete.setAttribute("class", "beholder-delete");
        channelButtons.addchild.innerText = "c";
        channelButtons.addchild.setAttribute("class", "beholder-child");
        return channelButtons;
    }

    initPanel() {
        this.panel.setAttribute("class", "beholder-channel-panel-child");
        this.panelBorder.setAttribute("class", "beholder-channel-panel-child-child");

        this.timeline.panel.append(this.panel);
        this.panel.appendChild(this.panelBorder);
        this.panelBorder.append(this.channelButtonsDiv);
        this.panelBorder.append(this.channelNameDiv);
        this.channelNameDiv.append(this.channelNameSpan);
        this.channelNameSpan.innerText = this.state.name;

        Object.values(this.channelButtons)
              .forEach(v => this.channelButtonsDiv.append(v));

        if (this.timeline.readonly) {
            this.channelButtons.delete.disabled = true;
            this.channelButtons.addchild.disabled = true;
        }

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
                            // @ts-ignore
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

    idAtDepth(depth: number): number {
        if (this.depth() <= depth) return this.state.id;
        return this.parent.idAtDepth(depth);
    }

    //--------------------------------------------------------------------------

    /**
     * Handle events
     */
    subscribeEvents() {
        if (!this.timeline.readonly) {
            this.channelButtons.addchild.addEventListener("click", (event) => {
                this.timeline.events["timeline.createChannel"].forEach(f => {
                    const newState = deepCopy(this.state);
                    newState.id = Math.max(...this.timeline.channels.map(c => c.state.id)) + 1;
                    newState.parentId = this.state.id;
                    newState.name = `c(${newState.name})`;
                    f(newState);
                });
            });
        }
        this.channelButtons.minimize.addEventListener("click", (event) => {
            if (this.minimized && this.oldHeight !== null) {
                this.height = this.oldHeight;
                this.channelButtons.minimize.innerText = '-';
                this.minimized = false;
            } else if (!this.minimized) {
                this.oldHeight = this.height;
                this.height = 20;
                this.minimized = true;
                this.channelButtons.minimize.innerText = '+';
            }
            this.timeline.draw();
        })
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
    "annotation.drag": Array<(event: {oldState: TimelineAnnotationState, newState: TimelineAnnotationState}) => void>,
    "annotation.click": Array<(timelineAnnotationId: number) => void>
}

class TimelineAnnotation {
    state: TimelineAnnotationState
    timeline: Timeline
    selected: boolean = false

    g: G = new G()
    rect: Rect = new Rect()
    l: Line = new Line()
    r: Line = new Line()
    height: number = 0
    y: number = 0

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
            "annotation.drag": [],
            "annotation.click": []
        };
        this.subscribeEvents();
    }

    initInterval() {
        const g = this.timeline.timelineSvg.group().attr("class", "beholder-interval");
        if (this.timeline.readonly) {
            g.addClass("readonly");
        }
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
                // @ts-ignore
                this.dragstart(event)
            });
            this.l.on("mousedown", (event) => {
                this.draggedShape = "l";
                // @ts-ignore
                this.dragstart(event)
            });
            this.rect.on("mousedown", (event) => {
                this.draggedShape = "rect";
                // @ts-ignore
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
        if (! this.timeline.readonly) {
            this._bind_dragging(true);
        }
        this.g.on("click", (event) => {
            this.events["annotation.click"].forEach(f => f(this.state.id));
        });
    }

    _bind_dragging(on: boolean) {
        if (on) {
            this.r.on("mousedown", (event) => {
                this.draggedShape = "r";
                // @ts-ignore
                this.dragstart(event)
            });
            this.l.on("mousedown", (event) => {
                this.draggedShape = "l";
                // @ts-ignore
                this.dragstart(event)
            });
            this.rect.on("mousedown", (event) => {
                this.draggedShape = "rect";
                // @ts-ignore
                this.dragstart(event)
            });
        } else {
            this.r.off("mousedown");
            this.l.off("mousedown");
            this.rect.off("mousedown");
        }
    }

    dragstart(event: MouseEvent) {
        this.timeline.zoomHelper.disable();
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
        this.events["annotation.drag"].forEach(f => {
            if (this.dragStartState != null)
                f({oldState: this.dragStartState, newState: deepCopy(this.state)});
        });
        this.timeline.drawAnnotations();
    }

    dragend(event: MouseEvent) {
        this.timeline.zoomHelper.enable();
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

    deselect() {
        this.g.removeClass("selected");
        this.selected = false;
        this._bind_dragging(false);
    }

    select() {
        this.g.addClass("selected");
        this.selected = true;
        if (! this.timeline.readonly) {
            this._bind_dragging(true);
        }
    }
}
