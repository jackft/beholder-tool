import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { Cull } from '@pixi-essentials/cull';

import IntervalTree from 'node-interval-tree';

import { Annotator } from './annotator';
import { TimelineAnnotationState, ChannelState, TimelineState } from './state';
import * as base from './base';
import { Scale, LinearScale } from './scales';
import { deepCopy } from './utils';

const annotationColor = 0xc1c1c1;
const annotationHoverColor = 0xe1e1e1;
const annotationSelectColor = 0xf1f1f1;
const annotationBarColor = 0x2585cc;
const annotationSelectBarColor = 0x00ff00;
const annotationSelectBarColorSelected = 0xff0000;
const channelPanelWidth = 150;
const channelTreeWidth = 20;
const summaryHeight = 50;
const channelHeight = 25;

enum TimelinePointerRegionType {
    Ruler,
    Channel
}
enum MouseButton {
    Right,
    Left,
    None
}
enum SummaryPanelState {
    Time,
    Settings
}

class TimelineInteractionGroup {
    public timeline: Timeline
    public annotations: Array<base.TimelineAnnotation>

    constructor(timeline) {
        this.timeline = timeline;
        this.annotations = [];
    }
    //
    size() {
        return this.annotations.length;
    }
    //
    update(track: boolean): TimelineInteractionGroup {
        this.annotations.forEach(annotation => annotation.update(track));
        return this;
    }
    contains(annotation: base.TimelineAnnotation): boolean {
        const result = this.annotations.filter(
            _annotation => _annotation.state.id === annotation.state.id
        );
        return result.length > 0;
    }
    //
    add(annotation: base.TimelineAnnotation | Array<base.TimelineAnnotation>) {
        if (Array.isArray(annotation)) {
            annotation.forEach(_annotation => this.add(_annotation));
        } else {
            if (!this.contains(annotation)) {
                this.annotations.push(annotation);
            }
        }
        return this;
    }
    remove(annotation: base.TimelineAnnotation) {
        const idx = this.annotations.findIndex(x => x.state.id === annotation.state.id);
        this.annotations.splice(idx, 1);
        return this;
    }
    set(annotations: Array<base.TimelineAnnotation>) {
        this.annotations = annotations;
        return this;
    }
    clear() {
        this.annotations = [];
        return this;
    }
    filter(predicate: (value: base.TimelineAnnotation) => boolean): TimelineInteractionGroup {
        return (new TimelineInteractionGroup(this)).set(this.annotations.filter(predicate))
    }
    forEach(func: (value: base.TimelineAnnotation) => void): TimelineInteractionGroup {
        this.annotations.forEach(func);
        return this;
    }
    map(func: (value: base.TimelineAnnotation) => base.TimelineAnnotation): TimelineInteractionGroup {
        return new TimelineInteractionGroup(this).set(this.annotations.map(func));
    }
    //
    setChannel(channelId: number) {
        this.annotations.forEach(annotation => annotation.setChannel(channelId));
        return this;
    }
    move(timeMs: number): TimelineInteractionGroup {
        this.annotations.forEach(annotation => annotation.move(timeMs));
        return this;
    }
    moveEnd(timeMs: number): TimelineInteractionGroup {
        this.annotations.forEach(x => x.moveEnd(timeMs));
        return this;
    }
    moveStart(timeMs: number): TimelineInteractionGroup {
        this.annotations.forEach(x => x.moveStart(timeMs));
        return this;
    }
    shift(diffMs: number): TimelineInteractionGroup {
        this.annotations.forEach(annotation => annotation.shift(diffMs));
        return this;
    }
    shiftStart(diffMs: number): TimelineInteractionGroup {
        this.annotations.forEach(annotation => annotation.shiftStart(diffMs));
        return this;
    }
    shiftEnd(diffMs: number): TimelineInteractionGroup {
        this.annotations.forEach(annotation => annotation.shiftEnd(diffMs));
        return this;
    }
    select() {
        this.annotations.forEach(annotation => annotation.select());
        return this;
    }
    deselect() {
        this.annotations.forEach(annotation => annotation.deselect());
        return this;
    }
    // visual
    highlight() {
        this.annotations.forEach(annotation => annotation.highlight());
        return this;
    }
    dehighlight() {
        this.annotations.forEach(annotation => annotation.dehighlight());
        return this;
    }
    rescale() {
        this.annotations.forEach(annotation => annotation.rescale());
        return this;
    }
    draw() {
        this.annotations.forEach(annotation => annotation.draw());
        return this;
    }
    // events
    mouseDown(x: number, y: number) {
        this.annotations.forEach(annotation => annotation.mouseDown(x, y));
        return this;
    }
    mouseMove(x: number, y: number) {
        this.annotations.forEach(annotation => annotation.mouseMove(x, y));
        return this;
    }
    disableDrag() {
        this.annotations.forEach(annotation => annotation.disableDrag());
        return this;
    }
    enableDrag() {
        this.annotations.forEach(annotation => annotation.enableDrag());
        return this;
    }
    enableDragStart() {
        return this;
    }
    enableDragEnd() {
        this.annotations.forEach(annotation => annotation.enableDragEnd());
        return this;
    }
    shiftAnnotationForward() {
        this.annotations.forEach(annotation => annotation.shiftAnnotationForward());
        return this;
    }
    shiftAnnotationBackward() {
        this.annotations.forEach(annotation => annotation.shiftAnnotationBackward());
        return this;
    }
    cycleChannel(n) {
        this.annotations.forEach(annotation => annotation.cycleChannel(n));
        return this;
    }
    group() {
        const id = this.timeline.annotationGroupIdCounter++;
        this.annotations.forEach(annotation => annotation.setGroupId(id));
        return this;
    }
}

interface TimelineEvents {
    "deselectTimelineAnnotation": Array<(state: TimelineAnnotationState) => void>,
    "selectTimelineAnnotation": Array<(state: TimelineAnnotationState) => void>,
    "createTimelineAnnotation": Array<(state: TimelineAnnotationState, track: boolean) => void>,
    "deleteTimelineAnnotation": Array<(state: TimelineAnnotationState, track: boolean) => void>,
    "updateTimelineAnnotation": Array<(newState: TimelineAnnotationState, oldState: TimelineAnnotationState, track: boolean) => void>,
    "updateTime": Array<(timeMs: number) => void>

    "deleteChannel": Array<(state: ChannelState) => void>,
    "createChannel": Array<(state: ChannelState) => void>,
}

interface TimelineLike {
    xscale: Scale
    textContainer: PIXI.Container

    addChild(child: PIXI.DisplayObject): PIXI.DisplayObject
    width(): number
    height(): number
    leftInView(): number
    rightInView(): number
    widthInView(): number
    zoomFactor(): number

    resizeChannel(): void
}

interface TimelinOptions {
    backgroundColor: number
}

const defaultMainCanvasOpts = {
    backgroundColor: 0x1e1e1e,
    resolution: window.devicePixelRatio || 1,
    autoDensity: true,
}

export class Timeline implements TimelineLike {
    // definitional attributes
    public annotator: Annotator
    public channels: Array<Channel>
    public annotations: { [key: number]: TimelineAnnotation }
    public summary: Summary
    public ruler: Ruler
    public xscale: LinearScale;
    public events: TimelineEvents;

    // interaction
    public newTimelineAnnotationGroup = new TimelineInteractionGroup(this);
    public selectionGroup = new TimelineInteractionGroup(this);
    public draggingGroup = new TimelineInteractionGroup(this);
    public hoverGroup = new TimelineInteractionGroup(this);
    public indexGroup = new TimelineInteractionGroup(this);
    public cursorGroup = new TimelineInteractionGroup(this);

    public auxiliaryUpdateGroup = new TimelineInteractionGroup(this);
    // mouse button
    private mouseButtonDown: MouseButton = MouseButton.None
    private showingAnnotationText: boolean = false;
    private rulerDrag: boolean = false;
    private resizeDirty: boolean = false;


    private mouseDownX: number = -1;
    private mouseDownY: number = -1;

    private channelIdCounter: number;
    private annotationIdCounter: number;
    public annotationGroupIdCounter: number;
    private insertEnabled: boolean = false;
    private multiSelectEnabled: boolean = false;

    private viewportTrackingCursor: boolean = false;

    //
    public maxChannelDepth: number = 0;

    // view attributes
    public timelineElement: HTMLDivElement
    public controlsContainer: HTMLDivElement
    public controls: HTMLDivElement
    public channelTree: HTMLCanvasElement
    public channelPanel: HTMLDivElement
    public timelineMainContainer: HTMLDivElement
    public timelineMain: HTMLDivElement
    public mainCanvas: HTMLCanvasElement


    public timelineApp: PIXI.Application
    public renderer: PIXI.Renderer | PIXI.AbstractRenderer
    public viewport: Viewport
    public channelContainer: PIXI.Container
    public annotationEndContainer: PIXI.Container
    public annotationContainer: PIXI.ParticleContainer
    public channelTreeApp: PIXI.Application
    public channelTreeContainer: PIXI.Container
    public textContainer: PIXI.Container
    private cull: Cull
    private mouseCursor: Cursor
    private indexCursor: Cursor


    private cullDirty: boolean;

