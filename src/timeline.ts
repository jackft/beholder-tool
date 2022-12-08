import * as PIXI from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { Cull } from '@pixi-essentials/cull';

import IntervalTree from 'node-interval-tree';

import * as state from './state';
import { Scale, LinearScale } from './scales';
import { deepCopy } from './utils';

const annotationColor = 0xc1c1c1;
const annotationHoverColor = 0xe1e1e1;
const annotationSelectColor = 0xf1f1f1;
const annotationBarColor = 0x2585cc;
const channelPanelWidth = 100;
const channelTreeWidth = 20;
const summaryHeight = 50;

interface TimelineEvents {
    "deselectTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>,
    "selectTimelineAnnotation": Array<(state: state.TimelineAnnotationState) => void>,
    "updateTimelineAnnotation": Array<(newState: state.TimelineAnnotationState, oldState: state.TimelineAnnotationState, tracking: boolean) => void>,
    "updateTime": Array<(timeMs: number) => void>

    "deleteChannel": Array<(state: state.ChannelState) => void>,
    "createChannel": Array<(state: state.ChannelState) => void>,
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
}

interface TimelinOptions {
    summary_canvas: PIXI.IApplicationOptions,
    timeline_canvas: PIXI.IApplicationOptions,
    timeline: {
        milliseconds: number
    }
}

export class Timeline implements TimelineLike {
    // definitional attributes
    public channels: Array<Channel>
    public annotations: { [key: number]: TimelineAnnotation }
    public summary: Summary
    public ruler: Ruler

    // helper attributes
    public xscale: LinearScale;
    public draggingTimelineAnnotation: TimelineAnnotation | null = null;
    public selectedTimelineAnnotation: TimelineAnnotation | null = null;
    public hoveredTimelineAnnotation: TimelineAnnotation | null = null;
    private showingAnnotationText: boolean = false;
    private rulerDrag: boolean = false;
    private mouseDown: boolean = false;
    private whichButtonDown: number = -1; // 0 left 1 right
    private mouseDownX: number = -1;
    private mouseDownY: number = -1;
    private targetMouseDownX: number = -1;
    private targetMouseDownY: number = -1;
    public events: TimelineEvents;
    private channelIdCounter: number;

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
    public dragContainer: PIXI.Container
    public annotationContainer: PIXI.ParticleContainer
    public textContainer: PIXI.Container
    private cull: Cull
    private mouseCursor: Cursor
    private indexCursor: Cursor


    private cullDirty: boolean;