    constructor(annotator: Annotator, container: HTMLDivElement, start: number, end: number, opts: TimelinOptions) {
        this.annotator = annotator;
        const mainTimelineWidth = container.getBoundingClientRect().width - channelTreeWidth - channelPanelWidth;
        const mainTimelineHeight = 150;

        this.xscale = new LinearScale([0, mainTimelineWidth], [start, end]);
        // helper attributes

        this.events = {
            "deselectTimelineAnnotation": [],
            "createTimelineAnnotation": [],
            "deleteTimelineAnnotation": [],
            "selectTimelineAnnotation": [],
            "updateTimelineAnnotation": [],
            "updateTime": [],
            "deleteChannel": [],
            "createChannel": [],
        }

        //-----------------------------
        // Start Create DOM
        //-----------------------------

        // view attributes
        //
        // <div class='beholder-timeline'>
        //    <div class='beholder-timeline-controls-container'>
        //      <div class='beholder-controls'></div>
        //      <div class='beholder-controls'>
        //          <canvas class='beholder-channel-tree'/>
        //          <div class='beholder-channel-panel'></div>
        //      </div>
        //    <div>
        //    <div class='beholder-timeline-main-container'>
        //      <div class='beholder-timeline-main'></div>
        //      <div class='beholder-timeline-main'></div>
        //    <div>
        //    <div class='beholder-summary-container'></div>
        //    <div class='beholder-timeline-container'>
        //    </div>
        // </div>
        this.timelineElement = container;
        this.timelineElement.classList.add("beholder-timeline");

        this.controlsContainer = document.createElement("div");
        this.controlsContainer.setAttribute("class", "beholder-channel-controls-container");
        this.timelineElement.appendChild(this.controlsContainer);

        const summaryControls = document.createElement("div");
        summaryControls.setAttribute("class", "beholder-channel-controls");
        this.controlsContainer.appendChild(summaryControls);

        this.controls = document.createElement("div");
        this.controls.setAttribute("class", "beholder-channel-controls");
        this.controlsContainer.appendChild(this.controls);

        this.channelTree = document.createElement("canvas");
        this.channelTree.setAttribute("class", "beholder-channel-tree");
        this.channelTree.style.width = `${channelTreeWidth}px`;
        this.controls.appendChild(this.channelTree);

        this.channelPanel = document.createElement("div");
        this.channelPanel.setAttribute("class", "beholder-channel-panel-container");
        this.controls.appendChild(this.channelPanel);

        //
        this.timelineMainContainer = document.createElement("div");
        this.timelineMainContainer.setAttribute("class", "beholder-main-container");
        this.timelineElement.appendChild(this.timelineMainContainer);

        const summaryMainContainer = document.createElement("div");
        summaryMainContainer.setAttribute("class", "beholder-main");
        this.timelineMainContainer.appendChild(summaryMainContainer);

        this.timelineMain = document.createElement("div");
        this.timelineMain.setAttribute("class", "beholder-main");
        this.timelineMainContainer.appendChild(this.timelineMain);

        this.mainCanvas = document.createElement("canvas");
        this.mainCanvas.setAttribute("class", "beholder-timeline-canvas");
        this.timelineMain.appendChild(this.mainCanvas);

        //-----------------------------
        // End Create DOM
        //-----------------------------
        const mainCanvasOpts = deepCopy(defaultMainCanvasOpts);
        Object.keys(opts).forEach(key => {
            mainCanvasOpts[key] = opts[key];
        });
        mainCanvasOpts["view"] = this.mainCanvas;
        mainCanvasOpts["width"] = mainTimelineWidth;
        mainCanvasOpts["height"] = mainTimelineHeight;

        this.timelineApp = new PIXI.Application(mainCanvasOpts);
        this.renderer = this.timelineApp.renderer;
        this.viewport = new Viewport({
            screenWidth: mainTimelineWidth,
            screenHeight: mainTimelineHeight,
            worldWidth: mainTimelineWidth,
            worldHeight: mainTimelineHeight,
            interaction: this.timelineApp.renderer.plugins.interaction // the interaction module is important for wheel to work properly when renderer.view is placed or scaled
        }).drag({ direction: 'x', mouseButtons: 'all' })
          .pinch({ axis: 'x' })
          .wheel({ axis: 'x' })
          .clamp({ direction: 'x' })
          .clampZoom({ minScale: 1 });

        this.annotationEndContainer = new PIXI.ParticleContainer(100000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: true
        });
        this.channelContainer = new PIXI.Container();
        this.annotationContainer = new PIXI.ParticleContainer(100000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: true
        });
        this.annotationContainer.width = mainTimelineWidth;
        this.annotationContainer.height = mainTimelineHeight;
        this.textContainer = new PIXI.Container();

        this.cull = new Cull().addAll(this.viewport.children);
        this.cullDirty = false;

        this.timelineApp.stage.addChild(this.viewport);
        this.viewport.addChild(this.channelContainer);
        this.viewport.addChild(this.annotationContainer);
        this.viewport.addChild(this.annotationEndContainer);
        this.viewport.addChild(this.textContainer);


        this.timelineApp.stage.interactive = true;
        this.annotationEndContainer.interactive = false;
        this.annotationContainer.interactive = false;

        this.mouseCursor = new Cursor(this, 0, 0xffffff);
        this.indexCursor = new Cursor(this, 0, 0xff0000);

        this.channelTreeApp = new PIXI.Application({
            view: this.channelTree,
            resolution: window.devicePixelRatio || 1,
            autoDensity: true,
            backgroundColor: 0x1e1e1e,
            width: this.channelTree.getBoundingClientRect().width,
            height: this.channelTree.getBoundingClientRect().height
        });
        this.channelTreeContainer = new PIXI.Container();
        this.channelTreeApp.stage.addChild(this.channelTreeContainer);

        // definitional attributes
        this.channels = [];
        this.annotations = {};
        this.ruler = new Ruler(this);
        this.summary = new Summary(summaryControls, summaryMainContainer, this, mainCanvasOpts);
        // helper attributes
        this.channelIdCounter = 0;
        this.annotationIdCounter = 0;
        this.annotationGroupIdCounter = 0;

        this._bindEvents();

        setTimeout(() => this._onMoved(), 1000);
    }

    readState(state: TimelineState) {
        this.xscale = new LinearScale(this.xscale.domain, [state.startTime, state.endTime]);
        this.ruler.draw();
    }

    //-------------------------------------------------------------------------
    // Stateful
    //-------------------------------------------------------------------------
    createChannel(state: ChannelState) {
        const channel = new Channel(state, this);
        this.channels.push(channel);
        this.reOrderChannels();
        if (channel.bottom() > +this.timelineApp.view.style.height) {
            this.timelineApp.view.style.height = `${Math.max(...this.channels.map(channel => channel.bottom()))}`;
        }
        this._onResize();
        //
        this.channelIdCounter = Math.max(this.channelIdCounter, state.id + 1);
        this.maxChannelDepth = Math.max(this.maxChannelDepth, channel.depth());
    }
    deleteChannel(state: ChannelState) {
        const channel = this.findChannelById(state.id);
        if (channel === undefined) return;
        channel.delete();
        const idx = this.channels.findIndex(x => x.state.id === channel.state.id);
        this.channels.splice(idx, 1);
        this.resizeChannel();
    }
    createTimelineAnnotation(state: TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        const annotation = new TimelineAnnotation(state, this, channel);
        this.annotations[state.id] = annotation;
        channel.insertAnnotation(state);
        this.summary.createTimelineAnnotation(annotation.state);
        this.annotationIdCounter = Math.max(this.annotationIdCounter, state.id + 1);
        annotation.rescale().draw();
        return annotation;
    }
    updateTimelineAnnotation(newState: TimelineAnnotationState): boolean {
        const annotation = this.annotations[newState.id];
        const oldState = annotation.state;
        const newChannel = this.findChannelById(newState.channelId);
        const oldChannel = this.findChannelById(oldState.channelId);
        if (newChannel === undefined || oldChannel === undefined) return false;
        if (!oldChannel.removeAnnotation(oldState)) {
            console.warn("no remove", oldChannel);
        }
        newChannel.insertAnnotation(newState);
        annotation.channel = newChannel;
        this.summary.updateTimelineAnnotation(newState);
        annotation.state = newState;
        annotation.draw();
        return true
    }
    deleteTimelineAnnotation(state: TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        const annotation = this.annotations[state.id];
        this.selectionGroup.remove(annotation)
        this.draggingGroup.remove(annotation)
        this.hoverGroup.remove(annotation)
        this.cursorGroup.remove(annotation)
        this.indexGroup.remove(annotation)
        if (!channel.removeAnnotation(state)) {
            console.warn("couldn't remove", state);
        }
        this.summary.removeTimelineAnnotation(state);
        annotation.delete();
        delete this.annotations[state.id];
    }
    selectTimelineAnnotation(state: TimelineAnnotationState) {
        this.summary.selectTimelineAnnotation(state);
        this.selectionGroup.add(this.annotations[state.id])
            .select();
    }
    deselectTimelineAnnotation(state: TimelineAnnotationState) {
        this.summary.deselectTimelineAnnotation(state);
        this.selectionGroup.remove(this.annotations[state.id])
        this.annotations[state.id].deselect();
    }

    shiftAnnotationForward() {
        this.selectionGroup.shiftAnnotationForward()
            .update(true);
        this.auxiliaryUpdateGroup
            .update(true)
            .clear();
        return this;
    }
    shiftAnnotationBackward() {
        this.selectionGroup.shiftAnnotationBackward()
            .update(true);
        this.auxiliaryUpdateGroup
            .update(true)
            .clear();
        return this;
    }
    cycleChannel(n=1) {
        this.selectionGroup
            .cycleChannel(n)
            .update(true);
    }

    groupSelectedAnnotations() {
        this.selectionGroup
            .group()
            .update(true);
    }

    timeUpdate(milliseconds: number) {
        this.indexCursor.updateTime(milliseconds);
        this.summary.indexCursor.updateTime(milliseconds);
        const x = this.xscale.inv(milliseconds);
        if (!this.isInView(x)) {
            this.viewportTrackingCursor = true;
        }
        if (this.viewportTrackingCursor) {
            this.viewport.moveCenter(x, this.viewport.center.y);
            this._onMoved();
        }
    }


    //-------------------------------------------------------------------------
    // Helper
    //-------------------------------------------------------------------------

    likelyNumberOfAnnotationsInView() { return (Object.values(this.annotations).length * (this.widthInView() / this.width())) }
    leftInView() { return this.viewport.left }
    rightInView() { return this.viewport.right }
    isInView(x: number) { return this.leftInView() <= x && x <= this.rightInView() }
    widthInView() { return this.rightInView() - this.leftInView() }
    zoomFactor() { return this.viewport.scale.x }
    width() { return this.viewport.width }
    height() { return this.viewport.height }
    start() { return this.xscale.range[0]; }
    end() { return this.xscale.range[1]; }
    pixel2time(x: number) { return this.xscale.call(x) }
    time2pixel(timeMs: number) { return this.xscale.inv(timeMs) }

    newChannelId() { return this.channelIdCounter++ }
    newAnnotationId() { return this.annotationIdCounter++ }
    newGroupAnnotationId() { return this.annotationGroupIdCounter++ }

    addChild(child: PIXI.DisplayObject) { return this.viewport.addChild(child) }

    findTimelineAnnotations(x: number, y: number): TimelineAnnotation[] {
        const channel = this.findChannel(x, y);
        if (channel === undefined) return [];
        return channel.findTimelineAnnotations(x, y);
    }

    findChannel(x: number, y: number): Channel | undefined {
        return this.channels.find((channel: Channel) => {
            return channel.top() <= y && y <= channel.bottom()
        });
    }

    findChannelById(id: number): Channel | undefined {
        return this.channels.find((channel: Channel) => {
            return channel.state.id === id;
        });
    }

    //-------------------------------------------------------------------------
    // View
    //-------------------------------------------------------------------------

    changeCursor(style: string) {
        this.timelineApp.view.style.cursor = style;
    }


    resizeChannel() {
        let y = this.ruler.bottom;
        for (let _channel of this.channels) {
            _channel.y = y
            y = _channel.bottom();
            _channel.draw();
        }
        Object.values(this.annotations).forEach(a => a.draw());
        this.resizeDirty = true;
    }

    reOrderChannels() {
        this.channels.sort((lhs, rhs) => {
            if (lhs.idAtDepth(0) !== rhs.idAtDepth(0)) return lhs.idAtDepth(0) - rhs.idAtDepth(0);
            let lhsDepth = lhs.depth();
            let rhsDepth = rhs.depth();
            if (lhsDepth < rhsDepth) {
                return lhs.idAtDepth(lhsDepth) - rhs.idAtDepth(lhsDepth);
            }
            return lhs.idAtDepth(rhsDepth) - rhs.idAtDepth(rhsDepth);
        });
        this.channels.forEach((channel, i) => channel.panel.rootElem.style.setProperty("order", `${i}`));
    }


    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------

    dispatch(name, ...args) {
        this.events[name].forEach(f => f(...args));
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

    _bindEvents() {
        this.viewport.on("zoomed", this._onZoomed, this);
        this.viewport.on("moved", this._onMoved, this);
        this.viewport.on("frame-end", this._onFrameEnd, this);
        this.viewport.on("mousedown", this._onLeftDown, this);
        this.viewport.on("rightdown", this._onRightDown, this);
        this.viewport.on("pointermove", this._onPointerMove, this);
        this.viewport.on("pointerup", this._onPointerUp, this);
        this.timelineApp.view.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
        this.timelineApp.view.addEventListener("wheel", (event) => {
            event.preventDefault();
        });
        document.addEventListener("mouseup", () => {
            if (this.resizeDirty) {
                this._onResize();
            }
        });
        document.addEventListener("keydown", (event) => {
            if (event.key === "Control" || event.ctrlKey) {
                this.insertEnabled = true;
                this._changeCursor(-1, -1);
            }
            if (event.key === "Shift" || event.ctrlKey) {
                this.multiSelectEnabled = true;
            }
        });
        window.addEventListener("keyup", (event) => {
            if (event.key === "Control") {
                this.insertEnabled = false;
                this.multiSelectEnabled = false;
                this._changeCursor(-1, -1);
            }
            if (event.key === "Shift" || event.ctrlKey) {
                this.multiSelectEnabled = false;
            }
        });
    }
    _onZoomed() {
        if (this.selectionGroup.size() > 0) {
            this.selectionGroup.rescale()
                .draw();
        }
        if (this.hoverGroup.size() > 0) {
            this.hoverGroup.rescale()
                .draw();
        }
        this.mouseCursor.rescale()
        this.indexCursor.rescale()
    }
    _onMoved() {
        this.ruler.zoomScale(this.viewport.scale.x);
        this.summary.draw();
        this.channels.forEach(c => c.zoomPan());

        const showAllAnnotations = this.likelyNumberOfAnnotationsInView() < 5000;
        if (!showAllAnnotations) {
            if (this.showingAnnotationText) {
                Object.values(this.annotations).forEach(annotation => { annotation.hideText() });
                this.showingAnnotationText = false;
            }
        } else {
            Object.values(this.annotations).forEach(annotation => {
                if (!this.showingAnnotationText) {
                    annotation.showText();
                }
                annotation.rescale().draw();
            });
            this.showingAnnotationText = true;
        }
    }
    _onFrameEnd() {
        // needed for fast zoom & pan
        if (this.viewport.dirty || this.cullDirty) {
            this.cull.cull(this.renderer.screen);
            this.viewport.dirty = false;
            this.cullDirty = false;
        }
    }
    _pointerRegionType(x: number, y: number) {
        if (this._isOnRuler(y)) {
            return TimelinePointerRegionType.Ruler;
        }
        return TimelinePointerRegionType.Channel;
    }
    _onLeftDown(event: PIXI.InteractionEvent) {
        this.mouseButtonDown = MouseButton.Left;
        this._onPointerDown(event);
    }
    _onRightDown(event: PIXI.InteractionEvent) {
        this.mouseButtonDown = MouseButton.Right;
        this._onPointerDown(event);
    }
    _onPointerDown(event: PIXI.InteractionEvent) {
        const x = this._rectifyX(event.data.global.x);
        const y = event.data.global.y;
        const annotations = this.findTimelineAnnotations(x, y);
        const timelinePointerRegionType = this._pointerRegionType(x, y);
        if (timelinePointerRegionType === TimelinePointerRegionType.Ruler) {
            this._handleRulerPointerDown(x, y);
        } else if (this.insertEnabled) {
            this._handlePointerDownCreateTimelineAnnotation(x, y);
        } else {
            this._handlePointerDownSelectTimelineAnnotation(x, y, annotations);
        }
        if (this.mouseButtonDown === MouseButton.Left) {
            this._indexmove(x, y);
        }
        this.mouseDownX = x;
        this.mouseDownY = y;
        this._changeCursor(x, y);
        this.viewportTrackingCursor = false;
    }
    _handleRulerPointerDown(x: number, y: number) {
        this.rulerDrag = true;
        this.viewport.drag(undefined);
    }
    _handlePointerDownCreateTimelineAnnotation(x: number, y: number) {
        const channel = this.findChannel(x, y);
        if (channel === undefined) return;
        let timeMs = this.pixel2time(x);
        const channels = [channel].concat(channel.descendents());

        // Here we handle the creation of a new group.
        // 1. Find all selected annotations which currently have the ends selected
        // 2. Sort them by which one is closest to the x-down point
        // 3. Use the closest one
        let closest = this.selectionGroup
                            .annotations
                            .filter(annotation => {
                                if (annotation.channel.state.id !== channel.state.id) return false;
                                if (annotation.selectedStart && timeMs < annotation.state.startTime) return true;
                                if (annotation.selectedEnd && annotation.state.endTime < timeMs) return true;
                                return false;
                            })
                            .sort((annotationLHS, annotationRHS) => {
                                let distanceLHS = annotationLHS.selectedStart
                                                ? annotationLHS.state.startTime
                                                : annotationLHS.state.endTime
                                distanceLHS = (distanceLHS - timeMs)**2
                                let distanceRHS = annotationLHS.selectedStart
                                                ? annotationRHS.state.startTime
                                                : annotationRHS.state.endTime
                                distanceRHS = (distanceLHS - timeMs)**2
                                return distanceLHS - distanceRHS;
                            });
        let groupId: number | null = null;
        let prevAnnotationId: number | null = null;
        let nextAnnotationId: number | null = null;
        if (closest.length > 0) {
            const groupAnnotation = closest[0];
            if (groupAnnotation.state.groupId !== null && groupAnnotation.state.groupId !== undefined) {
                groupId = groupAnnotation.state.groupId;
            } else {
                groupId = this.newGroupAnnotationId();
                groupAnnotation.newState.groupId = groupId;
            }
            if (groupAnnotation.selectedStart) {
                nextAnnotationId = groupAnnotation.state.id;
                timeMs = groupAnnotation.newState.startTime;
            }
            if (groupAnnotation.selectedEnd) {
                prevAnnotationId = groupAnnotation.state.id;
                timeMs = groupAnnotation.newState.endTime;
            }
        }

        // create
        channels.forEach(channel => {
            const state = {
                id: this.newAnnotationId(),
                channelId: channel.state.id,
                groupId: groupId,
                prevAnnotationId: prevAnnotationId,
                nextAnnotationId: nextAnnotationId,
                startFrame: 0,
                startTime: timeMs,
                endFrame: 0,
                endTime: timeMs,
                type: "interval",
                value: "",
                modifiers: []
            };
            const annotation = this.createTimelineAnnotation(state);
            if (annotation === undefined) return;
            this.newTimelineAnnotationGroup.add(annotation);

            if (prevAnnotationId !== null && prevAnnotationId !== undefined) {
                this.annotations[prevAnnotationId].newState.nextAnnotationId = state.id;
                this.annotations[prevAnnotationId].update(false);
            }
            if (nextAnnotationId !== null && nextAnnotationId !== undefined) {
                this.annotations[nextAnnotationId].newState.prevAnnotationId = state.id;
                this.annotations[nextAnnotationId].update(false);
            }
        });
        this.newTimelineAnnotationGroup.rescale()
            .enableDragEnd()
            .select()
            .draw();
        this.viewport.drag(undefined);
    }
    _handlePointerDownSelectTimelineAnnotation(x: number, y: number, annotations: Array<TimelineAnnotation>) {
        if (annotations.length === 0) {
            this.selectionGroup.map(x=>x).forEach((annotation) => this.dispatch("deselectTimelineAnnotation", annotation.state))
                .clear();
            this.draggingGroup.map(x=>x).forEach((annotation) => this.dispatch("deselectTimelineAnnotation", annotation.state))
                .clear();
            return;
        };
        if (!this.multiSelectEnabled) {
            this.selectionGroup.map(x=>x).forEach((annotation) => this.dispatch("deselectTimelineAnnotation", annotation.state))
                .clear();
            this.draggingGroup.map(x=>x).forEach((annotation) => this.dispatch("deselectTimelineAnnotation", annotation.state))
                .clear();
        }
        this.draggingGroup
            .set(this.selectionGroup.annotations)
            .add(annotations[0])
            .select()
            .forEach((annotation) => this.dispatch("selectTimelineAnnotation", annotation.state))
            .mouseDown(x, y);
        this.viewport.drag(undefined);
    }

    _onPointerMove(event: PIXI.InteractionEvent) {
        const x = this._rectifyX(event.data.global.x);
        const y = event.data.global.y;
        const annotations = this.findTimelineAnnotations(x, y);
        this._cursormove(x, y, annotations);
        this._drag(x, y);
        this._hover(x, y, annotations);
        this._changeCursor(x, y);
        if (this.rulerDrag || this.mouseButtonDown === MouseButton.Left) {
            this._indexmove(x, y);
        }
    }
    _cursormove(x: number, y: number, annotations: TimelineAnnotation[]) {
        this.mouseCursor.updateTime(this.pixel2time(x));
    }
    _indexmove(x: number, y: number) {
        const timeMs = this.xscale.call(x);
        this.events.updateTime.forEach(f => f(timeMs));
        this.indexCursor.updateTime(timeMs);
        this.summary.indexCursor.updateTime(timeMs);
    }
    _drag(x: number, y: number) {
        if (this.mouseButtonDown === MouseButton.None) return;
        const diffMs = this.pixel2time(x - this.mouseDownX);
        const timeMs = this.pixel2time(x);
        const channel = this.findChannel(x, y);
        if (channel === undefined) return;
        if (this.draggingGroup.filter((annotation) => annotation.draggedEnd).size() > 0) {
            this.draggingGroup.moveEnd(timeMs);
        } else if (this.draggingGroup.filter((annotation) => annotation.draggedStart).size() > 0) {
            this.draggingGroup.moveStart(timeMs);
        } else {
            this.draggingGroup.filter((annotation) => annotation.dragged && !(annotation.draggedStart || annotation.draggedEnd))
                .setChannel(channel.state.id)
                .shift(diffMs);
        }
        this.draggingGroup.update(false)
            .draw();
        this.newTimelineAnnotationGroup.moveEnd(timeMs)
            .update(false)
            .draw();
        this.auxiliaryUpdateGroup
            .update(false);
        this.viewportTrackingCursor = false;
    }
    _hover(x: number, y: number, annotations: TimelineAnnotation[]) {
        this.hoverGroup
            .dehighlight()
            .rescale()
            .mouseMove(x, y)
            .draw()
            .clear()
            .add(annotations)
            .highlight()
            .mouseMove(x, y)
            .rescale()
            .draw();
    }
    _onPointerUp(event: PIXI.InteractionEvent) {
        this.stopDrag();
        const x = this._rectifyX(event.data.global.x)
        const y = event.data.global.y
        this._changeCursor(x, y);
        this.mouseDownX = -1;
        this.mouseDownY = -1;
    }
    stopDrag() {
        if (this.newTimelineAnnotationGroup.size() > 0) {
            this.selectionGroup
                .deselect()
                .clear();
        } else {
            this.selectionGroup
                .clear()
                .set(this.draggingGroup.annotations);
        }
        this.draggingGroup
            .update(true)
            .disableDrag()
            .clear();
        this.newTimelineAnnotationGroup
            .disableDrag()
            .forEach(annotation => this.dispatch("deleteTimelineAnnotation", annotation.state, false))
            .forEach(annotation => this.dispatch("createTimelineAnnotation", annotation.state, true))
            .clear();
        this.auxiliaryUpdateGroup
            .update(true)
            .clear();
        this.rulerDrag = false;
        this.mouseButtonDown = MouseButton.None;
        this.summary.stopDrag();
        this.viewport.drag({ direction: 'x', mouseButtons: 'all' });
    }
    _onResize() {
        const height = this.ruler.height + this.channels.reduce((acc, c) => acc + c.height, 0);
        this.timelineApp.view.style.height = `${height}px`;
        this.renderer.view.height = height * this.renderer.resolution;
        this.renderer.screen.height = height * this.renderer.resolution;
        this.viewport.screenHeight = height * this.renderer.resolution;
        this.channelTreeApp.view.style.height = `${height}px`;
        this.channelTreeApp.renderer.view.height = height * this.channelTreeApp.renderer.resolution;
        this.channelTreeApp.renderer.screen.height = height * this.channelTreeApp.renderer.resolution;
        this.mouseCursor.resize();
        this.indexCursor.resize();
        this.resizeDirty = false;
    }
    _changeCursor(x: number, y: number) {
        if (this.draggingGroup.size() > 0) {
            // @ts-ignore
            if (this.draggingGroup.filter(annotation => annotation.draggedStart).size() > 0) {
                this.changeCursor("w-resize");
            } else if (this.draggingGroup.filter(annotation => annotation.draggedEnd).size() > 0) {
                this.changeCursor("e-resize");
            } else {
                this.changeCursor("grabbing");
            }
            return;
        }
        if (this.rulerDrag) {
            this.changeCursor("text");
            return;
        }
        if (this.insertEnabled) {
            this.changeCursor("crosshair");
            return;
        }
        if (this.hoverGroup.size() > 0) {
            if (this.hoverGroup.filter(annotation => annotation.startHovered).size() > 0) {
                this.changeCursor("w-resize");
            } else if (this.hoverGroup.filter(annotation => annotation.endHovered).size() > 0) {
                this.changeCursor("e-resize");
            } else if (this.hoverGroup.filter(annotation => annotation.selected).size() > 0) {
                this.changeCursor("grab");
            } else {
                this.changeCursor("pointer");
            }
            return;
        }
        if (this._isOnRuler(y)) {
            this.changeCursor("text");
            return;
        }
        if (this.mouseButtonDown !== MouseButton.None) {
            this.changeCursor("all-scroll");
            return;
        }
        this.changeCursor("default");
    }

    _rectifyX(x: number) {
        return this.viewport.left + x / this.viewport.scale.x;
    }
    _isOnRuler(y: number) {
        return this.ruler.top <= y && y <= this.ruler.bottom;
    }
}

export class Summary implements TimelineLike {
    // definitional attributes
    public app: PIXI.Application
    public timeline: Timeline
    public ruler: Ruler
    public xscale: Scale
    // helper attributes
    private mouseDownX: number = -1
    private mouseDownY: number = -1
    private targetMouseDownX: number = -1;
    private targetMouseDownY: number = -1;
    private dragging: boolean = false;
    private rulerDrag: boolean = false;

    // view
    public indexCursor: Cursor
    private annotationContainer: PIXI.ParticleContainer
    private tickContainer: PIXI.ParticleContainer
    public textContainer: PIXI.Container
    private window: PIXI.Graphics
    private border: PIXI.Graphics
    private annotations: { [key: number]: PIXI.Sprite }
    // control panel
    private panel: HTMLDivElement = document.createElement("div");
    private panelLeft: HTMLDivElement = document.createElement("div");
    private timeButton: HTMLButtonElement = document.createElement("button");
    private settingsButton: HTMLButtonElement = document.createElement("button");
    private timePanelRight: HTMLDivElement = document.createElement("div");
    private timeInput: HTMLInputElement = document.createElement("input");
    private settingsPanelRight: HTMLDivElement = document.createElement("div");
    private lockInput: HTMLButtonElement = document.createElement("button");
    private panelState: SummaryPanelState = SummaryPanelState.Time;