    constructor(container: HTMLDivElement, opts: TimelinOptions) {

        const mainTimelineWidth = container.getBoundingClientRect().width - channelTreeWidth - channelPanelWidth;
        const mainTimelineHeight = 150;

        // helper attributes

        this.xscale = new LinearScale([0, mainTimelineWidth], [0, 3623600]);
        this.events = {
            "deselectTimelineAnnotation": [],
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

        opts.timeline_canvas.view = this.mainCanvas;
        opts.timeline_canvas.width = mainTimelineWidth;
        opts.timeline_canvas.height = mainTimelineHeight;

        this.timelineApp = new PIXI.Application(opts.timeline_canvas);
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

        this.dragContainer = new PIXI.Container();
        this.channelContainer = new PIXI.Container();
        this.annotationContainer = new PIXI.ParticleContainer(100000, {
            scale: true,
            position: true,
            rotation: true,
            uvs: true,
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
        this.viewport.addChild(this.dragContainer);
        this.viewport.addChild(this.textContainer);


        this.timelineApp.stage.interactive = true;
        this.dragContainer.interactive = true;
        this.annotationContainer.interactive = true;

        this.mouseCursor = new Cursor(this, 0, 0xffffff);
        this.indexCursor = new Cursor(this, 0, 0xff0000);

        // definitional attributes
        this.channels = [];
        this.annotations = {};
        this.ruler = new Ruler(this);
        this.summary = new Summary(summaryControls, summaryMainContainer, this, opts.summary_canvas);
        // helper attributes
        this.channelIdCounter = 0;

        this._bindEvents();
    }


    //-------------------------------------------------------------------------
    // Stateful
    //-------------------------------------------------------------------------
    createChannel(state: state.ChannelState) {
        const channel = new Channel(state, this);
        this.channels.push(channel);
        if (channel.bottom() > +this.timelineApp.view.style.height) {
            this.timelineApp.view.style.height = `${Math.max(...this.channels.map(channel => channel.bottom()))}`;
        }
        this._onResize();
        //
        this.channelIdCounter = Math.max(this.channelIdCounter, state.id + 1);
    }
    deleteChannel(state: state.ChannelState) {
        const channel = this.findChannelById(state.id);
        if (channel === undefined) return;
        channel.delete();
        const idx = this.channels.findIndex(x => x.state.id === channel.state.id);
        this.channels.splice(idx, 1);
        this.resizeChannel(null);
    }
    createTimelineAnnotation(state: state.TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        const annotation = channel.addAnnotation(state);
        this.annotations[state.id] = annotation;
        this.summary.createTimelineAnnotation(annotation.state);
    }
    updateTimelineAnnotation(state: state.TimelineAnnotationState): boolean {
        const annotation = this.annotations[state.id];
        const oldChannel = annotation.channel;
        const newChannel = this.findChannelById(state.channelId);
        if (newChannel === undefined) return false;
        oldChannel.removeAnnotation(annotation);
        annotation.state = state;
        newChannel.insertAnnotation(annotation);
        if (oldChannel.state.id !== newChannel.state.id) {
            annotation.changeChannel(newChannel);
        }
        annotation.draw();
        this.summary.updateTimelineAnnotation(state);
        return true
    }
    deleteTimelineAnnotation(state: state.TimelineAnnotationState) {
        const channel = this.findChannelById(state.channelId);
        if (channel === undefined) return;
        channel.removeAnnotation(this.annotations[state.id]);
        this.annotations[state.id].delete();
        delete this.annotations[state.id];
    }
    selectTimelineAnnotation(state: state.TimelineAnnotationState) {
        this.summary.selectTimelineAnnotation(state);
        this.selectedTimelineAnnotation = this.annotations[state.id].select();
    }
    deselectTimelineAnnotation(state: state.TimelineAnnotationState) {
        this.annotations[state.id].deselect();
        this.summary.deselectTimelineAnnotation(state);
        this.selectedTimelineAnnotation = null;
    }

    timeUpdate(milliseconds: number) {
        this.indexCursor.updateTime(milliseconds);
        this.summary.indexCursor.updateTime(milliseconds);
    }


    //-------------------------------------------------------------------------
    // Helper
    //-------------------------------------------------------------------------

    likelyNumberOfAnnotationsInView() {return (Object.values(this.annotations).length * (this.widthInView() / this.width()))}
    leftInView() { return this.viewport.left }
    rightInView() { return this.viewport.right }
    widthInView() { return this.rightInView() - this.leftInView() }
    zoomFactor() { return this.viewport.scale.x }
    width() { return this.viewport.width }
    height() { return this.viewport.height }
    start() { return this.xscale.range[0]; }
    end() { return this.xscale.range[1]; }

    newChannelId() {return this.channelIdCounter++}

    addChild(child: PIXI.DisplayObject) {return this.viewport.addChild(child)}

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


    resizeChannel(channel: Channel | null) {
        let y = this.ruler.bottom;
        for (let _channel of this.channels) {
            _channel.y = y
            y = _channel.bottom();
            _channel.draw();
        }
        Object.values(this.annotations).forEach(a => a.draw());
    }

    drawChannelTree() {
        //
        //
        //
    }

    drawChannelTreePath(channel: Channel) {
        //const rootX = channel.
        //const rootY = channel.
        //const nodeX = channel.
        //const nodeY = channel.top() + channel.height/2;
        //const leafX = this.channelTree.width;
        //const leafY = nodeY;
    }

    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------

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
        this.viewport.on("mousedown", this._onPointerDown, this);
        this.viewport.on("rightdown", this._onRightDown, this);
        this.viewport.on("pointermove", this._onPointerMove, this);
        this.viewport.on("pointerup", this._onPointerUp, this);
        this.timelineApp.view.addEventListener("contextmenu", (event) => {
            event.preventDefault();
        });
        this.timelineApp.view.addEventListener("wheel", (event) => {
            event.preventDefault();
        });
    }
    _onZoomed() {
        if (this.selectedTimelineAnnotation !== null) {
            this.selectedTimelineAnnotation.zoomScale(this.viewport.scale.x);
        }
        if (this.hoveredTimelineAnnotation !== null && this.hoveredTimelineAnnotation !== this.selectedTimelineAnnotation) {
            this.hoveredTimelineAnnotation.zoomScale(this.viewport.scale.x);
        }
        this.mouseCursor.zoomScale(this.viewport.scale.x);
        this.indexCursor.zoomScale(this.viewport.scale.x);
    }
    _onMoved() {
        this.ruler.zoomScale(this.viewport.scale.x);
        this.summary.draw();
        this.channels.forEach(c => c.zoomPan());

        const showAllAnnotations = this.likelyNumberOfAnnotationsInView() < 5000;
        if (!showAllAnnotations) {
            if (this.showingAnnotationText) {
                Object.values(this.annotations).forEach(annotation => {annotation.hideText()});
                this.showingAnnotationText = false;
            }
        } else {
            Object.values(this.annotations).forEach(annotation => {
                if (!this.showingAnnotationText) {
                    annotation.showText();
                }
                annotation.zoomScale(this.viewport.scale.x);
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
    _onPointerDown(event: PIXI.InteractionEvent) {
        this.whichButtonDown = 0;
        this.mouseDown = true;
        this.mouseDownX = this._rectifyX(event.data.global.x);
        this.mouseDownY = event.data.global.y;
        const timeMs = this.xscale.call(this.mouseDownX);
        this.events.updateTime.forEach(f => f(timeMs));
        const annotations = this.findTimelineAnnotations(this.mouseDownX, this.mouseDownY);
        if (this._isOnRuler(event.data.global.y)) {
            this.rulerDrag = true;
            this.viewport.drag(undefined);
        }
        if (annotations.length == 0) {
            this._onCursorChange(this.mouseDownX, this.mouseDownY, annotations);
            return;
        }
        if (this.selectedTimelineAnnotation !== null && this.selectedTimelineAnnotation.state.id !== annotations[0].state.id && !this.selectedTimelineAnnotation.boundDragging) {
            const state = this.selectedTimelineAnnotation.state;
            this.events["deselectTimelineAnnotation"].forEach(f => f(state));
        }
        const state = annotations[0].state;
        this.events["selectTimelineAnnotation"].forEach(f => f(state));
        this.selectedTimelineAnnotation = this.annotations[state.id];
        this.draggingTimelineAnnotation = this.selectedTimelineAnnotation;
        this.draggingTimelineAnnotation.startDrag();
        if (this.selectedTimelineAnnotation !== null) {
            this.targetMouseDownX = this.selectedTimelineAnnotation.x();
            this.targetMouseDownY = this.selectedTimelineAnnotation.y();
        }
        this.viewport.drag(undefined);
        this._onCursorChange(this.mouseDownX, this.mouseDownY, annotations);
    }
    _onRightDown(event: PIXI.InteractionEvent) {
        // same as pointer down but without changing time
        this.whichButtonDown = 1;
        this.mouseDown = true;
        this.mouseDownX = this._rectifyX(event.data.global.x);
        this.mouseDownY = event.data.global.y;
        const annotations = this.findTimelineAnnotations(this.mouseDownX, this.mouseDownY);
        if (this._isOnRuler(event.data.global.y)) {
            this.rulerDrag = true;
            this.viewport.drag(undefined);
        }
        if (annotations.length == 0) {
            this._onCursorChange(this.mouseDownX, this.mouseDownY, annotations);
            return;
        }
        if (this.selectedTimelineAnnotation !== null && this.selectedTimelineAnnotation.state.id !== annotations[0].state.id && !this.selectedTimelineAnnotation.boundDragging) {
            const state = this.selectedTimelineAnnotation.state;
            this.events["deselectTimelineAnnotation"].forEach(f => f(state));
        }
        const state = annotations[0].state;
        this.events["selectTimelineAnnotation"].forEach(f => f(state));
        this.selectedTimelineAnnotation = this.annotations[state.id];
        this.draggingTimelineAnnotation = this.selectedTimelineAnnotation;
        this.draggingTimelineAnnotation.startDrag();
        if (this.selectedTimelineAnnotation !== null) {
            this.targetMouseDownX = this.selectedTimelineAnnotation.x();
            this.targetMouseDownY = this.selectedTimelineAnnotation.y();
        }
        this.viewport.drag(undefined);
        this._onCursorChange(this.mouseDownX, this.mouseDownY, annotations);
    }
    _onPointerMove(event: PIXI.InteractionEvent) {
        const x = this._rectifyX(event.data.global.x);
        const y = event.data.global.y;
        if (this.mouseDown && this.whichButtonDown === 0) {
            const timeMs = this.xscale.call(x);
            this.events.updateTime.forEach(f => f(timeMs));
            this.indexCursor.updateTime(this.xscale.call(x));
            this.summary.indexCursor.updateTime(this.xscale.call(x));
        }
        const annotations = this.findTimelineAnnotations(x, y);
        this._onMove(x, y, annotations);
        this._onDrag(x, y, annotations);
        this._onHover(x, y, annotations);
        this._onCursorChange(x, y, annotations);
        this._onIndexChange(x, y);
    }
    _onMove(x: number, y: number, annotations: TimelineAnnotation[]) {
        this.mouseCursor.updateTime(this.xscale.call(x));
    }
    _onDrag(x: number, y: number, annotations: TimelineAnnotation[]) {
        if (this.draggingTimelineAnnotation === null || this.draggingTimelineAnnotation.boundDragging) return;
        this.draggingTimelineAnnotation.drag(
            this.targetMouseDownX + x - this.mouseDownX,
            this.targetMouseDownY + y - this.mouseDownY,
            x, y
        );
    }
    _onHover(x: number, y: number, annotations: TimelineAnnotation[]) {
        if (annotations.length === 0) {
            this.hoveredTimelineAnnotation?.unhover();
            this.selectedTimelineAnnotation?.unhover();
            this.hoveredTimelineAnnotation = null;
            return;
        }
        // make sure to unhover an annotation which is no longer hovered over
        if (annotations[0].state.id !== this.hoveredTimelineAnnotation?.state?.id) {
            this.hoveredTimelineAnnotation?.unhover();
        }
        this.hoveredTimelineAnnotation = annotations[0].hover();
    }
    _onPointerUp(event: PIXI.InteractionEvent) {
        this.whichButtonDown = -1;
        this.mouseDown = false;
        this.viewport.drag({ direction: 'x', mouseButtons: 'all' });
        this.stopDrag();
        this.summary.stopDrag();
        const x = this._rectifyX(event.data.global.x)
        const y = event.data.global.y
        const annotations = this.findTimelineAnnotations(x, y);
        this._onCursorChange(x, y, annotations);
    }
    _onResize() {
        const height = this.ruler.height + this.channels.reduce((acc, c) => acc + c.height, 0);
        this.timelineApp.view.style.height = `${height}px`;
        this.renderer.view.height = this.timelineApp.view.height;
        this.renderer.screen.height = this.timelineApp.view.height;
        this.viewport.screenHeight = this.timelineApp.view.height;
        this.mouseCursor.resize();
        this.indexCursor.resize();
    }
    _onCursorChange(x: number, y: number, annotations: TimelineAnnotation[]) {
        if (this.draggingTimelineAnnotation !== null) {
            // @ts-ignore
            if (this.selectedTimelineAnnotation.boundDragging) {
                this.changeCursor("col-resize");
            } else {
                this.changeCursor("grabbing");
            }
            return;
        }
        if (this.rulerDrag) {
            this.changeCursor("text");
            return;
        }
        if (this.selectedTimelineAnnotation !== null && annotations.length > 0 && annotations[0] === this.selectedTimelineAnnotation) {
            if (this.selectedTimelineAnnotation.boundHover) {
                this.changeCursor("ew-resize");
            } else {
                this.changeCursor("grab");
            }
            return;
        }
        if (this.hoveredTimelineAnnotation !== null) {
            this.changeCursor("pointer");
            return;
        }
        if (this._isOnRuler(y)) {
            this.changeCursor("text");
            return;
        }
        if (this.mouseDown) {
            this.changeCursor("all-scroll");
            return;
        }
        this.changeCursor("default");
    }
    _onIndexChange(x: number, y: number) {
        if (!this.rulerDrag) return;
        this.viewport.drag(undefined);
        this.indexCursor.updateTime(this.xscale.call(x));
        this.summary.indexCursor.updateTime(this.xscale.call(x));
    }

    stopDrag() {
        this.rulerDrag = false;
        if (this.selectedTimelineAnnotation !== null) {
            this.selectedTimelineAnnotation._pointerUp();
        }
        if (this.draggingTimelineAnnotation !== null) {
            const newState = this.draggingTimelineAnnotation.state;
            const oldState = this.draggingTimelineAnnotation.oldState;
            if (newState.startTime != oldState.startTime || newState.endTime != oldState.endTime) {
                this.events["updateTimelineAnnotation"].forEach(f => f(newState, oldState, true))
            }
            this.draggingTimelineAnnotation = null;
        }
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
    constructor(summaryControls: HTMLDivElement, summaryMainContainer: HTMLDivElement, timeline: Timeline, opts: PIXI.IApplicationOptions) {
        this.timeline = timeline;
        this.xscale = timeline.xscale;
        // view
        // <div>
        //   <div class='controls'>
        //     <div class="beholder-summary-panel"></div>
        //   </div>
        //   <div class='main'>
        //     <canvas/>
        //   </div>
        // </div>
        const panel = document.createElement("div");
        panel.style.background = "black";
        panel.style.height = `${summaryHeight}px`;
        panel.setAttribute("class", "beholder-summary-panel");
        summaryControls.appendChild(panel);

        const canvas = document.createElement("canvas");
        summaryMainContainer.appendChild(canvas);

        opts.view = canvas;
        opts.width = this.timeline.timelineApp.view.getBoundingClientRect().width;
        opts.height = summaryHeight;

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

    createTimelineAnnotation(annotation: state.TimelineAnnotationState) {
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
    removeTimelineAnnotation(annotation: state.TimelineAnnotationState) {
        this.annotations[annotation.id].destroy();
        delete this.annotations[annotation.id];
    }

    selectTimelineAnnotation(annotation: state.TimelineAnnotationState) {
        this.annotations[annotation.id].tint = 0xff0000;
        this.annotations[annotation.id].alpha = 0.5;
    }
    deselectTimelineAnnotation(annotation: state.TimelineAnnotationState) {
        this.annotations[annotation.id].tint = annotationColor;
        this.annotations[annotation.id].alpha = 0.1;
    }
    updateTimelineAnnotation(annotation: state.TimelineAnnotationState) {
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

    addChild(child: PIXI.DisplayObject) {return this.app.stage.addChild(child)}

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

    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------

    _bindEvents() {
        this.app.stage.on("pointerdown", this._onPointerDown, this);
        this.app.stage.on("pointermove", this._onPointerMove, this);
        this.app.stage.on("pointerup", this._onPointerUp, this);
    }

    _onPointerDown(event: PIXI.InteractionEvent) {
        const x = event.data.global.x;
        const y = event.data.global.y;
        if (this.window.y <= y && y <= this.window.y + this.window.height && this.window.x <= x && x <= this.window.x + this.window.width) {
            this.dragging = true;
            this.mouseDownX = event.data.global.x;
            this.mouseDownY = event.data.global.y;
            this.targetMouseDownX = event.target.x;
            this.targetMouseDownY = event.target.y;
        }
        if (this._isOnRuler(y)) {
            this.rulerDrag = true;
        }
    }

    _isOnRuler(y: number) {return this.ruler.top <= y && y <= this.ruler.bottom}

    _onPointerMove(event: PIXI.InteractionEvent) {
        if (this.rulerDrag) {
            const time = this.xscale.call(event.data.global.x);
            this.indexCursor.updateTime(time);
            this.timeline.events["updateTime"].forEach(f => f(time));
        }
        if (!this.dragging) return;
        this.window.x = this.targetMouseDownX + event.data.global.x - this.mouseDownX;
        this.timeline.viewport.left = this.window.x;
        this.timeline._onMoved();
    }

    _onPointerUp(event: PIXI.InteractionEvent) {
        this.stopDrag();
        this.timeline.stopDrag();
    }
    stopDrag() {
        this.dragging = false;
        this.rulerDrag = false;
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
    resize() {this.initDraw()}
    zoomScale(scale: number) {this.cursor.width = 1 / scale}
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

export class Ruler {
    // definitional attributes
    public timeline: TimelineLike
    public scale: Scale
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
    public panel: HTMLDivElement | null = null

    constructor(timeline: TimelineLike) {
        this.timeline = timeline;
        this.scale = this.findBestScale();
        this.ticks = [];
        this.labels = [];
        //
        this.top = this.y = 0;
        this.height = 25;
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
            this.panel = document.createElement("div");
            this.panel.setAttribute("class", "beholder-channel-panel");
            this.panel.style.height = `${this.height}px`;
            this.panel.style.width = `100px`;
            this.panel.style.background = `blue`;
            this.panel.style.border = `1 black`;
            this.panel.addEventListener("resize", (event) => {
                if (this.panel !== null) {
                    this.height = this.panel.getBoundingClientRect().height;
                    this.draw();
                }
            })
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

    left() {return this.timeline.leftInView()}
    right() {return this.timeline.rightInView()}
    width() {return this.right() - this.left()}

    //-------------------------------------------------------------------------
    // view
    //-------------------------------------------------------------------------

    // view
    initView() {
        //this.timeline.channelContainer.addChild(this.border);
        if (this.timeline instanceof Timeline && this.panel !== null) {
            this.timeline.channelPanel.appendChild(this.panel);
        }
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
        if (!(scale.name === this.scale.name && this.leftMostTick.x <= this.timeline.leftInView() && this.timeline.rightInView() <= this.rightMostTick.x)) {
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
            this.channel.timeline.resizeChannel(this.channel);
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
        this.channel.timeline.resizeChannel(this.channel);
        this.minimized = true;
        this.minmaxButton.innerHTML = "+";

        this.deleteButton.style.display = "none";
        this.childButton.style.display = "none";
    }

    maximize() {
        this.channel.height = (this.oldHeight === -1) ? 50 : this.oldHeight;
        this.rootElem.style.height = `${this.channel.height}px`;
        this.channel.timeline.resizeChannel(this.channel);
        this.minimized = false;
        this.minmaxButton.innerHTML = "-";

        this.deleteButton.style.display = "inline";
        this.childButton.style.display = "inline";
    }
}

export class Channel {
    //
    public timeline: Timeline
    public state: state.ChannelState
    private timelineAnnotationTree: IntervalTree<state.TimelineAnnotationState>
    private panel: ChannelPanel

    // 
    private annotationIds: Set<number> = new Set([])
    public left: number = 0
    public right: number = 0
    public y: number
    public width: number
    public height: number

    // view
    private border: PIXI.Graphics
    private backgroundSprite: PIXI.Sprite = new PIXI.Sprite();
    private backgroundImg: HTMLImageElement | null = null
    private backgroundCanvas: HTMLCanvasElement | null = null
    private backgroundScale: Scale | null = null

    constructor(state: state.ChannelState, timeline: Timeline) {
        //
        this.state = state;
        this.timeline = timeline;
        this.timelineAnnotationTree = new IntervalTree();

        //
        this.width = this.timeline.timelineApp.screen.width;
        this.height = 50;
        this.y = Math.max(this.timeline.ruler.bottom, Math.max(...this.timeline.channels.map(channel => channel.bottom())));
        this.panel = new ChannelPanel(this);
        // view
        this.border = new PIXI.Graphics();
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

    //

    top() { return this.y }
    bottom() { return this.y + this.height; }

    //

    findTimelineAnnotations(x: number, y: number): TimelineAnnotation[] {
        return this.timelineAnnotationTree.search(x, x).map(state => this.timeline.annotations[state.id]);
    }

    // state
    addAnnotation(state: state.TimelineAnnotationState): TimelineAnnotation {
        const annotation = new TimelineAnnotation(state, this.timeline, this);
        this.insertAnnotation(annotation);
        this.annotationIds.add(state.id);
        return annotation;
    }
    insertAnnotation(annotation: TimelineAnnotation): boolean {
        this.annotationIds.add(annotation.state.id);
        return this.timelineAnnotationTree.insert(annotation.start(), annotation.end(), annotation.state);
    }
    removeAnnotation(annotation: TimelineAnnotation): boolean {
        this.annotationIds.delete(annotation.state.id);
        return this.timelineAnnotationTree.remove(annotation.start(), annotation.end(), annotation.state);
    }

    // view
    initView() {
        this.timeline.channelContainer.addChild(this.border);
        this.timeline.channelContainer.addChild(this.backgroundSprite);
        this.timeline.channelPanel.appendChild(this.panel.rootElem);
        this.draw();
    }
    draw() {
        this.border.position.set(0, this.bottom());
        this.border.lineStyle(1, 0x919191).moveTo(0, 0).lineTo(this.width, 0);
        this.drawBackground();
    }
    initBackground() {
        if (this.backgroundImg === null) return;
        this.backgroundCanvas = document.createElement("canvas");
        this.backgroundCanvas.width = 4096;
        this.backgroundCanvas.height = this.backgroundImg.height;
        this.backgroundScale = new LinearScale([0, this.backgroundImg.width], this.timeline.xscale.domain);
        this.backgroundSprite.y = this.top();
        this.drawBackground();
    }
    drawBackground() {
        if (this.state.background === null) return;
        if (this.backgroundCanvas === null) return;
        if (this.backgroundImg === null) return;
        if (this.backgroundScale === null) return;
        if (this.backgroundSprite === null) return;
        this.backgroundCanvas.height = this.backgroundImg.height;
        this.backgroundSprite.height = this.height;
        this.backgroundSprite.y = this.top();
        const ctx = this.backgroundCanvas.getContext("2d");
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
    //
    zoomPan() {
        this.drawBackground();
    }
    //
    delete() {
        this.panel.rootElem.remove();
        this.border.destroy();
        this.backgroundSprite.destroy();
        if (this.backgroundImg !== null) {
            this.backgroundImg.remove();
        }
        if (this.backgroundCanvas !== null) {
            this.backgroundCanvas.remove();
        }
    }

}

const dummyText = new PIXI.Text("a", { fontSize: 12, fontFamily: "\"Lucida Console\", Monaco, monospace"});
const ellipsis = "…";
export class TimelineAnnotation {
    // definitional attributes
    public state: state.TimelineAnnotationState
    public oldState: state.TimelineAnnotationState
    public timeline: Timeline;
    public channel: Channel;

    //---------------------------------
    // helper attributes
    //---------------------------------
    private mouseDownX: number = -1
    private targetMouseDownX: number = -1
    public boundDragging: boolean = false
    public boundHover: boolean = false
    private target: PIXI.Sprite | null = null
    private over: boolean = false
    private selected: boolean = false

    private margin: number = 3;

    //---------------------------------
    // view attributes
    //---------------------------------
    private sprite: PIXI.Sprite
    private left: PIXI.Sprite
    private right: PIXI.Sprite
    private textStyle: any = {fontSize: 12, fontFamily: "\"Lucida Console\", Monaco, monospace"};
    private text: PIXI.Text

    constructor(state: state.TimelineAnnotationState, timeline: Timeline, channel: Channel) {
        this.oldState = this.state = state;
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

    //-------------------------------------------------------------------------
    // Stateful
    //-------------------------------------------------------------------------

    delete() {
        this.sprite.destroy();
        this.left.destroy();
        this.right.destroy();
        this.text.destroy();
    }

    changeChannel(channel: Channel) {
        this.channel = channel;
        this.sprite.y = this.channel.top() + this.margin;
        this.text.y = this.middleY();
        if (this.left !== null) {
            this.left.y = this.y();
        }
        if (this.right !== null) {
            this.right.y = this.y();
        }
    }

    //-------------------------------------------------------------------------
    // Helpers
    //-------------------------------------------------------------------------
    x() { return this.timeline.xscale.inv(this.state.startTime) }
    y() { return this.sprite.y }
    top() { return this.channel.top() + this.margin }
    bottom() { return this.channel.bottom }
    middleX() { return this.start() + this.width() / 2 }
    middleY() { return this.y() + this.height() / 2 }
    width() { return this.end() - this.start() }
    height() { return this.channel.height - 2 * this.margin }
    start() { return this.timeline.xscale.inv(this.state.startTime); }
    end() { return this.timeline.xscale.inv(this.state.endTime); }
    leftBarPosition() {return this.start()}
    rightBarPosition() {return this.end() - (this.over ? 4 : 1) / this.timeline.zoomFactor()}

    //-------------------------------------------------------------------------
    // View
    //-------------------------------------------------------------------------
    initView() {
        this.sprite.tint = annotationColor;
        this.sprite.alpha = 0.5;

        this.left.tint = annotationBarColor;
        this.left.interactive = true;
        this.left.zIndex = 100;

        this.right.tint = annotationBarColor;
        this.right.interactive = true;
        this.right.zIndex = 100;

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
    }
    zoomScale(xScale: number) {
        const width = (this.over ? 4 : 1) / xScale;
        this.left.width = width;
        this.right.width = width;
        this.right.x = this.rightBarPosition();
        this.text.scale.x = 1 / xScale;
        this.textVisibility();
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
                       ? this.state.value.slice(0, numChars) + ellipsis
                       : this.state.value;
        this.text.visible = true;
    }
    hideText() {this.text.visible = false}
    showText() {this.text.visible = true}
    //-------------------------------------------------------------------------
    // Events
    //-------------------------------------------------------------------------
    _bindEvents() {
        this.left.on("pointerdown", this._pointerDown, this);
        this.left.on("pointermove", this._pointerMove, this);
        this.left.on("pointerup", this._pointerUp, this);
        this.left.on("pointerover", this._pointerOver, this);
        this.left.on("pointerout", this._pointerOut, this);

        this.right.on("pointerdown", this._pointerDown, this);
        this.right.on("pointermove", this._pointerMove, this);
        this.right.on("pointerup", this._pointerUp, this);
        this.right.on("pointerover", this._pointerOver, this);
        this.right.on("pointerout", this._pointerOut, this);
    }

    _pointerDown(event: PIXI.InteractionEvent) {
        this.boundDragging = true;
        this.mouseDownX = this.timeline._rectifyX(event.data.global.x);
        if (event.target === this.left) {
            this.targetMouseDownX = this.left.x;
            this.target = this.left;
        } else if (event.target === this.right) {
            this.targetMouseDownX = this.right.x;
            this.target = this.right;
        }
    }
    _pointerMove(event: PIXI.InteractionEvent) {
        const x = this.timeline._rectifyX(event.data.global.x);
        if (this.boundDragging) {
            let newState;
            if (this.target === this.left) {
                newState = this._moveLeft(x);
            } else if (this.target === this.right) {
                newState = this._moveRight(x);
            }
            this.timeline.events["updateTimelineAnnotation"].forEach(f => f(newState, this.oldState, false));
        }
        this.over = false;
    }
    _pointerUp() {
        this.boundDragging = false;
        this.target = null;
    }
    _moveLeft(x: number): state.TimelineAnnotationState {
        const newState = deepCopy(this.state);
        newState.startTime = this.timeline.xscale.call(this.targetMouseDownX + x - this.mouseDownX);
        if (newState.endTime < newState.startTime) {
            const tmp = newState.startTime;
            newState.startTime = newState.endTime;
            newState.endTime = tmp;
            this.target = this.right;
        }
        return newState
    }
    _moveRight(x: number): state.TimelineAnnotationState {
        const newState = deepCopy(this.state);
        newState.endTime = this.timeline.xscale.call(this.targetMouseDownX + x - this.mouseDownX);
        if (newState.endTime < newState.startTime) {
            const tmp = newState.startTime;
            newState.startTime = newState.endTime;
            newState.endTime = tmp;
            this.target = this.left;
        }
        return newState
    }
    _pointerOver() {this.boundHover = true;}
    _pointerOut() {this.boundHover = false;}


    drag(xDiff: number, yDiff: number, x: number, y: number) {
        const newState = deepCopy(this.state);
        // calculate x diff
        let diff = this.timeline.xscale.call(xDiff) - this.state.startTime;
        if (diff <= 0) {
            diff = Math.max(this.timeline.start() - this.state.startTime, diff);
        } else {
            diff = Math.min(this.timeline.end() - this.state.endTime, diff);
        }
        newState.startTime += diff;
        newState.endTime += diff;
        // calculate new channel
        const channel = this.timeline.findChannel(x, y);
        if (channel !== undefined) {
            newState.channelId = channel.state.id;
        }
        this.timeline.events["updateTimelineAnnotation"].forEach(f => f(newState, this.oldState, false));
    }
    dragend() {}

    startDrag() {this.oldState = deepCopy(this.state);}

    select() {
        this.sprite.tint = annotationSelectColor;
        this.timeline.dragContainer.addChild(this.left);
        this.timeline.dragContainer.addChild(this.right);
        this.selected = true;
        this.draw();
        return this;
    }

    deselect() {
        this.sprite.tint = annotationColor;
        this.timeline.dragContainer.removeChildAt(this.timeline.dragContainer.getChildIndex(this.left));
        this.timeline.dragContainer.removeChildAt(this.timeline.dragContainer.getChildIndex(this.right));
        this.selected = false;
        this.draw();
        return this;
    }

    hover() {
        if (!this.selected) {
            this.sprite.tint = annotationHoverColor;
        }
        this.over = true;
        this.zoomScale(this.timeline.zoomFactor());
        return this;
    }

    unhover() {
        if (this.timeline.selectedTimelineAnnotation !== this) {
            this.sprite.tint = annotationColor;
        }
        this.over = false;
        this.zoomScale(this.timeline.zoomFactor());
        return this;
    }
}