    constructor(summaryControls: HTMLDivElement, summaryMainContainer: HTMLDivElement, timeline: Timeline, opts: PIXI.IApplicationOptions) {
        this.timeline = timeline;
        this.xscale = timeline.xscale;
        // view
        // <div>
        //   <div class='controls'>
        //     <div class="beholder-summary-panel">
        //       <div class="beholder-summary-panel-left"></div>
        //       <div class="beholder-summary-panel-right"></div>
        //     </div>
        //   </div>
        //   <div class='main'>
        //     <canvas/>
        //   </div>
        // </div>
        this.initPanel();
        this.setTimePanel();
        summaryControls.appendChild(this.panel);

        const canvas = document.createElement("canvas");
        summaryMainContainer.appendChild(canvas);

        //
        opts.view = canvas;
        opts.width = this.timeline.timelineApp.view.getBoundingClientRect().width;
        opts.height = summaryHeight;

        const renderer = new PIXI.Renderer();

        this.app = new PIXI.Application(opts);
        //
        this.indexCursor = new Cursor(this, 0, 0xff0000);
        this.annotationContainer = new PIXI.ParticleContainer(50000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: true,
            alpha: true
        });
        this.app.stage.addChild(this.annotationContainer);
        this.annotationContainer.interactive = false;
        this.annotationContainer.interactiveChildren = false;
        this.tickContainer = new PIXI.ParticleContainer(1000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: false
        });
        this.tickContainer.width = this.timeline.timelineApp.view.width;
        this.tickContainer.height = summaryHeight;
        this.app.stage.addChild(this.tickContainer);
        this.tickContainer.interactive = false;
        this.tickContainer.interactiveChildren = false;
        this.textContainer = new PIXI.Container();
        this.app.stage.addChild(this.textContainer);

        this.window = new PIXI.Graphics();
        this.window.interactive = true;
        this.app.stage.interactive = true;
        this.border = new PIXI.Graphics();
        this.ruler = new Ruler(this);
        this.annotations = {};
        this.initView();

        this._bindEvents();

    }

    //-------------------------------------------------------------------------
    // Stateful
    //-------------------------------------------------------------------------

    createTimelineAnnotation(annotation: TimelineAnnotationState) {
        const annotationMarker = PIXI.Sprite.from(PIXI.Texture.WHITE);
        const start = this.timeline.xscale.inv(annotation.startTime);
        const end = this.timeline.xscale.inv(annotation.endTime);
        annotationMarker.x = start;
        annotationMarker.y = 25;
        annotationMarker.width = Math.max(1, end - start);
        annotationMarker.height = 100 / 8;
        annotationMarker.alpha = 0.1;
        this.annotationContainer.addChild(annotationMarker);
        this.annotations[annotation.id] = annotationMarker;
    }
    removeTimelineAnnotation(annotation: TimelineAnnotationState) {
        this.annotations[annotation.id].destroy();
        delete this.annotations[annotation.id];
    }

    selectTimelineAnnotation(annotation: TimelineAnnotationState) {
        this.annotations[annotation.id].tint = 0xff0000;
        this.annotations[annotation.id].alpha = 0.5;
    }
    deselectTimelineAnnotation(annotation: TimelineAnnotationState) {
        this.annotations[annotation.id].tint = annotationColor;
        this.annotations[annotation.id].alpha = 0.1;
    }
    updateTimelineAnnotation(annotation: TimelineAnnotationState) {
        const start = this.timeline.xscale.inv(annotation.startTime);
        const end = this.timeline.xscale.inv(annotation.endTime);
        this.annotations[annotation.id].x = start
        this.annotations[annotation.id].width = Math.max(1, end - start);
    }

    //-------------------------------------------------------------------------
    // Helper
    //-------------------------------------------------------------------------
    width() { return this.app.view.width }
    height() { return this.app.view.height }
    leftInView() { return 0 }
    rightInView() { return this.width() }
    widthInView() { return this.width() }
    zoomFactor() { return 1 }

    addChild(child: PIXI.DisplayObject) { return this.app.stage.addChild(child) }

    //-------------------------------------------------------------------------
    // View
    //-------------------------------------------------------------------------
    initView() {
        this.window
            .beginFill(annotationColor)
            .drawRect(
                this.timeline.leftInView(),
                0,
                this.timeline.rightInView(),
                19
            );
        this.window.y = 25 - 3;
        this.window.alpha = 0.5;
        this.app.stage.addChild(this.window);
        this.border.position.set(0, this.height());
        this.border.lineStyle(4, 0x212121).moveTo(0, 0).lineTo(this.width(), 0);
        this.app.stage.addChild(this.border);
        this.draw();
    }
    draw() {
        this.window.x = this.timeline.viewport.left;
        this.window.width = Math.max(1, this.timeline.widthInView());
    }
    render() {

    }

    resizeChannel() {}

    changeCursor(style: string) {
        this.app.view.style.cursor = style;
    }

    destroyPanel() {
        for (const child of this.panel.children) {
            this.panel.removeChild(child);
        }
    }

    initPanel() {
        this.panel.style.background = "black";
        this.panel.style.height = `${summaryHeight}px`;
        this.panel.setAttribute("class", "beholder-summary-panel");
        this.panelLeft.setAttribute("class", "beholder-channel-buttons");
        this.timeButton.innerHTML = "T";
        this.timeButton.setAttribute("title", "time");
        this.panelLeft.appendChild(this.timeButton);
        this.settingsButton.innerHTML = '<i class="fa-solid fa-gear"></i>';
        this.settingsButton.setAttribute("title", "settings");
        this.panelLeft.appendChild(this.settingsButton);

        this.timePanelRight.setAttribute("class", "beholder-summary-panel-right");
        this.timePanelRight.appendChild(this.timeInput);
        this.panel.appendChild(this.panelLeft);
        this.panel.appendChild(this.timePanelRight);
        this.timeInput.setAttribute("placeholder", "00:01:32");

        // other panels
        this.settingsPanelRight.setAttribute("class", "beholder-summary-panel-right");
        this.settingsPanelRight.appendChild(this.lockInput);
        this.lockInput.innerHTML = '<i class="fa-solid fa-lock-open"></i>'
    }

    setTimePanel() {
        for (const child of [this.timePanelRight, this.settingsPanelRight]) {
            if (this.panel.contains(child)) {
                this.panel.removeChild(child);
            }
        }
        this.panel.appendChild(this.timePanelRight);
    }
    setSettingsPanel() {
        for (const child of [this.timePanelRight, this.settingsPanelRight]) {
            if (this.panel.contains(child)) {
                this.panel.removeChild(child);
            }
        }
        this.panel.appendChild(this.settingsPanelRight);
    }

    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------

    _goToTime(input) {
        const parts = input.split(':').map(Number);
        if (parts.length == 1) {
            const mseconds = parts[0] * 1000;
            this.timeline.annotator.updateTime(mseconds)
        } else if (parts.length == 2) {
            const mseconds = (parts[0]*60 +  parts[1]) * 1000;
            this.timeline.annotator.updateTime(mseconds)
        } else if (parts.length == 3) {
            const mseconds = (parts[0]*60*60 + parts[1]*60 +  parts[2]) * 1000;
            this.timeline.annotator.updateTime(mseconds)
        }
    }

    _bindEvents() {
        this.app.stage.hitArea = new PIXI.Rectangle(0, 0, this.app.stage.width, this.app.stage.height);
        this.app.stage.on("pointerdown", this._onPointerDown, this);
        this.app.stage.on("pointermove", this._onPointerMove, this);
        this.app.stage.on("pointerup", this._onPointerUp, this);

        // summary panel
        this.timeInput.addEventListener('input', (event: Event) => {
            // @ts-ignore
            this._goToTime(event.target.value);
        });
        this.timeInput.addEventListener('paste', (event: Event) => {
            // @ts-ignore
            this._goToTime(event.target.value);
        });
        this.timeInput.addEventListener('keydown', (event: Event) => {
            // @ts-ignore
            if (event.key === 'Enter') {
                this._goToTime(this.timeInput.value);
            }
        });

        this.timeButton.addEventListener("click", (event: MouseEvent) => {
            this.panelState = SummaryPanelState.Time;
            this.setTimePanel();
        });
        this.settingsButton.addEventListener("click", (event: MouseEvent) => {
            this.panelState = SummaryPanelState.Time;
            this.setSettingsPanel();
        });
    }

    _onPointerDown(event: PIXI.InteractionEvent) {
        const x = event.data.global.x;
        const y = event.data.global.y;
        if (this._isOnWindow(x, y)) {
            this.dragging = true;
            this.mouseDownX = event.data.global.x;
            this.mouseDownY = event.data.global.y;
            this.targetMouseDownX = event.target.x;
            this.targetMouseDownY = event.target.y;
        }
        if (this._isOnRuler(y)) {
            this.rulerDrag = true;
        }
        this._changeCursor(x, y);
    }

    _isOnRuler(y: number) { return this.ruler.top <= y && y <= this.ruler.bottom }
    _isOnWindow(x: number, y: number) {
        return this.window.y <= y && y <= this.window.y + this.window.height &&
               this.window.x <= x && x <= this.window.x + this.window.width
    }

    _onPointerMove(event: PIXI.InteractionEvent) {
        if (this.rulerDrag) {
            const time = this.xscale.call(event.data.global.x);
            this.indexCursor.updateTime(time);
            this.timeline.events["updateTime"].forEach(f => f(time));
        }
        if (this.dragging) {
            this.window.x = this.targetMouseDownX + event.data.global.x - this.mouseDownX;
            this.timeline.viewport.left = this.window.x;
            this.timeline._onMoved();
        }
        const x = event.data.global.x;
        const y = event.data.global.y;
        this._changeCursor(x, y);
    }

    _onPointerUp(event: PIXI.InteractionEvent) {
        this.stopDrag();
        const x = event.data.global.x;
        const y = event.data.global.y;
        this._changeCursor(x, y);
    }
    stopDrag() {
        this.dragging = false;
        this.rulerDrag = false;
    }

    _changeCursor(x: number, y: number) {
        if (this.dragging) {
            // @ts-ignore
            this.changeCursor("grabbing");
            return;
        }
        if (this._isOnWindow(x, y)) {
            this.changeCursor("grab");
            return;
        }
        if (this._isOnRuler(y)) {
            this.changeCursor("text");
            return;
        }
        if (this.rulerDrag) {
            this.changeCursor("text");
            return;
        }
        this.changeCursor("default");
    }

}

export class Cursor {
    // definitional attributes
    public timeline: TimelineLike
    public timeMs: number
    // helper attributes
    // view
    private color: number
    private cursor: PIXI.Graphics = new PIXI.Graphics();

    constructor(timeline: TimelineLike, timeMs: number, color: number) {
        this.timeline = timeline;
        this.timeMs = timeMs;
        this.color = color;
        this.initDraw();
    }

    updateTime(timeMs: number) {
        this.timeMs = timeMs;
        this.cursor.position.set(this.timeline.xscale.inv(this.timeMs), 0);
    }

    //-------------------------------------------------------------------------
    // view
    //-------------------------------------------------------------------------

    initDraw() {
        this.cursor.destroy();
        this.cursor = new PIXI.Graphics();
        this.cursor.position.set(0, 0);
        this.cursor.lineStyle(1, this.color).moveTo(0, 0).lineTo(0, this.timeline.height());
        this.timeline.addChild(this.cursor);
    }
    resize() {
        this.initDraw();
        this.rescale();
        this.updateTime(this.timeMs);
    }
    rescale() {
        this.cursor.width = 1 / this.timeline.zoomFactor();
    }
}


const timescales = [
    new LinearScale([0, 1000], [0, 1000], { name: "milliseconds", warn: false }),
    new LinearScale([0, 1000], [0, 500], { name: "halfcentiseconds", warn: false }),
    new LinearScale([0, 1000], [0, 100], { name: "centiseconds", warn: false }),
    new LinearScale([0, 1000], [0, 50], { name: "halfdeciseconds", warn: false }),
    new LinearScale([0, 1000], [0, 10], { name: "deciseconds", warn: false }),
    new LinearScale([0, 1000], [0, 2], { name: "halfseconds", warn: false }),
    new LinearScale([0, 1000], [0, 1], { name: "seconds", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 5], { name: "5seconds", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 10], { name: "decaseconds", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 30], { name: "30seconds", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 60], { name: "minutes", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 300], { name: "5minutes", warn: false }),
    new LinearScale([0, 1000], [0, 1 / 600], { name: "10minutes", warn: false }),
];

class RulerPanel {
    //
    public ruler: Ruler
    public rootElem: HTMLDivElement
    //
    private resizeObserver: ResizeObserver
    constructor(ruler: Ruler) {
        this.ruler = ruler

        // <div class="beholder-channel-panel">
        //   <div class="beholder-ruler-buttons">
        //   </div>
        //   <div class="beholder-ruler-names">
        //   </div>
        // </div>

        this.rootElem = document.createElement("div");
        this.rootElem.setAttribute("class", "beholder-ruler-panel");
        this.rootElem.style.height = `${this.height()}px`;
        this.rootElem.style.width = `${channelPanelWidth}px`;
        this.rootElem.style.background = `#1e1e1e`;
        this.rootElem.style.border = `1 black`;

        this.rootElem.style.setProperty("order", `${-1}`)

        const buttonsDiv = document.createElement("div");
        buttonsDiv.setAttribute("class", "beholder-channel-buttons");
        this.rootElem.appendChild(buttonsDiv);

        const channelName = document.createElement("div");
        channelName.setAttribute("class", "beholder-channel-names");
        this.rootElem.appendChild(channelName);

        this.resizeObserver = new ResizeObserver((entries) => {
            //this.ruler.height = this.rootElem.getBoundingClientRect().height;
            //this.ruler.timeline.resizeChannel();
        });
        this.resizeObserver.observe(this.rootElem);

        this._bindEvents();
    }

    _bindEvents() {
    }

    height() { return this.ruler.height }

}

export class Ruler {
    // definitional attributes
    public timeline: TimelineLike
    public scale: Scale
    public panel: RulerPanel | null = null;
    // helper attributes
    public y: number
    public height: number
    public top: number
    public bottom: number

    private leftMostTick: PIXI.Sprite;
    private rightMostTick: PIXI.Sprite;
    // view
    private tickContainer: PIXI.ParticleContainer
    private border: PIXI.Graphics
    public ticks: Array<PIXI.Sprite>
    public labels: Array<PIXI.Text>

    constructor(timeline: TimelineLike) {
        this.timeline = timeline;
        this.scale = this.findBestScale();
        this.ticks = [];
        this.labels = [];
        //
        this.top = this.y = 0;
        this.height = channelHeight;
        this.bottom = this.y + this.height;
        this.rightMostTick = this.leftMostTick = PIXI.Sprite.from(PIXI.Texture.WHITE);

        // view
        this.tickContainer = new PIXI.ParticleContainer(50000, {
            scale: true,
            position: true,
            rotation: false,
            uvs: false,
            alpha: false
        });
        this.tickContainer.width = this.timeline.width();
        this.tickContainer.height = this.height;
        this.timeline.addChild(this.tickContainer);
        this.tickContainer.interactive = false;
        this.tickContainer.interactiveChildren = false;

        this.border = new PIXI.Graphics();

        if (this.timeline instanceof Timeline) {
            this.panel = new RulerPanel(this);
            this.timeline.channelPanel.appendChild(this.panel.rootElem);
        }

        this.initView();
    }

    //-------------------------------------------------------------------------
    // stateful
    //-------------------------------------------------------------------------

    //-------------------------------------------------------------------------
    // helper
    //-------------------------------------------------------------------------

    findBestScale(): LinearScale {
        const targetTickWidth = 10;
        const minTickWidth = 3;
        let leastError = Number.MAX_VALUE;
        let bestScale = timescales[0];
        timescales.forEach(timescale => {
            const tickWidth = this.timeline.xscale.inv(timescale.inv(1)) * this.timeline.zoomFactor();
            const error = Math.abs(targetTickWidth - tickWidth);
            if (error < leastError && minTickWidth < tickWidth) {
                leastError = error;
                bestScale = timescale;
            }
        });
        return bestScale;
    }

    left() { return this.timeline.leftInView() }
    right() { return this.timeline.rightInView() }
    width() { return this.right() - this.left() }

    //-------------------------------------------------------------------------
    // view
    //-------------------------------------------------------------------------

    // view
    initView() {
        this.zoomScale(1);
    }

    draw() {
        this.border.position.set(0, this.bottom);
        this.border.lineStyle(1, 0x919191).moveTo(0, 0).lineTo(this.width(), 0);
        const start = Math.max(this.left() - this.width(), 0);
        const end = Math.min(this.right() + this.width(), this.timeline.width());
        const tickWidth = this.timeline.xscale.inv(this.scale.inv(1));
        let i = 0;
        let j = 0;
        for (let x = start; x <= end; x += tickWidth) {
            const tickRank = Math.floor(x / tickWidth);
            i += this._createTicker(i, x, tickRank);
            j += this._createLabel(j, x, tickRank);
        }
        this.leftMostTick = this.ticks[0];
        this.rightMostTick = this.ticks[i - 1];
        for (; i < this.ticks.length; ++i) {
            this.ticks[i].x = -100
        }
        for (; j < this.labels.length; ++j) {
            this.labels[j].x = -100
        }
    }

    _createTicker(i: number, x: number, tickRank: number): number {
        const sprite: PIXI.Sprite = i < this.ticks.length
            ? this.ticks[i]
            : PIXI.Sprite.from(PIXI.Texture.WHITE);
        sprite.tint = 0x919191;
        sprite.width = 1;
        sprite.y = 0;
        sprite.x = x;
        if (tickRank % 10 == 0) {
            sprite.height = this.height / 2;
        } else if (tickRank % 5 == 0) {
            sprite.height = this.height / 4;
        } else {
            sprite.height = this.height / 8;
        }
        if (this.ticks.length <= i) {
            this.ticks.push(sprite);
            this.tickContainer.addChild(sprite);
        }
        return 1;
    }

    _createLabel(i: number, x: number, tickRank: number): number {
        if (tickRank % 10 !== 0) return 0;
        if (i > 0 && x <= this.labels[i - 1].x + this.labels[i - 1].width) return 0;
        const label = i < this.labels.length
            ? this.labels[i]
            : new PIXI.Text();
        label.text = new Date(this.timeline.xscale.call(Math.floor(x))).toISOString().slice(11, 23);
        label.style = {
            fill: 0x919191,
            stroke: 0x919191,
            fontSize: 10,
            fontFamily: "Inconsolata; mono",
        }
        label.x = x;
        label.y = 10;
        label.anchor.set(0);
        if (this.labels.length <= i) {
            this.labels.push(label);
            this.timeline.textContainer.addChild(label);
        }
        return 1;
    }

    zoomScale(xScale: number) {
        const scale = this.findBestScale();
        if (!(scale.name === this.scale.name && this.timeline.leftInView() <= this.leftMostTick.x && this.timeline.rightInView() <= this.rightMostTick.x)) {
            this.scale = scale;
            this.draw();
        }
        this.ticks.forEach(tick => tick.width = 1 / xScale);
        this.labels.forEach(label => label.scale.x = 1 / xScale);
    }
}

class ChannelPanel {
    //
    public channel: Channel
    public rootElem: HTMLDivElement
    //
    private minimized: boolean = false;
    private oldHeight: number = -1;
    private resizeObserver: ResizeObserver
    //
    private deleteButton: HTMLButtonElement
    private minmaxButton: HTMLButtonElement
    private childButton: HTMLButtonElement
    private nameSpan: HTMLSpanElement
    constructor(channel: Channel) {
        this.channel = channel

        // <div class="beholder-channel-panel">
        //   <div class="beholder-channel-buttons">
        //   </div>
        //   <div class="beholder-channel-names">
        //   </div>
        // </div>

        this.rootElem = document.createElement("div");
        this.rootElem.setAttribute("class", "beholder-channel-panel");
        this.rootElem.style.height = `${this.height()}px`;
        this.rootElem.style.width = `${channelPanelWidth}px`;
        this.rootElem.style.background = `#1e1e1e`;
        this.rootElem.style.border = `1 black`;

        const buttonsDiv = document.createElement("div");
        buttonsDiv.setAttribute("class", "beholder-channel-buttons");
        this.rootElem.appendChild(buttonsDiv);

        this.minmaxButton = document.createElement("button");
        this.minmaxButton.innerHTML = "-"
        buttonsDiv.appendChild(this.minmaxButton);

        this.deleteButton = document.createElement("button");
        this.deleteButton.innerHTML = "x";
        buttonsDiv.appendChild(this.deleteButton);

        this.childButton = document.createElement("button");
        this.childButton.innerHTML = "c"
        buttonsDiv.appendChild(this.childButton);

        const channelName = document.createElement("div");
        channelName.setAttribute("class", "beholder-channel-names");
        this.rootElem.appendChild(channelName);

        this.nameSpan = document.createElement("span");
        this.nameSpan.innerHTML = this.channel.state.name;
        channelName.appendChild(this.nameSpan);


        this.resizeObserver = new ResizeObserver((entries) => {
            this.channel.height = this.rootElem.getBoundingClientRect().height;
            this.channel.timeline.resizeChannel();
        });
        this.resizeObserver.observe(this.rootElem);

        this._bindEvents();
    }

    _bindEvents() {
        this.deleteButton.addEventListener("click", () => { this.delete() });
        this.childButton.addEventListener("click", () => { this.child() });
        this.minmaxButton.addEventListener("click", () => { this.minmax() });
    }

    height() { return this.channel.height }

    delete() {
        this.resizeObserver.unobserve(this.rootElem);
        this.channel.timeline.events["deleteChannel"].forEach(f => f(this.channel.state));
    }

    child() {
        const state = deepCopy(this.channel.state);
        state.name = `c(${state.name})`;
        state.id = this.channel.timeline.newChannelId()
        state.parentId = this.channel.state.id;
        this.channel.timeline.events["createChannel"].forEach(f => f(state));
    }

    minmax() {
        if (this.minimized) {
            this.maximize();
        } else {
            this.minimize();
        }
    }

    minimize() {
        this.channel.height = 10;
        this.rootElem.style.height = `${this.channel.height}px`;
        this.channel.timeline.resizeChannel();
        this.minimized = true;
        this.minmaxButton.innerHTML = "+";

        this.deleteButton.style.display = "none";
        this.childButton.style.display = "none";
        this.channel.children().forEach(childChannel => {
            childChannel.panel.minimize();
            childChannel.hide();
        });
    }

    maximize() {
        this.channel.height = (this.oldHeight === -1) ? 50 : this.oldHeight;
        this.rootElem.style.height = `${this.channel.height}px`;
        this.channel.timeline.resizeChannel();
        this.minimized = false;
        this.minmaxButton.innerHTML = "-";

        this.deleteButton.style.display = "inline";
        this.childButton.style.display = "inline";

        this.channel.children().forEach(childChannel => {
            childChannel.show();
            childChannel.panel.maximize();
        });
    }
}

export class Channel implements base.Channel{
    //
    public timeline: Timeline
    public state: ChannelState
    public timelineAnnotationTree: IntervalTree<number>
    public panel: ChannelPanel
    public parent: Channel | undefined = undefined

    //
    private annotationIds: Set<number> = new Set([])
    public left: number = 0
    public right: number = 0
    public y: number
    public width: number
    public height: number

    // view
    private border: PIXI.Graphics
    private treepath: PIXI.Graphics
    private backgroundSprite: PIXI.Sprite = new PIXI.Sprite();
    private backgroundImg: HTMLImageElement | null = null
    private backgroundCanvas: HTMLCanvasElement | null = null
    private backgroundScale: Scale | null = null

    constructor(state: ChannelState, timeline: Timeline) {
        //
        this.state = state;
        this.timeline = timeline;
        this.timelineAnnotationTree = new IntervalTree();

        //
        this.parent = this.state.parentId === null
            ? undefined
            : timeline.findChannelById(this.state.parentId)

        //
        this.width = this.timeline.timelineApp.screen.width;
        this.height = channelHeight;
        this.y = Math.max(this.timeline.ruler.bottom, Math.max(...this.timeline.channels.map(channel => channel.bottom())));
        this.panel = new ChannelPanel(this);
        // view
        this.border = new PIXI.Graphics();
        this.treepath = new PIXI.Graphics();
        if (this.state.showBackground && this.state.background !== undefined) {
            this.backgroundImg = document.createElement("img");
            this.backgroundImg.onload = () => this.initBackground();
            this.backgroundImg.src = this.state.background;
        }
        this.initView();
    }

    annotations() {
        const annotations: Array<TimelineAnnotation> = [];
        this.annotationIds.forEach(id => {
            annotations.push(this.timeline.annotations[id]);
        });
        return annotations;
    }

    isDescendent(id: number) {
        if (this.parent === undefined) return false;
        return this.state.parentId === id || this.parent.isDescendent(id);
    }

    descendents(): Array<Channel> {
        return this.timeline.channels.filter(channel => channel.isDescendent(this.state.id));
    }

    children(): Array<Channel> {
        return this.timeline.channels.filter(channel => channel.parent !== undefined && channel.parent.state.id == this.state.id);
    }

    //

    drawChannelTree() {
        this.treepath.clear();
        const width = this.timeline.channelTreeApp.view.getBoundingClientRect().width;
        const margin = 2;
        const availWidth = width - margin * 2;
        const rootX = this.parent === undefined
            ? margin
            : margin + availWidth * this.depth() / (this.timeline.maxChannelDepth + 1);
        const rootY = this.parent === undefined
            ? 0
            : this.parent.middleY();
        const nodeX = rootX;
        const nodeY = this.middleY();
        const leafX = this.timeline.channelTreeApp.view.width;
        const leafY = this.middleY();
        this.treepath.lineStyle(2, 0xffffff)
            .moveTo(rootX, rootY)
            .lineTo(nodeX, nodeY)
            .lineTo(leafX, leafY)
    }

    top() { return this.y }
    middleY() { return this.y + this.height / 2 }
    bottom() { return this.y + this.height; }

    //

    depth(): number {
        let node: Channel = this;
        let d = 0;
        while (node.parent !== undefined) {
            node = node.parent
            d += 1;
        }
        return d;
    }

    idAtDepth(depth: number): number {
        if (this.depth() <= depth || this.parent === undefined) return this.state.id;
        return this.parent.idAtDepth(depth);
    }

    //

    findTimelineAnnotations(x: number, y: number): TimelineAnnotation[] {
        return this.timelineAnnotationTree
                   .search(x, x)
                   .map(id => this.timeline.annotations[id])
                   .filter(a => a.top() <= y && y <= a.y() + a.height());
    }

    findTimelineAnnotationsInterval(s: number, e: number): TimelineAnnotation[] {
        return this.timelineAnnotationTree.search(s, e).map(id => this.timeline.annotations[id]);
    }

    // state
    insertAnnotation(state: TimelineAnnotationState): boolean {
        this.annotationIds.add(state.id);
        return this.timelineAnnotationTree.insert(
            this.timeline.time2pixel(state.startTime),
            this.timeline.time2pixel(state.endTime),
            state.id
        );
    }
    removeAnnotation(state: TimelineAnnotationState): boolean {
        const annotationToDelete = this.timeline.annotations[state.id];
        const nextAnnotation = annotationToDelete.nextAnnotation();
        const prevAnnotation = annotationToDelete.prevAnnotation();
        if (nextAnnotation !== null && nextAnnotation !== undefined) {
            nextAnnotation.state.prevAnnotationId = null;
        }
        if (prevAnnotation !== null && prevAnnotation !== undefined) {
            prevAnnotation.state.nextAnnotationId = null;
        }
        this.annotationIds.delete(state.id);
        return this.timelineAnnotationTree.remove(
            this.timeline.time2pixel(state.startTime),
            this.timeline.time2pixel(state.endTime),
            state.id
        );
    }

    // view
    initView() {
        this.timeline.channelContainer.addChild(this.border);
        this.timeline.channelContainer.addChild(this.backgroundSprite);
        this.timeline.channelPanel.appendChild(this.panel.rootElem);
        this.timeline.channelTreeContainer.addChild(this.treepath);
        this.draw();
    }
    hide() {
        this.height = 0;
        this.border.visible = false;
        this.backgroundSprite.visible = false;
        this.treepath.visible = false;
        this.panel.rootElem.style.display = "none";
    }
    show() {
        this.border.visible = true;
        this.backgroundSprite.visible = true;
        this.treepath.visible = true;
        this.panel.rootElem.style.display = "";
    }
    draw() {
        this.border.position.set(0, this.bottom());
        this.border.lineStyle(2.0, 0x919191).moveTo(0, 0).lineTo(this.width, 0);
        this.drawBackground();
        this.drawChannelTree();
    }
    initBackground() {
        if (this.backgroundImg === null) return;
        this.backgroundCanvas = document.createElement("canvas");
        this.backgroundCanvas.width = 4096;
        this.backgroundCanvas.height = this.backgroundImg.height;
        this.backgroundSprite.y = this.top();
        this.drawBackground();
    }
    drawBackground() {
        if (this.state.background === null) return;
        if (this.backgroundCanvas === null) return;
        if (this.backgroundImg === null) return;
        if (this.backgroundSprite === null) return;
        this.backgroundCanvas.height = this.backgroundImg.height;
        this.backgroundSprite.height = this.height;
        this.backgroundSprite.y = this.top();
        const ctx = this.backgroundCanvas.getContext("2d");
        this.backgroundScale = new LinearScale([0, this.backgroundImg.width], this.timeline.xscale.domain)
        // @ts-ignore
        ctx.imageSmoothingEnabled = false;
        const width = this.backgroundImg.width;
        const left = this.backgroundScale.inv(this.timeline.leftInView());
        const right = this.backgroundScale.inv(this.timeline.rightInView());
        // @ts-ignore
        ctx.drawImage(this.backgroundImg, left, 0, right - left, this.backgroundImg.height, 0, 0, 4096, this.backgroundCanvas.height);
        this.backgroundSprite.texture = PIXI.Texture.from(this.backgroundCanvas);
        this.backgroundSprite.texture.update();
        this.backgroundSprite.x = this.timeline.leftInView();
        this.backgroundSprite.width = this.timeline.widthInView();
    }

    overlapGroup(annotation: TimelineAnnotation) {
        const maxIter = 50;
        const epsilon = 1e-2;
        let start = this.timeline.time2pixel(annotation.state.startTime);
        let end = this.timeline.time2pixel(annotation.state.endTime);
        for (let i=0; i < maxIter; ++i) {
            const annotations = this.findTimelineAnnotationsInterval(start+epsilon, end-epsilon);
            const _start = this.timeline.time2pixel(
                Math.min(...annotations.map(a => a.state.startTime))
            );
            const _end = this.timeline.time2pixel(
                Math.max(...annotations.map(a => a.state.endTime))
            );
            if (start == _start && end == _end) {
                break
            }
            start = _start;
            end = _end;
        }
        return this.findTimelineAnnotationsInterval(start+epsilon, end-epsilon);
    }

    //
    zoomPan() {
        this.drawBackground();
    }
    //
    delete() {
        this.panel.rootElem.remove();
        this.border.destroy();
        this.backgroundSprite.destroy();
        this.treepath.destroy();
        if (this.backgroundImg !== null) {
            this.backgroundImg.remove();
        }
        if (this.backgroundCanvas !== null) {
            this.backgroundCanvas.remove();
        }
    }

}

const dummyText = new PIXI.Text("a", { fontSize: 12, fontFamily: "\"Lucida Console\", Monaco, monospace" });
const ellipsis = "…";
export class TimelineAnnotation implements base.TimelineAnnotation {
    //---------------------------------
    //
    //---------------------------------
    public state: TimelineAnnotationState
    public newState: TimelineAnnotationState
    public dragState: TimelineAnnotationState
    public timeline: Timeline;
    public channel: Channel;

    //---------------------------------
    // interaction state
    //---------------------------------
    public endBuffer = 10;
    public selected = false
    public selectedStart = false
    public selectedEnd = false
    public hovered = false
    public startHovered = false
    public endHovered = false
    public creartionDrag = false
    public dragged = false
    public draggedStart = false
    public draggedEnd = false
    private dragDownStartTime = -1
    private dragDownEndTime = -1
    private dragDownY = -1


    //---------------------------------
    // helper attributes
    //---------------------------------
    private mouseDownX: number = -1
    private targetMouseDownX: number = -1
    public boundDragging: boolean = false
    public boundHover: boolean = false
    private target: PIXI.Sprite | null = null

    private margin: number = 2;

    private overlapGroup: TimelineAnnotation[] = [this];
    private overlapPosition: number = 0;

    //---------------------------------
    // view attributes
    //---------------------------------
    private sprite: PIXI.Sprite
    private left: PIXI.Sprite
    private right: PIXI.Sprite
    private textStyle: any = { fontSize: 12, fontFamily: "\"Lucida Console\", Monaco, monospace" };
    private text: PIXI.Text

    constructor(state: TimelineAnnotationState, timeline: Timeline, channel: Channel) {
        this.newState = this.dragState = this.state = state;
        this.timeline = timeline;
        this.channel = channel;

        //-----------------------------
        // view
        //-----------------------------
        this.sprite = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.left = PIXI.Sprite.from(PIXI.Texture.WHITE);
        this.right = PIXI.Sprite.from(PIXI.Texture.WHITE);

        this.text = new PIXI.Text(this.state.value, this.textStyle);
        this.text.interactive = true;
        this.text.visible = false;
        this.initView();
        this._bindEvents();
    }

    //--------------------------------------------------------------------------
    // Interface
    //--------------------------------------------------------------------------
    update(track: boolean) {
        this.timeline.dispatch("updateTimelineAnnotation", this.newState, this.dragState, track);
        this.newState = deepCopy(this.state);
        this.overlapGroup = this.channel.overlapGroup(this);
        this.overlapPosition = this.overlapGroup
                                   .sort((a, b) => a.state.id - b.state.id)
                                   .findIndex(a => a.state.id == this.state.id);
        return this;
    }
    move(timeMs: number) {
        const diff = timeMs - this.state.startTime;
        this.newState.startTime += diff;
        this.newState.endTime += diff;
        return this;
    }
    moveStart(timeMs: number): TimelineAnnotation {
        if (this.dragState.endTime <= timeMs) {
            this.newState.endTime = timeMs;
            this.newState.startTime = this.dragState.endTime;
            this.resolveEndConstraints();
        } else {
            this.newState.startTime = timeMs;
            this.newState.endTime = this.dragState.endTime;
            this.resolveStartConstraints();
        }
        return this;
    }
    moveEnd(timeMs: number): TimelineAnnotation {
        if (timeMs <= this.dragState.startTime) {
            this.newState.startTime = timeMs;
            this.newState.endTime = this.dragState.startTime;
            this.resolveStartConstraints();
        } else {
            this.newState.endTime = timeMs;
            this.newState.startTime = this.dragState.startTime;
            this.resolveEndConstraints();
        }
        return this;
    }
    shift(diffMs: number): TimelineAnnotation {
        this.newState.startTime = this.dragDownStartTime + diffMs;
        this.newState.endTime = this.dragDownEndTime + diffMs;
        return this;
    }
    shiftStart(diffMs: number): TimelineAnnotation {
        this.newState.startTime += diffMs;
        this.resolveStartConstraints();
        return this;
    }
    shiftEnd(diffMs: number): TimelineAnnotation {
        this.newState.endTime += diffMs;
        this.resolveEndConstraints();
        return this;
    }
    shiftFrameStart(frames: number, framerate: number): TimelineAnnotation {
        const currentFrame = Math.floor(this.newState.startTime / 1000 * framerate);
        const newFrame = currentFrame + frames + 0.1;
        const newTime = newFrame / framerate * 1000;
        this.newState.startTime = newTime;
        this.resolveStartConstraints();
        return this;
    }
    shiftFrameEnd(frames: number, framerate: number): TimelineAnnotation {
        const currentFrame = Math.floor(this.newState.endTime / 1000 * framerate);
        const newFrame = currentFrame + frames + 0.1;
        const newTime = newFrame / framerate * 1000;
        this.newState.endTime = newTime;
        this.resolveEndConstraints();
        return this;
    }
    setChannel(channelId: number): TimelineAnnotation {
        this.newState.channelId = channelId;
        return this;
    }
    cycleChannel(channelId: number): TimelineAnnotation {
        this.newState.channelId = (this.state.channelId + channelId) % this.timeline.channels.length;
        return this;
    }
    shiftAnnotationForward() {
        const framerate = this.timeline.annotator.media.state.framerate;
        if (framerate !== null) {
            if (this.selectedStart) {
                this.shiftFrameStart(1, framerate);
                this.timeline.annotator.updateTime(this.newState.startTime);
            } else if (this.selectedEnd) {
                this.shiftFrameEnd(1, framerate);
                this.timeline.annotator.updateTime(this.newState.endTime);
            }
        }
        return this;
    }
    shiftAnnotationBackward() {
        const framerate = this.timeline.annotator.media.state.framerate;
        if (framerate !== null) {
            if (this.selectedStart) {
                this.shiftFrameStart(-1, framerate);
                this.timeline.annotator.updateTime(this.newState.startTime);
            } else if (this.selectedEnd) {
                this.shiftFrameEnd(-1, framerate);
                this.timeline.annotator.updateTime(this.newState.endTime);
            }
        }
        return this;
    }
    delete() {
        this.sprite.destroy();
        this.left.destroy();
        this.right.destroy();
        this.text.destroy();
    }
    rescale() {
        const xScale = this.timeline.zoomFactor();
        const width = (this.hovered ? 4 : 1) / xScale;
        this.left.width = width;
        this.right.width = width;
        this.right.x = this.rightBarPosition();
        this.text.scale.x = 1 / xScale;
        this.textVisibility();
        return this;
    }
    mouseDown(x: number, y: number) {
        if (Math.abs(this.timeline.time2pixel(this.state.startTime) - x) * this.timeline.zoomFactor() < this.endBuffer) {
            this.enableDragStart();
        } else if (Math.abs(this.timeline.time2pixel(this.state.endTime) - x) * this.timeline.zoomFactor() < this.endBuffer) {
            this.enableDragEnd();
        } else {
            this.enableDrag();
        }
        return this;
    }
    mouseMove(x: number, y: number) {
        if (Math.abs(this.timeline.time2pixel(this.state.startTime) - x) * this.timeline.zoomFactor() < this.endBuffer) {
            this.startHovered = true;
        } else {
            this.startHovered = false;
        }
        if (Math.abs(this.timeline.time2pixel(this.state.endTime) - x) * this.timeline.zoomFactor() < this.endBuffer) {
            this.endHovered = true;
        } else {
            this.endHovered = false;
        }
        return this;
    }
    disableDrag() {
        this.dragged = false;
        this.draggedStart = false;
        this.draggedEnd = false;
        this.creartionDrag = false;
        return this;
    }
    enableDrag() {
        this.dragState = deepCopy(this.state);
        this.newState = deepCopy(this.state);
        this.dragged = true;
        this.dragDownStartTime = this.state.startTime
        this.dragDownEndTime = this.state.endTime
        return this;
    }
    enableDragStart() {
        this.dragState = deepCopy(this.state);
        this.newState = deepCopy(this.state);
        this.draggedStart = true;
        this.dragDownStartTime = this.state.startTime
        this.left.tint = annotationSelectBarColorSelected;
        this.selectedEnd = false;
        this.selectedStart = true;
        return this;
    }
    enableDragEnd() {
        this.dragState = deepCopy(this.state);
        this.newState = deepCopy(this.state);
        this.draggedEnd = true;
        this.dragDownEndTime = this.state.endTime
        this.right.tint = annotationSelectBarColorSelected;
        this.selectedEnd = true;
        this.selectedStart = false;
        return this;
    }

    highlight() {
        this.hovered = true;
        return this;
    }
    dehighlight() {
        this.hovered = false;
        return this;
    }

    //-------------------------------------------------------------------------
    // Group
    //-------------------------------------------------------------------------
    prevAnnotation() {
        if (this.state.prevAnnotationId === null || this.state.prevAnnotationId === undefined) return null;
        return this.timeline.annotations[this.state.prevAnnotationId];
    }
    nextAnnotation() {
        if (this.state.nextAnnotationId === null || this.state.nextAnnotationId === undefined) return null;
        return this.timeline.annotations[this.state.nextAnnotationId];
    }
    resolveStartConstraints(): TimelineAnnotation | null {
        // potentially handle previous annotations
        const prevAnnotation = this.prevAnnotation();
        if (prevAnnotation !== null && prevAnnotation !== undefined) {
            if (this.newState.startTime < prevAnnotation.newState.endTime) {
                this.newState.startTime = Math.max(
                    this.newState.startTime,
                    prevAnnotation.newState.startTime + 1
                );
            }
            prevAnnotation.newState.endTime = this.newState.startTime;
            this.timeline.auxiliaryUpdateGroup.add(prevAnnotation);
        }
        return prevAnnotation;
    }
    resolveEndConstraints(): TimelineAnnotation | null {
        // potentially handle previous annotations
        const nextAnnotation = this.nextAnnotation();
        if (nextAnnotation !== null && nextAnnotation !== undefined) {
            if (nextAnnotation.newState.startTime < this.newState.endTime) {
                this.newState.endTime = Math.min(
                    this.newState.endTime,
                    nextAnnotation.newState.endTime - 1
                );
            }
            nextAnnotation.newState.startTime = this.newState.endTime;
            this.timeline.auxiliaryUpdateGroup.add(nextAnnotation);
        }
        return nextAnnotation;
    }
    setGroupId(groupId: number) {
        this.newState.groupId = groupId;
        return this;
    }
    //-------------------------------------------------------------------------
    // Helpers
    //-------------------------------------------------------------------------
    x() { return this.timeline.xscale.inv(this.state.startTime) }
    y() { return this.sprite.y }
    top() {
        const margins = (this.overlapPosition + 1) * this.margin;
        return this.channel.top() + this.overlapPosition * this.height() + margins;
    }
    bottom() { return this.channel.bottom }
    middleX() { return this.start() + this.width() / 2 }
    middleY() { return this.y() + this.height() / 2 }
    width() { return this.end() - this.start() }
    height() {
        const available = this.channel.height - (1 + this.overlapGroup.length) * this.margin;
        return available / this.overlapGroup.length
    }
    start() { return this.timeline.xscale.inv(this.state.startTime); }
    end() { return this.timeline.xscale.inv(this.state.endTime); }
    leftBarPosition() { return this.start() }
    rightBarPosition() { return this.end() - (this.hovered ? 4 : 1) / this.timeline.zoomFactor() }

    //-------------------------------------------------------------------------
    // View
    //-------------------------------------------------------------------------
    initView() {
        this.sprite.tint = annotationColor;
        this.sprite.alpha = 0.5;

        this.left.tint = annotationBarColor;
        this.left.interactive = true;
        this.left.zIndex = 100;
        this.timeline.annotationEndContainer.addChild(this.left);

        this.right.tint = annotationBarColor;
        this.right.interactive = true;
        this.right.zIndex = 100;
        this.timeline.annotationEndContainer.addChild(this.right);

        this.timeline.annotationContainer.addChild(this.sprite);
        this.text.anchor.set(0.5);
        this.timeline.textContainer.addChild(this.text);
    }
    draw() {
        this.sprite.x = this.start();
        this.left.y = this.right.y = this.sprite.y = this.top();
        this.sprite.width = this.width();
        this.left.height = this.right.height = this.sprite.height = this.height();

        this.text.x = this.middleX();
        this.text.y = this.middleY();
        this.textVisibility();

        this.left.x = this.leftBarPosition();
        this.right.x = this.rightBarPosition();

        if (this.selected) {
            this.sprite.tint = annotationSelectColor;
        } else if (this.hovered) {
            this.sprite.tint = annotationHoverColor;
        } else {
            this.sprite.tint = annotationColor;
        }
        return this;
    }
    textVisibility() {
        if (this.end() < this.timeline.leftInView() || this.timeline.rightInView() < this.start()) {
            this.text.visible = false;
            return;
        }
        let numChars = Math.floor((this.timeline.viewport.scale.x * this.width()) / dummyText.width) - 2;
        numChars = Math.max(numChars, 0);
        if (numChars === 0) {
            this.text.visible = false;
            return;
        }
        this.text.text = numChars < this.state.value.length
            ? [...this.state.value].slice(0, numChars).join("") + ellipsis
            : this.state.value;
        this.text.visible = true;
    }
    hideText() { this.text.visible = false }
    showText() { this.text.visible = true }
    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------
    _bindEvents() {
        this.left.on("pointerdown", () => { this.enableDragStart() });
        this.right.on("pointerdown", () => { this.enableDragEnd() });
        this.left.on("pointerover", () => { this.startHovered = true });
        this.left.on("pointerout", () => { this.startHovered = false });
        this.right.on("pointerover", () => { this.endHovered = true });
        this.right.on("pointerout", () => { this.endHovered = false });
    }

    select() {
        this.sprite.tint = annotationSelectColor;
        if (this.selectedStart) {
            this.right.tint = annotationSelectBarColorSelected;
        } else {
            this.left.tint = annotationSelectBarColor;
        }
        if (this.selectedEnd) {
            this.right.tint = annotationSelectBarColorSelected;
        } else {
            this.right.tint = annotationSelectBarColor;
        }
        this.selected = true;

        return this;
    }

    deselect() {
        this.sprite.tint = annotationColor;
        this.left.tint = annotationBarColor;
        this.right.tint = annotationBarColor;
        this.selected = false;

        this.selectedStart = false;
        this.selectedEnd = false;
        this.timeline.annotator.table.deselectTimelineAnnotation(this.state);
        this.timeline.summary.deselectTimelineAnnotation(this.state);
        return this;
    }

    json() {
        const state = deepCopy(this.state);
        this.timeline.annotator.schema.modifiers.forEach(modifier => {
            delete state[modifier.key];
        });
        return state;
    }
}
